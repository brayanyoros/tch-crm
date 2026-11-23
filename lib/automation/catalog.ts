import type { Flow, FlowNode, NodeKind } from "../data/types";

/** Como cada campo é editado. */
export type FieldInput = "texto" | "longo" | "numero" | "etapa" | "tag" | "vendedor" | "vendedor_rodizio" | "vendedor_lead" | "produto" | "categoria" | "origem" | "canal" | "horario" | "modelo" | "avisar" | "valor" | "unidade" | "prazo";
export interface FieldDef { key: string; label: string; input: FieldInput; optional?: boolean; placeholder?: string; hint?: string; show?: (c: Record<string, string>) => boolean }
export interface BlockDef { type: string; kind: NodeKind; label: string; help?: string; note?: string; fields: FieldDef[]; summary: (c: Record<string, string>) => string }
const q = (v?: string) => (v ? `“${v}”` : "");
const or = (v: string | undefined, d: string) => v || d;

export const TRIGGERS: BlockDef[] = [
  { type: "mensagem", kind: "gatilho", label: "Mensagem recebida", fields: [{ key: "canal", label: "Canal", input: "canal", optional: true }, { key: "palavra", label: "Palavra-chave", input: "texto", optional: true, placeholder: "Qualquer mensagem", hint: "Sem diferenciar acentos e maiúsculas." }], summary: (c) => `${or(c.canal, "Qualquer canal")}${c.palavra ? ` · contém ${q(c.palavra)}` : ""}` },
  { type: "lead", kind: "gatilho", label: "Lead criado", help: "Dispara quando um negócio é criado.", fields: [], summary: () => "Todo negócio novo" },
  { type: "anuncio", kind: "gatilho", label: "Lead veio de anúncio", note: "Depende da integração com o Meta. Enquanto ela não existir, este gatilho não recebe eventos; o fluxo pode ser testado.", fields: [{ key: "categoria", label: "Anúncio de", input: "categoria", optional: true }], summary: (c) => (c.categoria ? `Anúncios de ${c.categoria.toLowerCase()}` : "Qualquer anúncio") },
  { type: "etapa", kind: "gatilho", label: "Etapa mudou", fields: [{ key: "etapa", label: "Chegou a", input: "etapa" }], summary: (c) => `Negócio chegou a ${or(c.etapa, "…")}` },
  { type: "tag", kind: "gatilho", label: "Tag adicionada", fields: [{ key: "tag", label: "Tag", input: "tag" }], summary: (c) => `Recebeu a tag ${or(c.tag, "…")}` },
  { type: "sem_resposta", kind: "gatilho", label: "Cliente sem responder", help: "Conta desde a última mensagem da equipe. Dispara uma vez por mensagem.", fields: [{ key: "horas", label: "Horas sem resposta", input: "numero" }], summary: (c) => `Há ${or(c.horas, "…")} h` },
  { type: "tarefa_atrasada", kind: "gatilho", label: "Tarefa atrasada", help: "Só tarefas que vencerem depois da publicação.", fields: [], summary: () => "Quando uma tarefa vence" },
  { type: "pos_ganho", kind: "gatilho", label: "Dias após o fechamento", help: "Só prazos que vencerem depois da publicação.", fields: [{ key: "dias", label: "Dias após fechado ganho", input: "numero" }], summary: (c) => `${or(c.dias, "…")} dias depois` },
  { type: "botao", kind: "gatilho", label: "Botão de campanha clicado", note: "Depende da integração com o WhatsApp. Enquanto ela não existir, este gatilho não recebe eventos; o fluxo pode ser testado.", fields: [{ key: "texto", label: "Texto do botão", input: "texto" }], summary: (c) => `Botão ${or(q(c.texto), "…")}` },
];
/** Regras que uma condição pode combinar (todas precisam valer). */
export const RULES: { type: string; label: string; input: FieldInput; say: (v: string) => string; title: (v: string) => string }[] = [
  { type: "horario", label: "Horário comercial", input: "horario", say: (v) => or(v, "…").toLowerCase(), title: (v) => (v === "Dentro do horário" ? "Está dentro do horário comercial?" : "Está fora do horário comercial?") },
  { type: "canal", label: "Canal", input: "canal", say: (v) => `canal é ${or(v, "…")}`, title: (v) => `O canal é ${or(v, "…")}?` },
  { type: "etapa", label: "Etapa", input: "etapa", say: (v) => `etapa é ${or(v, "…")}`, title: (v) => `Está em ${or(v, "…")}?` },
  { type: "tag", label: "Tag", input: "tag", say: (v) => `tem a tag ${or(v, "…")}`, title: (v) => `Tem a tag ${or(v, "…")}?` },
  { type: "responsavel", label: "Responsável", input: "vendedor", say: (v) => `responsável é ${or(v, "…")}`, title: (v) => `O responsável é ${or(v, "…")}?` },
  { type: "valor", label: "Valor a partir de", input: "valor", say: (v) => `valor de R$ ${Number(v || 0).toLocaleString("pt-BR")} ou mais`, title: (v) => `Vale R$ ${Number(v || 0).toLocaleString("pt-BR")} ou mais?` },
  { type: "produto", label: "Produto", input: "produto", say: (v) => `produto é ${or(v, "…")}`, title: (v) => `O produto é ${or(v, "…")}?` },
  { type: "origem", label: "Origem", input: "origem", say: (v) => `origem é ${or(v, "…")}`, title: (v) => `A origem é ${or(v, "…")}?` },
];
export const ruleOf = (t: string) => RULES.find((r) => r.type === t);
export const PRAZO: Record<string, string> = { abertura: "na próxima abertura do showroom", horas: "horas depois", dias: "dias depois, às 9h" };
const prazoText = (c: Record<string, string>) => (c.prazo === "abertura" ? PRAZO.abertura : c.prazo ? `${or(c.prazoN, "…")} ${PRAZO[c.prazo]}` : "sem prazo");

