/*
 * Campanhas de WhatsApp. Não existe integração com a API do WhatsApp neste ambiente:
 * confirmar registra a campanha e fixa os destinatários, mas nenhuma mensagem sai e nenhum evento
 * de entrega é inventado. Os números do histórico vêm só dos dados de exemplo.
 */
import { changed, db, ensure, me, newId, nowIso, wait } from "../db";
import { evaluate, type AudienceResult } from "../../campaign/audience";
import { checkVars, templateBlock, varsOf } from "../../campaign/message";
import { planSend, realNow } from "../../campaign/schedule";
import type { Audience, Campaign, CampaignDraft, CampaignRecipient, Channel, SavedAudience } from "../types";

const KEY = "tch-campanhas-v1";
let loaded = false;
/** Rascunhos, campanhas e públicos salvos ficam neste navegador até existir o Supabase. */
export function loadCampaigns() {
  if (loaded || typeof localStorage === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const s = JSON.parse(raw) as { campaigns?: Campaign[]; audiences?: SavedAudience[] };
    if (Array.isArray(s.campaigns) && s.campaigns.every((c) => c && typeof c.id === "string" && c.audience && Array.isArray(c.recipients))) db.campaigns.splice(0, db.campaigns.length, ...s.campaigns);
    if (Array.isArray(s.audiences) && s.audiences.every((a) => a && typeof a.id === "string" && a.audience)) db.audiences.splice(0, db.audiences.length, ...s.audiences);
  } catch { /* ilegível: segue com o exemplo */ }
}
function commit<T>(change: () => T): T {
  const before = structuredClone({ c: db.campaigns, a: db.audiences });
  try {
    const r = change();
    if (typeof localStorage !== "undefined") {
      try { localStorage.setItem(KEY, JSON.stringify({ campaigns: db.campaigns, audiences: db.audiences })); }
      catch { throw new Error("O navegador não permitiu salvar. O rascunho continua na tela; tente de novo."); }
    }
    changed();
    return r;
  } catch (e) { db.campaigns.splice(0, db.campaigns.length, ...before.c); db.audiences.splice(0, db.audiences.length, ...before.a); throw e; }
}

export interface CampaignStats { total: number; sent: number; delivered: number; read: number; replied: number; left: number; failed: number; queued: number; cost: number | null }
export type CampaignView = Campaign & { stats: CampaignStats };
const STEP: Record<CampaignRecipient["status"], number> = { "Na fila": 0, Falhou: 1, Enviada: 1, Entregue: 2, Lida: 3, Saiu: 3, Respondeu: 4 };
function statsOf(c: Campaign): CampaignStats {
  const n = (k: number) => c.recipients.filter((r) => STEP[r.status] >= k).length, rate = c.costPerMessage ?? null;
  return { total: c.recipients.length, sent: n(1), delivered: n(2), read: n(3), replied: n(4), left: c.recipients.filter((r) => r.status === "Saiu").length, failed: c.recipients.filter((r) => r.status === "Falhou").length, queued: c.recipients.filter((r) => r.status === "Na fila").length, cost: rate === null ? null : n(2) * rate };
}
const view = (c: Campaign): CampaignView => ({ ...structuredClone(c), stats: statsOf(c) });
const find = (id: string) => { loadCampaigns(); const c = db.campaigns.find((x) => x.id === id); if (!c) throw new Error("Campanha não encontrada."); return c; };
export async function listCampaigns() { await wait(); ensure("campaigns"); loadCampaigns(); return db.campaigns.map(view); }
export async function getCampaign(id: string) { await wait(); ensure("campaigns"); return view(find(id)); }

/* ---------- remetente ---------- */
export interface Sender extends Channel { problem?: string }
/** Números de WhatsApp cadastrados em Configurações › Canais. O estado é o cadastrado; não há consulta à Meta. */
export async function listSenders(): Promise<Sender[]> {
  await wait(); ensure("campaigns");
  return db.settings.channels.filter((c) => c.type === "whatsapp").map((c) => ({ ...c, ...(c.status !== "Conectado" ? { problem: c.status === "Pendente" ? "A conexão deste número ainda não foi concluída." : "O número está com erro de conexão." } : {}) }));
}
/** Conversas por dia do número, lido do cadastro ("1.000 conversas por dia"). */
export const dailyLimit = (c?: Channel) => { const m = /([\d.]+)\s*conversas/.exec(c?.limit ?? ""); return m ? Number(m[1].replace(/\./g, "")) : null; };

