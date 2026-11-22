import type { Automation } from "@/lib/data/types";

/** Que campo cada regra pede. */
export type Input = "nada" | "texto" | "longo" | "horas" | "dias" | "espera" | "valor" | "etapa" | "tag" | "responsavel" | "responsavel_rodizio" | "produto" | "origem" | "canal" | "horario" | "modelo" | "avisar" | "campanha" | "anuncio";
export interface RuleDef { type: string; label: string; input: Input; optional?: boolean; say: (v: string) => string }
const q = (v: string) => (v ? `“${v}”` : "…");

export const TRIGGERS: RuleDef[] = [
  { type: "mensagem", label: "Mensagem recebida", input: "texto", optional: true, say: (v) => (v ? `um cliente enviar mensagem com ${q(v)}` : "um cliente enviar mensagem") },
  { type: "lead", label: "Lead criado", input: "nada", say: () => "um lead for criado" },
  { type: "anuncio", label: "Lead veio de anúncio", input: "anuncio", optional: true, say: (v) => `um lead vier de anúncio${v ? ` de ${v.toLowerCase()}` : ""}` },
  { type: "etapa", label: "Etapa mudou", input: "etapa", say: (v) => `um negócio chegar a ${v || "…"}` },
  { type: "tag", label: "Tag adicionada", input: "tag", say: (v) => `a tag ${v || "…"} for adicionada` },
  { type: "sem_resposta", label: "Sem resposta há X horas", input: "horas", say: (v) => `o cliente ficar ${v || "…"} h sem responder` },
  { type: "tarefa_atrasada", label: "Tarefa atrasada", input: "nada", say: () => "uma tarefa atrasar" },
  { type: "pos_ganho", label: "X dias após fechado ganho", input: "dias", say: (v) => `passarem ${v || "…"} dias do fechamento` },
  { type: "botao", label: "Botão de campanha clicado", input: "texto", say: (v) => `o botão ${q(v)} de uma campanha for clicado` },
];
export const CONDITIONS: RuleDef[] = [
  { type: "canal", label: "Canal", input: "canal", say: (v) => `o canal for ${v || "…"}` }, { type: "etapa", label: "Etapa", input: "etapa", say: (v) => `a etapa for ${v || "…"}` },
  { type: "tag", label: "Tag", input: "tag", say: (v) => `tiver a tag ${v || "…"}` }, { type: "responsavel", label: "Responsável", input: "responsavel", say: (v) => `o responsável for ${v || "…"}` },
  { type: "valor", label: "Valor a partir de", input: "valor", say: (v) => `o valor for de R$ ${Number(v || 0).toLocaleString("pt-BR")} ou mais` }, { type: "produto", label: "Produto", input: "produto", say: (v) => `o produto for ${v || "…"}` },
  { type: "horario", label: "Horário comercial", input: "horario", say: (v) => `for ${(v || "…").toLowerCase()}` }, { type: "origem", label: "Origem", input: "origem", say: (v) => `a origem for ${v || "…"}` },
];
export const ACTIONS: RuleDef[] = [
  { type: "atribuir", label: "Atribuir responsável", input: "responsavel_rodizio", say: (v) => (v === "Rodízio" ? "atribuir por rodízio" : `atribuir a ${v || "…"}`) },
  { type: "etapa", label: "Mover de etapa", input: "etapa", say: (v) => `mover para ${v || "…"}` },
  { type: "tag_add", label: "Adicionar tag", input: "tag", say: (v) => `adicionar a tag ${v || "…"}` }, { type: "tag_del", label: "Remover tag", input: "tag", say: (v) => `remover a tag ${v || "…"}` },
  { type: "tarefa", label: "Criar tarefa", input: "texto", say: (v) => `criar tarefa de ${v || "…"}` },
  { type: "mensagem", label: "Enviar mensagem (dentro da janela)", input: "longo", say: () => "enviar mensagem" }, { type: "modelo", label: "Enviar modelo aprovado (fora da janela)", input: "modelo", say: (v) => `enviar o modelo ${v || "…"}` },
  { type: "notificar", label: "Notificar", input: "avisar", say: (v) => `avisar o ${(v || "…").toLowerCase()}` }, { type: "aguardar", label: "Aguardar", input: "espera", say: (v) => `aguardar ${v || "…"}` },
  { type: "lista", label: "Incluir em lista de campanha", input: "texto", say: (v) => `incluir na lista ${q(v)}` }, { type: "resumo", label: "Pedir resumo ao Assistente", input: "nada", say: () => "pedir um resumo ao Assistente" },
];
export const defOf = (list: RuleDef[], type: string) => list.find((d) => d.type === type) ?? list[0];
const join = (a: string[]) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} e ${a[a.length - 1]}`);
export type Draft = Pick<Automation, "name" | "trigger" | "conditions" | "actions">;
export const sayTrigger = (a: Pick<Draft, "trigger">) => defOf(TRIGGERS, a.trigger.type).say(a.trigger.value);
/** Regra em linguagem natural. */
export function sentence(a: Draft) {
  const cond = a.conditions.map((c) => defOf(CONDITIONS, c.type).say(c.value)), act = a.actions.map((c) => defOf(ACTIONS, c.type).say(c.value));
  return `Quando ${sayTrigger(a)}${cond.length ? ` e ${join(cond)}` : ""}, ${act.length ? join(act) : "…"}.`;
}
/** Campo obrigatório vazio, repetição de mensagem ou laço (a ação dispara o próprio gatilho). */
export function problems(a: Draft): string[] {
  const out: string[] = [];
  const empty = (d: RuleDef, v: string) => d.input !== "nada" && !d.optional && !v.trim();
  if (!a.name.trim()) out.push("Dê um nome à automação.");
  if (empty(defOf(TRIGGERS, a.trigger.type), a.trigger.value)) out.push("Complete o gatilho.");
  if (a.conditions.some((c) => empty(defOf(CONDITIONS, c.type), c.value))) out.push("Complete ou remova as condições vazias.");
  if (!a.actions.length) out.push("Adicione ao menos uma ação.");
  if (a.actions.some((c) => empty(defOf(ACTIONS, c.type), c.value))) out.push("Complete ou remova as ações vazias.");
  if (a.actions.filter((c) => c.type === "mensagem" || c.type === "modelo").length > 1) out.push("Só uma mensagem automática por lead a cada 24 h: mantenha uma ação de envio.");
  const loop = a.actions.some((c) => (a.trigger.type === "etapa" && c.type === "etapa" && c.value === a.trigger.value) || (a.trigger.type === "tag" && c.type === "tag_add" && c.value === a.trigger.value));
  if (loop) out.push("Laço bloqueado: uma ação dispara o próprio gatilho.");
  return out;
}
const it = (type: string, value = "") => ({ id: "", type, value });
export const BLANK: Draft = { name: "", trigger: { type: "mensagem", value: "" }, conditions: [], actions: [] };
export const READY: { text: string; draft: Draft }[] = [
  { text: "Responde quem chama com o showroom fechado", draft: { name: "Fora do horário", trigger: { type: "mensagem", value: "" }, conditions: [it("horario", "Fora do horário")], actions: [it("mensagem", "Recebemos sua mensagem. O showroom abre de segunda a sábado, das 9h às 18h, e respondemos assim que abrir."), it("tarefa", "1ª resposta na abertura")] } },
  { text: "Distribui e agenda a primeira resposta", draft: { name: "Lead de anúncio", trigger: { type: "anuncio", value: "Sauna" }, conditions: [], actions: [it("atribuir", "Rodízio"), it("tag_add", "Sauna"), it("tarefa", "1ª resposta em 1 h")] } },
  { text: "Retoma orçamentos sem retorno há 3 dias", draft: { name: "Proposta parada", trigger: { type: "sem_resposta", value: "72" }, conditions: [it("etapa", "Proposta enviada")], actions: [it("modelo", "retomada_orcamento"), it("notificar", "Responsável")] } },
  { text: "Pergunta como está o uso após a entrega", draft: { name: "Pós-venda", trigger: { type: "pos_ganho", value: "30" }, conditions: [], actions: [it("modelo", "pos_venda_30_dias"), it("tarefa", "acompanhamento pós-venda")] } },
  { text: "Organiza quem clica em Não tenho interesse", draft: { name: "Sem interesse", trigger: { type: "botao", value: "Não tenho interesse" }, conditions: [], actions: [it("tag_add", "Retorno"), it("notificar", "Responsável")] } },
];
