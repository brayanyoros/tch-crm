/* Persistência das automações no navegador (mock). O histórico de execuções segue o resto do mock e não é guardado. */
import type { Automation, Flow } from "../data/types";
import { db } from "../data/db";

const KEY = "tch-automacoes-v1";
const isFlow = (f: unknown): f is Flow => {
  const x = f as Flow;
  return !!x && Array.isArray(x.nodes) && Array.isArray(x.edges) && x.nodes.every((n) => n && typeof n.id === "string" && typeof n.kind === "string" && typeof n.config === "object" && Number.isFinite(n.x) && Number.isFinite(n.y)) && x.edges.every((e) => e && typeof e.source === "string" && typeof e.target === "string");
};
let loaded = false;
export function loadAutomations() {
  if (loaded || typeof localStorage === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const list = (JSON.parse(raw) as Omit<Automation, "runs">[]).filter((a) => a && typeof a.id === "string" && isFlow(a.draft) && (!a.published || isFlow(a.published)));
    const runs = new Map(db.automations.map((a) => [a.id, a.runs]));
    db.automations.splice(0, db.automations.length, ...list.map((a) => ({ ...a, runs: runs.get(a.id) ?? [] })));
  } catch { /* dados ilegíveis: segue com o exemplo */ }
}
/** Lança erro se o navegador recusar: quem chama não pode dizer que salvou. */
export function persistAutomations() {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(db.automations.map(({ runs, ...a }) => { void runs; return a; }))); }
  catch { throw new Error("O navegador não permitiu salvar. Verifique o espaço e as permissões do site."); }
}