/* ---------- público ---------- */
export async function evaluateAudience(a: Audience): Promise<AudienceResult> { await wait(); ensure("campaigns"); loadCampaigns(); return evaluate(a); }
export interface SavedOption { id: string; name: string; kind: "dinamico" | "lista"; audience: Audience; eligible: number; updatedAt?: string }
/** Públicos salvos (critérios) e listas fixas (montadas em Contatos). */
export async function listAudiences(): Promise<SavedOption[]> {
  await wait(); ensure("campaigns"); loadCampaigns();
  const lists = [...new Set(db.contacts.flatMap((c) => c.lists))].sort();
  return [
    ...db.audiences.map((s) => ({ id: s.id, name: s.name, kind: "dinamico" as const, audience: structuredClone(s.audience), eligible: evaluate(s.audience).eligible, updatedAt: s.updatedAt })),
    ...lists.map((l) => { const audience: Audience = { match: "todas", rules: [{ id: newId("ar"), field: "lista", op: "inclui", values: [l] }], excludeTags: [], excludeAudiences: [], excludeContacts: [] }; return { id: `lista:${l}`, name: l, kind: "lista" as const, audience, eligible: evaluate(audience).eligible }; }),
  ];
}
export async function saveAudience(name: string, a: Audience) {
  await wait(); ensure("campaigns"); loadCampaigns();
  const n = name.trim();
  if (n.length < 3) throw new Error("Dê um nome ao público.");
  if (db.audiences.some((s) => s.name.toLowerCase() === n.toLowerCase())) throw new Error("Já existe um público com este nome.");
  const { savedId: _s, excludeContacts: _c, ...rest } = a; void _s; void _c;
  return commit(() => { const s: SavedAudience = { id: newId("pub"), name: n, audience: { ...structuredClone(rest), excludeContacts: [] }, updatedAt: nowIso() }; db.audiences.push(s); return s; });
}

