import type { AiBlock, AiLead, ConversationView, DealView } from "../data/types";
import { listConversations, listPipeline } from "../data/repositories";
import { agoMs, dateTime, duration, HOUR, money, norm, plural } from "../format";

export interface AiContext { screen: string; chip: string; loading: string; conversationId?: string; contactId?: string }

const lead = (d: DealView): AiLead => ({ dealId: d.id, contactId: d.contactId, channel: d.channel, name: d.contact.name, wait: duration(agoMs(d.waitingSince ?? d.lastMessageAt)), value: d.value });
const REPLY: [RegExp, string][] = [
  [/desconto|condi|vista|parcel/, "Consigo verificar uma condição para pagamento à vista e também o parcelamento. Posso te ligar ainda hoje para fecharmos o melhor formato?"],
  [/aquecedor/, "A banheira pode vir com aquecedor, e eu envio as duas versões com valores para você comparar. Ela vai ficar em área coberta ou aberta?"],
  [/tempo|chuva|ofuro/, "O cedro foi pensado para área externa, sim. Recomendamos a tampa térmica e um óleo de proteção a cada seis meses. Quer ver um instalado aqui no showroom?"],
  [/laudo|eletric/, "Fornecemos o memorial elétrico do equipamento para o condomínio. Me passa o e-mail da administração que eu envio a documentação?"],
  [/cabe|medida|deck|2,40/, "Para um deck de 2,40 x 2,40 m precisamos conferir a folga de circulação e a carga do piso. Pode me mandar uma foto do local com as medidas?"],
  [/abrem|amanha|conhecer/, "O showroom abre de segunda a sábado, das 9h às 18h, na Prata, em Teresópolis. Qual horário fica melhor para eu te receber?"],
];
function suggest(v: ConversationView): string {
  const first = v.contact.name.split(" ")[0], last = norm([...v.messages].reverse().find((m) => m.kind === "cliente" && m.text)?.text ?? "");
  if (v.contact.name === "Marcelo Tavares") return "Marcelo, para adiantar: podemos agendar a visita técnica nesta semana. O técnico confirma o disjuntor de 32 A, o ponto de água e as medidas da área coberta. Quarta às 9h funciona para você?";
  return `${first}, obrigado por perguntar. ${REPLY.find(([r]) => r.test(last))?.[1] ?? "Para te passar a melhor opção, pode me enviar uma foto do espaço com as medidas aproximadas?"}`;
}
function summary(v: ConversationView): AiBlock[] {
  const d = v.deal, asks = v.messages.filter((m) => m.kind === "cliente" && m.text).slice(-3).map((m) => m.text), notes = v.messages.filter((m) => m.kind === "nota").slice(-1);
  return [
    { type: "texto", text: `${v.contact.name}, de ${v.contact.city}${d ? `, quer ${d.title.toLowerCase()} (${money(d.value)}). Está em ${d.stage.name.toLowerCase()} com ${d.owner?.name ?? "ninguém"}.` : ", ainda sem negócio aberto."}` },
    { type: "topicos", items: [...(v.contact.name === "Marcelo Tavares" ? ["Perguntou prazo: 25 a 30 dias úteis para Teresópolis", "Instalação inclusa; área coberta de 3 x 4 m ao lado da piscina", "Rede bifásica: confirmado 220 V com disjuntor exclusivo de 32 A", "Orçamento em PDF enviado ontem, às 20:31"] : asks.map((t) => `Cliente: ${t}`)), ...(notes[0] && v.contact.name !== "Marcelo Tavares" ? [`Nota interna: ${notes[0].text}`] : []), v.waitingSince ? `Espera resposta há ${duration(agoMs(v.waitingSince))}` : `Última resposta da equipe: ${v.last ? dateTime(v.last.at) : "nenhuma"}`] },
  ];
}
/** Respostas por palavra-chave. Amanhã: chamada à IA real com a mesma assinatura. */
export async function ask(question: string, ctx: AiContext): Promise<AiBlock[]> {
  await new Promise((r) => setTimeout(r, 1200));
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
  const t = norm(question);
  if (t.includes("simular erro")) throw new Error("offline");
  const [deals, convs] = await Promise.all([listPipeline(), listConversations()]);
  const v = convs.find((x) => x.id === ctx.conversationId) ?? convs.find((x) => x.contactId === ctx.contactId);
  const open = deals.filter((d) => d.status === "aberto");

  if (/tarefa|lembr/.test(t)) return [{ type: "tarefa", title: v ? `Retorno para ${v.contact.name}` : "Retorno aos leads sem resposta", when: "amanhã, 09:00" }, { type: "texto", text: "Quer mudar a data ou quem vai fazer? Edite em Tarefas." }];
  if (/24 ?h|parad|sem resposta|espera/.test(t)) {
    const stale = open.filter((d) => agoMs(d.lastMessageAt) > 24 * HOUR).sort((a, b) => a.lastMessageAt.localeCompare(b.lastMessageAt));
    if (!stale.length) return [{ type: "texto", text: "Nenhum lead aberto está parado há mais de 24 h." }];
    return [{ type: "texto", text: `${plural(stale.length, "lead está parado", "leads estão parados")} há mais de 24 h.` }, { type: "leads", items: stale.map(lead) }];
  }
  if (/resum/.test(t)) {
    if (v) return summary(v);
    const total = open.reduce((a, d) => a + d.value, 0);
    return [{ type: "texto", text: `O funil tem ${plural(open.length, "negócio aberto", "negócios abertos")}, somando ${money(total)}. ${plural(convs.filter((x) => x.waitingSince).length, "conversa espera", "conversas esperam")} resposta.` }, { type: "tabela", head: ["Etapa", "Negócios", "Valor"], rows: [...new Set(open.map((d) => d.stageIndex))].sort().map((i) => { const x = open.filter((d) => d.stageIndex === i); return [x[0].stage.name, String(x.length), money(x.reduce((a, d) => a + d.value, 0))]; }) }];
  }
  if (/sugir|respost|responder/.test(t)) {
    const target = v ?? convs.filter((x) => x.waitingSince).sort((a, b) => a.waitingSince!.localeCompare(b.waitingSince!))[0];
    if (!target) return [{ type: "texto", text: "Todas as conversas já foram respondidas." }];
    return [...(v ? [] : [{ type: "texto" as const, text: `Comecei por ${target.contact.name}, que espera há mais tempo.` }]), { type: "resposta", text: suggest(target), conversationId: target.id }];
  }
  if (/vend|fech|equipe|respons|quem/.test(t)) {
    const won = deals.filter((d) => d.status === "ganho" && agoMs(d.closedAt ?? d.createdAt) < 22 * 24 * HOUR), names = [...new Set(won.map((d) => d.owner?.name ?? "Sem dono"))];
    return [{ type: "texto", text: `Neste mês foram ${plural(won.length, "venda")}, somando ${money(won.reduce((a, d) => a + d.value, 0))}.` }, { type: "tabela", head: ["Responsável", "Vendas", "Fechado"], rows: names.map((n) => { const x = won.filter((d) => (d.owner?.name ?? "Sem dono") === n); return [n, String(x.length), money(x.reduce((a, d) => a + d.value, 0))]; }) }];
  }
  return [{ type: "texto", text: "Não encontrei essa informação nos dados do CRM. Posso ajudar com:" }, { type: "topicos", items: ["Resumo da conversa ou do funil", "Sugestão de resposta para um cliente", "Leads parados há mais de 24 h", "Criação de tarefas de retorno"] }];
}
