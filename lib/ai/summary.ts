import type { AiBlock, ConversationView } from "../data/types";
import { agoMs, dateTime, duration, money } from "../format";

/** Resumo de uma conversa: usado no painel do Assistente e na ação de automação. */
export function summary(v: ConversationView): AiBlock[] {
  const d = v.deal, asks = v.messages.filter((m) => m.kind === "cliente" && m.text).slice(-3).map((m) => m.text), notes = v.messages.filter((m) => m.kind === "nota").slice(-1), main = v.contact.name === "Marcelo Tavares";
  return [
    { type: "texto", text: `${v.contact.name}, de ${v.contact.city}${d ? `, quer ${d.title.toLowerCase()} (${money(d.value)}). Está em ${d.stage.name.toLowerCase()} com ${d.owner?.name ?? "ninguém"}.` : ", ainda sem negócio aberto."}` },
    { type: "topicos", items: [...(main ? ["Perguntou prazo: 25 a 30 dias úteis para Teresópolis", "Instalação inclusa; área coberta de 3 x 4 m ao lado da piscina", "Rede bifásica: confirmado 220 V com disjuntor exclusivo de 32 A", "Orçamento em PDF enviado ontem, às 20:31"] : asks.map((t) => `Cliente: ${t}`)), ...(notes[0] && !main ? [`Nota interna: ${notes[0].text}`] : []), v.waitingSince ? `Espera resposta há ${duration(agoMs(v.waitingSince))}` : `Última resposta da equipe: ${v.last ? dateTime(v.last.at) : "nenhuma"}`] },
  ];
}
export const summaryText = (v: ConversationView) => summary(v).map((b) => (b.type === "texto" ? b.text : b.type === "topicos" ? b.items.map((i) => `• ${i}`).join("\n") : "")).join("\n");
