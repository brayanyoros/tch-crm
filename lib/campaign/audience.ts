/* Avalia um público de campanha sobre os dados do CRM. Cada contato aparece uma vez, mesmo com vários negócios. */
import type { AudField, Audience, AudRule, Contact, SavedAudience } from "../data/types";
import { db } from "../data/db";
import { DAY, now } from "../format";
import { fromInput } from "./schedule";

export const FIELD_LABEL: Record<AudField, string> = { etapa: "Etapa do negócio", tag: "Tags", produto: "Produto de interesse", cidade: "Cidade", responsavel: "Responsável", interacao: "Última interação", origem: "Origem", lista: "Lista fixa" };
export const REASONS = ["Removido desta campanha", "Pediu para sair", "Sem autorização registrada", "Sem telefone", "Telefone inválido", "Telefone repetido em outro contato"] as const;
export type Reason = (typeof REASONS)[number];
export interface AudienceRow { contactId: string; name: string; phone?: string; city: string; eligible: boolean; reason?: Reason }
export interface AudienceResult { found: number; eligible: number; excluded: number; reasons: Partial<Record<Reason, number>>; rows: AudienceRow[]; problems: string[] }
export const blankAudience = (): Audience => ({ match: "todas", rules: [], excludeTags: [], excludeAudiences: [], excludeContacts: [] });
export const digits = (s?: string) => (s ?? "").replace(/\D/g, "");
/** Celular ou fixo brasileiro com DDD, com ou sem 55. */
export const validPhone = (s?: string) => { const d = digits(s).replace(/^55(?=\d{10,11}$)/, ""); return /^[1-9]{2}9?\d{8}$/.test(d); };
export const maskPhone = (s?: string) => { const d = digits(s); return d.length < 8 ? (s ?? "") : `${s!.slice(0, Math.max(0, s!.length - 9))}••••-${d.slice(-4)}`; };

/** Última mensagem trocada na conversa (cliente ou equipe). Sem conversa ou mensagens: nunca houve interação. */
export function lastInteraction(c: Contact): Date | null {
  const v = db.conversations.find((x) => x.contactId === c.id), m = v?.messages.filter((x) => x.kind !== "nota").at(-1);
  return m ? new Date(m.at) : null;
}
export function ruleProblem(r: AudRule): string | null {
  if (r.field === "interacao") {
    if (r.op === "nunca") return null;
    if (r.op === "entre") return r.from && r.to && r.from <= r.to ? null : "Escolha as duas datas da última interação.";
    return r.n && r.n > 0 ? null : "Informe o número de dias.";
  }
  return r.values.length ? null : `Escolha ao menos um valor em “${FIELD_LABEL[r.field]}”.`;
}
function matches(c: Contact, r: AudRule): boolean {
  const deals = db.deals.filter((d) => d.contactId === c.id), live = deals.filter((d) => d.status !== "perdido");
  const any = (vals: string[]) => r.values.some((v) => vals.includes(v));
  let hit: boolean;
  switch (r.field) {
    case "etapa": hit = any(live.map((d) => d.stageId)); break;
    case "tag": hit = any(c.tagIds); break;
    case "produto": hit = any(deals.map((d) => d.productId)); break;
    case "cidade": hit = any([c.city]); break;
    case "responsavel": hit = any([c.ownerId ?? "sem"]); break;
    case "origem": hit = any(deals.map((d) => d.origin)); break;
    case "lista": hit = any(c.lists); break;
    case "interacao": {
      const last = lastInteraction(c), age = last ? (now().getTime() - last.getTime()) / DAY : null;
      if (r.op === "nunca") return !last;
      if (!last || age === null) return false;
      if (r.op === "ultimos") return age <= (r.n ?? 0);
      if (r.op === "mais_de") return age > (r.n ?? 0);
      const from = fromInput(`${r.from}T00:00`), to = fromInput(`${r.to}T23:59`);
      return !!from && !!to && last >= from && last <= to;
    }
  }
  return r.op === "exclui" ? !hit : hit;
}
const inAudience = (c: Contact, a: Audience) => {
  const rules = a.rules.filter((r) => !ruleProblem(r));
  if (!rules.length) return true;
  return a.match === "todas" ? rules.every((r) => matches(c, r)) : rules.some((r) => matches(c, r));
};
/** Total encontrado, elegíveis e o primeiro motivo de exclusão de cada contato (sem dupla contagem). */
export function evaluate(a: Audience, saved: SavedAudience[] = db.audiences): AudienceResult {
  const problems = a.rules.map(ruleProblem).filter((x): x is string => !!x);
  const excludedBy = saved.filter((s) => a.excludeAudiences.includes(s.id));
  const found = db.contacts.filter((c) => inAudience(c, a) && !c.tagIds.some((t) => a.excludeTags.includes(t)) && !excludedBy.some((s) => inAudience(c, s.audience)));
  const seen = new Set<string>(), reasons: AudienceResult["reasons"] = {};
  const rows = found.map((c): AudienceRow => {
    let reason: Reason | undefined;
    if (a.excludeContacts.includes(c.id)) reason = "Removido desta campanha";
    else if (c.consent.status === "saiu") reason = "Pediu para sair";
    else if (c.consent.status !== "autorizado") reason = "Sem autorização registrada";
    else if (!c.phone) reason = "Sem telefone";
    else if (!validPhone(c.phone)) reason = "Telefone inválido";
    else if (seen.has(digits(c.phone).slice(-11))) reason = "Telefone repetido em outro contato";
    if (!reason) seen.add(digits(c.phone).slice(-11));
    else reasons[reason] = (reasons[reason] ?? 0) + 1;
    return { contactId: c.id, name: c.name, phone: c.phone, city: c.city, eligible: !reason, reason };
  }).sort((x, y) => Number(y.eligible) - Number(x.eligible) || x.name.localeCompare(y.name, "pt-BR"));
  const eligible = rows.filter((r) => r.eligible).length;
  return { found: rows.length, eligible, excluded: rows.length - eligible, reasons, rows, problems };
}
/** Texto curto dos critérios, para listas e revisão. */
export function describe(a: Audience, label: (f: AudField, v: string) => string): string[] {
  const out = a.rules.map((r) => {
    const f = FIELD_LABEL[r.field];
    if (r.field === "interacao") return r.op === "nunca" ? "Nunca houve interação" : r.op === "ultimos" ? `Interação nos últimos ${r.n} dias` : r.op === "mais_de" ? `Sem interação há mais de ${r.n} dias` : `Última interação entre ${r.from?.split("-").reverse().join("/")} e ${r.to?.split("-").reverse().join("/")}`;
    return `${f} ${r.op === "exclui" ? "não é" : "é"} ${r.values.map((v) => label(r.field, v)).join(" ou ")}`;
  });
  const head = out.length ? (out.length > 1 ? `${a.match === "todas" ? "Todas" : "Qualquer uma"} das condições: ` : "") : "Todos os contatos";
  const ex = [
    ...(a.excludeTags.length ? [`exceto tags ${a.excludeTags.map((t) => label("tag", t)).join(", ")}`] : []),
    ...(a.excludeAudiences.length ? [`exceto públicos ${a.excludeAudiences.map((id) => db.audiences.find((s) => s.id === id)?.name ?? "removido").join(", ")}`] : []),
    ...(a.excludeContacts.length ? [`${a.excludeContacts.length} contato(s) removido(s) à mão`] : []),
  ];
  return [head + out.join("; "), ...ex].filter(Boolean);
}
