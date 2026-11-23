import { migrate, type LegacyRule } from "@/lib/automation/flow";

/** Modelos prontos. O fluxo é criado a cada uso, com identificadores novos. */
export const READY: { name: string; text: string; rule: LegacyRule }[] = [
  { name: "Fora do horário", text: "Responde quem chama com o showroom fechado", rule: { trigger: { type: "mensagem", value: "" }, conditions: [{ type: "horario", value: "Fora do horário" }], actions: [{ type: "mensagem", value: "Recebemos sua mensagem. O showroom abre de segunda a sábado, das 9h às 18h, e respondemos assim que abrir." }, { type: "tarefa", value: "1ª resposta na abertura", prazo: "abertura" }] } },
  { name: "Lead de anúncio", text: "Distribui e agenda a primeira resposta", rule: { trigger: { type: "anuncio", value: "Sauna" }, conditions: [], actions: [{ type: "atribuir", value: "Rodízio" }, { type: "tag_add", value: "Sauna" }, { type: "tarefa", value: "1ª resposta em 1 h", prazo: "horas", prazoN: "1" }] } },
  { name: "Proposta parada", text: "Retoma orçamentos sem retorno há 3 dias", rule: { trigger: { type: "sem_resposta", value: "72" }, conditions: [{ type: "etapa", value: "Proposta enviada" }], actions: [{ type: "modelo", value: "retomada_orcamento" }, { type: "notificar", value: "Responsável" }] } },
  { name: "Pós-venda", text: "Pergunta como está o uso após a entrega", rule: { trigger: { type: "pos_ganho", value: "30" }, conditions: [], actions: [{ type: "modelo", value: "pos_venda_30_dias" }, { type: "tarefa", value: "Acompanhamento pós-venda", prazo: "dias", prazoN: "2" }] } },
  { name: "Sem interesse", text: "Organiza quem clica em Não tenho interesse", rule: { trigger: { type: "botao", value: "Não tenho interesse" }, conditions: [], actions: [{ type: "tag_add", value: "Retorno" }, { type: "notificar", value: "Responsável" }] } },
];
export const fromReady = (i: number) => { const r = READY[i]; return r && { name: r.name, flow: migrate(r.rule) }; };
