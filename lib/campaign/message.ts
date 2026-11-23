/* Variáveis de modelo: de onde vem cada valor e quem fica sem ele. */
import type { Contact, Template, VarMap } from "../data/types";
import { db } from "../data/db";

export const SOURCES = [
  { value: "primeiro_nome", label: "Primeiro nome do contato" }, { value: "nome", label: "Nome completo do contato" },
  { value: "produto", label: "Produto de interesse (negócio mais recente)" }, { value: "cidade", label: "Cidade do contato" },
  { value: "responsavel", label: "Nome do responsável" }, { value: "fixo", label: "Texto fixo" },
] as const;
export const varsOf = (t?: Template) => [...new Set([...(t?.body.matchAll(/\{\{(\w+)\}\}/g) ?? [])].map((m) => m[1]))];
/** Sugestão inicial pelo nome da variável. */
export const guess = (v: string) => (v === "nome" ? "primeiro_nome" : v === "produto" ? "produto" : v === "cidade" ? "cidade" : "");
export function valueOf(c: Contact, source: string, fixed = ""): string | undefined {
  switch (source) {
    case "primeiro_nome": return c.name.trim().split(/\s+/)[0] || undefined;
    case "nome": return c.name.trim() || undefined;
    case "cidade": return c.city && c.city !== "Não informada" ? c.city : undefined;
    case "responsavel": return db.users.find((u) => u.id === c.ownerId)?.name.split(" ")[0];
    case "produto": {
      const ds = db.deals.filter((d) => d.contactId === c.id).sort((a, b) => Number(b.status === "aberto") - Number(a.status === "aberto") || b.createdAt.localeCompare(a.createdAt));
      return ds[0] ? db.products.find((p) => p.id === ds[0].productId)?.name.toLowerCase() : undefined;
    }
    case "fixo": return fixed.trim() || undefined;
    default: return undefined;
  }
}
export function render(t: Template | undefined, map: VarMap, c?: Contact): string {
  return (t?.body ?? "").replace(/\{\{(\w+)\}\}/g, (m, k: string) => {
    const s = map[k];
    if (!s?.source) return `[${k}]`;
    return (c && valueOf(c, s.source, s.fixed)) ?? s.fallback?.trim() ?? `[${k} vazio]`;
  });
}
export interface VarCheck { name: string; missing: number; problem?: string }
/** Confere cada variável em todo o público elegível, não só no contato da prévia. */
export function checkVars(t: Template | undefined, map: VarMap, contactIds: string[]): VarCheck[] {
  const cs = contactIds.flatMap((id) => db.contacts.find((c) => c.id === id) ?? []);
  return varsOf(t).map((name) => {
    const s = map[name];
    if (!s?.source) return { name, missing: cs.length, problem: "Escolha de onde vem o valor." };
    if (s.source === "fixo" && !s.fixed?.trim()) return { name, missing: cs.length, problem: "Escreva o texto fixo." };
    const missing = cs.filter((c) => !valueOf(c, s.source, s.fixed)).length;
    return { name, missing, ...(missing && !s.fallback?.trim() ? { problem: `${missing} ${missing === 1 ? "destinatário fica" : "destinatários ficam"} sem valor. Defina um valor alternativo ou mude a origem.` } : {}) };
  });
}
/** Por que o modelo não pode ser usado nesta campanha. */
export function templateBlock(t: Template, senderId: string): string | null {
  if (t.status === "Em análise") return "Aguardando aprovação da Meta.";
  if (t.status === "Rejeitado") return `Rejeitado pela Meta${t.reason ? `: ${t.reason}` : "."}`;
  if (t.category !== "Marketing") return "Modelo de utilidade: não pode ser usado em campanhas de divulgação.";
  if (t.channelId !== senderId) return "Aprovado para outro número; não pode sair por este remetente.";
  return null;
}