export const ACTIONS: BlockDef[] = [
  { type: "mensagem", kind: "acao", label: "Enviar mensagem", help: "Só sai dentro da janela de 24h do cliente, e no máximo uma mensagem automática por lead a cada 24 h.", fields: [{ key: "texto", label: "Mensagem", input: "longo", hint: "Use {{nome}} e {{produto}}; são trocados pelos dados do lead." }], summary: (c) => or(c.texto, "Sem texto") },
  { type: "modelo", kind: "acao", label: "Enviar modelo aprovado", help: "Só no WhatsApp. Vale fora da janela de 24h e conta no limite de uma mensagem automática a cada 24 h.", fields: [{ key: "modelo", label: "Modelo", input: "modelo" }], summary: (c) => or(c.modelo, "Escolha o modelo") },
  { type: "tarefa", kind: "acao", label: "Criar tarefa", fields: [{ key: "titulo", label: "Título", input: "texto" }, { key: "responsavel", label: "Responsável", input: "vendedor_lead", hint: "Lead sem responsável: a tarefa vai para o gestor." }, { key: "prazo", label: "Prazo", input: "prazo" }, { key: "prazoN", label: "Quantidade", input: "numero", show: (c) => c.prazo === "horas" || c.prazo === "dias" }], summary: (c) => `${or(q(c.titulo), "Sem título")} · ${prazoText(c)}` },
  { type: "atribuir", kind: "acao", label: "Alterar responsável", fields: [{ key: "para", label: "Atribuir a", input: "vendedor_rodizio", hint: "O rodízio usa quem participa em Configurações › Distribuição." }], summary: (c) => (c.para === "Rodízio" ? "Rodízio da equipe" : or(c.para, "Escolha a pessoa")) },
  { type: "etapa", kind: "acao", label: "Mover de etapa", help: "Precisa que o lead tenha um negócio aberto.", fields: [{ key: "etapa", label: "Mover para", input: "etapa" }], summary: (c) => or(c.etapa, "Escolha a etapa") },
  { type: "tag_add", kind: "acao", label: "Adicionar tag", fields: [{ key: "tag", label: "Tag", input: "tag" }], summary: (c) => or(c.tag, "Escolha a tag") },
  { type: "tag_del", kind: "acao", label: "Remover tag", fields: [{ key: "tag", label: "Tag", input: "tag" }], summary: (c) => or(c.tag, "Escolha a tag") },
  { type: "notificar", kind: "acao", label: "Notificar", fields: [{ key: "quem", label: "Avisar", input: "avisar" }], summary: (c) => (c.quem ? `Avisa o ${c.quem.toLowerCase()}` : "Escolha quem avisar") },
  { type: "lista", kind: "acao", label: "Incluir em lista de campanha", fields: [{ key: "lista", label: "Nome da lista", input: "texto" }], summary: (c) => or(c.lista, "Sem nome") },
  { type: "resumo", kind: "acao", label: "Pedir resumo ao Assistente", help: "O resumo entra na conversa como nota interna.", fields: [], summary: () => "Nota interna com o resumo" },
];
export const DELAY: BlockDef = { type: "aguardar", kind: "atraso", label: "Aguardar", note: "A espera corre enquanto o CRM está aberto neste navegador. Ao recarregar, esperas em andamento são perdidas; o agendamento no servidor virá com o Supabase.", fields: [{ key: "n", label: "Tempo", input: "numero" }, { key: "u", label: "Unidade", input: "unidade" }], summary: (c) => `${or(c.n, "…")} ${or(c.u, "horas")}` };
export const CONDITION: BlockDef = { type: "condicao", kind: "condicao", label: "Condição", help: "Todas as verificações precisam valer para seguir pelo caminho Sim.", fields: [], summary: () => "" };
export const END: BlockDef = { type: "fim", kind: "fim", label: "Encerrar", fields: [], summary: () => "" };

export function defOf(n: Pick<FlowNode, "kind" | "type">): BlockDef {
  if (n.kind === "gatilho") return TRIGGERS.find((d) => d.type === n.type) ?? TRIGGERS[0];
  if (n.kind === "acao") return ACTIONS.find((d) => d.type === n.type) ?? ACTIONS[0];
  return n.kind === "atraso" ? DELAY : n.kind === "condicao" ? CONDITION : END;
}
export const KIND_LABEL: Record<NodeKind, string> = { gatilho: "Gatilho", condicao: "Condição", acao: "Ação", atraso: "Atraso", fim: "Fim" };
export function titleOf(n: FlowNode): string {
  if (n.kind !== "condicao") return defOf(n).label;
  const r = n.rules ?? [];
  return !r.length ? "Condição sem verificação" : r.length === 1 ? (ruleOf(r[0].type)?.title(r[0].value) ?? "Condição") : "Todas as verificações valem?";
}
export function summaryOf(n: FlowNode): string {
  if (n.kind === "condicao") return (n.rules ?? []).map((r) => ruleOf(r.type)?.say(r.value) ?? "").join(" e ");
  return defOf(n).summary(n.config);
}
export const delayHours = (c: Record<string, string>) => Number(c.n || 0) * (c.u === "dias" ? 24 : 1);
export function triggerText(f: Flow) {
  const t = f.nodes.find((n) => n.kind === "gatilho");
  return t ? `${titleOf(t)} · ${summaryOf(t)}` : "Sem gatilho";
}