/* ---------- rascunho e confirmação ---------- */
export async function saveCampaignDraft(d: CampaignDraft): Promise<{ id: string; savedAt: string }> {
  await wait(); ensure("campaigns"); loadCampaigns();
  if (!d.name.trim()) throw new Error("Dê um nome à campanha.");
  const cur = d.id ? find(d.id) : undefined;
  if (cur && cur.status !== "Rascunho") throw new Error("Esta campanha já foi confirmada e não pode mais ser editada.");
  const savedAt = realNow().toISOString(), id = cur?.id ?? newId("camp"); // hora real, como o agendamento
  return commit(() => {
    const c: Campaign = { ...structuredClone(d), id, name: d.name.trim(), status: "Rascunho", audienceLabel: db.audiences.find((s) => s.id === d.audience.savedId)?.name ?? "Público personalizado", recipients: [], savedAt };
    const i = db.campaigns.findIndex((x) => x.id === id);
    if (i >= 0) db.campaigns[i] = c; else db.campaigns.unshift(c);
    return { id, savedAt };
  });
}
export interface Readiness { problems: { step: "configuracao" | "publico" | "mensagem" | "envio"; text: string }[]; eligible: number; plan: ReturnType<typeof planSend> }
/** Tudo que precisa valer para confirmar. A tela e a confirmação usam a mesma checagem. */
export function readiness(d: CampaignDraft, now = realNow()): Readiness {
  loadCampaigns();
  const problems: Readiness["problems"] = [], sender = db.settings.channels.find((c) => c.id === d.senderId && c.type === "whatsapp");
  if (!d.name.trim()) problems.push({ step: "configuracao", text: "Dê um nome à campanha." });
  if (!sender) problems.push({ step: "configuracao", text: "Escolha o número remetente." });
  else if (sender.status !== "Conectado") problems.push({ step: "configuracao", text: `O número ${sender.handle} não está conectado.` });
  const aud = evaluate(d.audience);
  aud.problems.forEach((text) => problems.push({ step: "publico", text }));
  if (!aud.eligible) problems.push({ step: "publico", text: "Nenhum contato elegível neste público." });
  const t = db.templates.find((x) => x.id === d.templateId);
  if (!t) problems.push({ step: "mensagem", text: "Escolha um modelo aprovado." });
  else {
    const block = templateBlock(t, d.senderId);
    if (block) problems.push({ step: "mensagem", text: `${t.label ?? t.name}: ${block}` });
    checkVars(t, d.vars, aud.rows.filter((r) => r.eligible).map((r) => r.contactId)).forEach((v) => v.problem && problems.push({ step: "mensagem", text: `{{${v.name}}}: ${v.problem}` }));
    if (t.buttons.length !== d.replies.buttons.length || t.buttons.some((b, i) => d.replies.buttons[i]?.text !== b)) problems.push({ step: "mensagem", text: "Os botões mudaram no modelo. Revise o que acontece em cada botão." });
    for (const b of d.replies.buttons) if (b.action !== "nada" && !b.value) problems.push({ step: "mensagem", text: `Botão “${b.text}”: complete a ação escolhida.` });
  }
  if (d.replies.owner === "transferir" && !db.users.some((u) => u.id === d.replies.ownerId && u.active)) problems.push({ step: "mensagem", text: "Escolha para quem encaminhar as respostas." });
  const plan = planSend(d.when, d.scheduledAt, now);
  if (!plan.ok) problems.push({ step: "envio", text: plan.reason ?? "Revise o horário." });
  void varsOf;
  return { problems, eligible: aud.eligible, plan };
}
/**
 * Confirma: revalida tudo com a hora real, confere se o público não mudou desde a revisão,
 * fixa os destinatários e agenda. Só funciona uma vez por campanha (evita envio duplicado).
 */
export async function confirmCampaign(id: string, expected: { eligible: number; sendAt: string }) {
  await wait(); ensure("campaigns");
  const c = find(id);
  if (c.status !== "Rascunho") throw new Error("Esta campanha já foi confirmada.");
  const r = readiness(c);
  if (r.problems.length) throw new Error(r.problems[0].text);
  if (r.eligible !== expected.eligible) throw new Error(`O público mudou: agora são ${r.eligible} contatos elegíveis (antes ${expected.eligible}). Revise e confirme de novo.`);
  const sendAt = r.plan.sendAt!;
  if (Math.abs(sendAt.getTime() - new Date(expected.sendAt).getTime()) > 60_000 && !r.plan.immediate) throw new Error("O horário de envio mudou desde a revisão. Confira e confirme de novo.");
  const rows = evaluate(c.audience).rows.filter((x) => x.eligible);
  return commit(() => Object.assign(find(id), {
    status: "Agendada", scheduledAt: sendAt.toISOString(), confirmedAt: realNow().toISOString(), confirmedBy: me().id, costPerMessage: db.settings.costs.marketing,
    audienceLabel: db.audiences.find((s) => s.id === c.audience.savedId)?.name ?? "Público personalizado",
    recipients: rows.map((x) => ({ contactId: x.contactId, name: x.name, phone: x.phone!, status: "Na fila" as const })),
  }));
}
export async function setCampaignStatus(id: string, status: "Pausada" | "Cancelada" | "retomar") {
  await wait(); ensure("campaigns");
  const c = find(id);
  if (c.status === "Concluída" || c.status === "Cancelada") throw new Error("Esta campanha já terminou.");
  commit(() => { find(id).status = status === "retomar" ? "Agendada" : status; });
}
export async function deleteDraft(id: string) { await wait(); ensure("campaigns"); if (find(id).status !== "Rascunho") throw new Error("Só rascunhos podem ser excluídos."); commit(() => { db.campaigns.splice(db.campaigns.findIndex((x) => x.id === id), 1); }); }
