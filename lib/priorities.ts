/*
 * "Onde agir hoje": pendências de agora, independentes do período do relatório.
 * Cada lead aparece uma vez, no motivo mais alto da ordem configurada; empate: quem espera há mais tempo.
 */
import type { ConversationView, DealView, Message, Settings, TaskView } from "./data/types";
import { DAY, now } from "./format";
import { sp } from "./campaign/schedule";

export type PriorityKind = "aguardando" | "tarefa_vencida" | "fechamento_proximo" | "proposta_sem_retorno" | "sem_atividade";
export const PRIORITY_LABEL: Record<PriorityKind, string> = { aguardando: "Aguardando resposta humana", tarefa_vencida: "Tarefa vencida", fechamento_proximo: "Fechamento próximo com pendência", proposta_sem_retorno: "Proposta sem retorno", sem_atividade: "Sem próxima atividade" };
export const DEFAULT_ORDER: PriorityKind[] = ["aguardando", "tarefa_vencida", "fechamento_proximo", "proposta_sem_retorno", "sem_atividade"];
export interface Priority { id: string; kind: PriorityKind; contactId: string; name: string; deal?: DealView; conversationId?: string; reason: string; since: string; ownerId: string | null; lastClient?: Message; autoReplied?: boolean; taskTitle?: string }

/** Última mensagem do cliente e se houve só resposta automática depois dela. */
export function clientTurn(v: ConversationView) {
  const talk = v.messages.filter((m) => m.kind !== "nota");
  const i = talk.map((m) => m.kind === "cliente" || !!m.authorId).lastIndexOf(true);
  const lastClient = [...talk].reverse().find((m) => m.kind === "cliente");
  return { lastClient, autoReplied: i >= 0 && talk.slice(i + 1).some((m) => m.kind === "equipe" && !m.authorId) };
}
export interface PriorityInput { convs: ConversationView[]; deals: DealView[]; tasks: TaskView[]; settings: Settings; order?: PriorityKind[]; ref?: Date }
export function priorities({ convs, deals, tasks, settings, order = DEFAULT_ORDER, ref = now() }: PriorityInput): Priority[] {
  const out: Priority[] = [], t = ref.getTime(), p = sp(ref), today = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  const soon = new Date(t + 7 * DAY), soonKey = `${sp(soon).y}-${String(sp(soon).m).padStart(2, "0")}-${String(sp(soon).d).padStart(2, "0")}`;
  const open = deals.filter((d) => d.status === "aberto"), waitingDeal = new Set(convs.filter((v) => v.waitingSince).map((v) => v.contactId));
  for (const v of convs) if (v.waitingSince) { const c = clientTurn(v); out.push({ id: `a${v.id}`, kind: "aguardando", contactId: v.contactId, name: v.contact.name, deal: v.deal?.status === "aberto" ? v.deal : undefined, conversationId: v.id, reason: c.autoReplied ? "Resposta automática enviada, sem atendimento humano" : "Aguardando resposta humana", since: v.waitingSince, ownerId: v.contact.ownerId, lastClient: c.lastClient, autoReplied: c.autoReplied }); }
  for (const k of tasks) if (!k.doneAt && new Date(k.dueAt).getTime() < t && k.contactId) { const d = open.find((x) => x.id === k.dealId); out.push({ id: `t${k.id}`, kind: "tarefa_vencida", contactId: k.contactId, name: k.contact?.name ?? "Contato", deal: d, conversationId: d?.conversationId, reason: `Tarefa vencida: ${k.title}`, since: k.dueAt, ownerId: k.ownerId, taskTitle: k.title }); }
  for (const d of open) {
    const base = { contactId: d.contactId, name: d.contact.name, deal: d, conversationId: d.conversationId, ownerId: d.ownerId };
    if (d.expectedCloseAt && d.expectedCloseAt <= soonKey && (!d.nextTask || waitingDeal.has(d.contactId))) out.push({ ...base, id: `f${d.id}`, kind: "fechamento_proximo", reason: `${d.expectedCloseAt < today ? "Previsão de fechamento vencida" : "Fechamento previsto"} em ${d.expectedCloseAt.split("-").reverse().slice(0, 2).join("/")}${d.nextTask ? ", cliente aguardando" : ", sem próxima atividade"}`, since: `${d.expectedCloseAt}T12:00:00.000Z` });
    if (d.stageId === "proposta" && !waitingDeal.has(d.contactId) && t - new Date(d.lastMessageAt).getTime() > settings.limits.stalledD * DAY) out.push({ ...base, id: `p${d.id}`, kind: "proposta_sem_retorno", reason: `Proposta sem retorno do cliente há mais de ${settings.limits.stalledD} dias`, since: d.lastMessageAt });
    if (!d.nextTask && !waitingDeal.has(d.contactId)) out.push({ ...base, id: `s${d.id}`, kind: "sem_atividade", reason: "Negócio aberto sem próxima atividade", since: d.lastMessageAt });
  }
  const rank = (k: PriorityKind) => { const i = order.indexOf(k); return i < 0 ? 99 : i; };
  out.sort((a, b) => rank(a.kind) - rank(b.kind) || a.since.localeCompare(b.since));
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.contactId) ? false : (seen.add(x.contactId), true)));
}
