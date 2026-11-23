/* Operações puras sobre o fluxo: montar, conectar, excluir, organizar e validar. */
import type { Flow, FlowEdge, FlowNode, NodeKind, Out, RuleItem } from "../data/types";
import { defOf, delayHours, ruleOf, type FieldInput } from "./catalog";

let seq = 0;
export const uid = (p: string) => `${p}${Date.now().toString(36)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
export const NODE_W = 300, END_W = 116, ROW = 208, GAP = 56;

export const outsOf = (n: FlowNode): Out[] => (n.kind === "fim" ? [] : n.kind === "condicao" ? ["sim", "nao"] : ["next"]);
export const OUT_LABEL: Record<Out, string> = { next: "Próxima etapa", sim: "Sim", nao: "Não" };
export const nodeOf = (f: Flow, id: string) => f.nodes.find((n) => n.id === id);
export const edgeFrom = (f: Flow, id: string, out: Out) => f.edges.find((e) => e.source === id && e.out === out);
export const triggerOf = (f: Flow) => f.nodes.find((n) => n.kind === "gatilho");
const edge = (source: string, out: Out, target: string): FlowEdge => ({ id: uid("e"), source, out, target });
const blank = (kind: NodeKind, type: string, config: Record<string, string> = {}, rules?: RuleItem[]): FlowNode => ({ id: uid("n"), kind, type, config, ...(kind === "condicao" ? { rules: rules ?? [] } : {}), x: 0, y: 0 });
export const DEFAULTS: Record<string, Record<string, string>> = { tarefa: { responsavel: "Responsável pelo lead" }, aguardar: { n: "1", u: "horas" } };
export const newNode = (kind: NodeKind, type: string) => blank(kind, type, { ...(DEFAULTS[type] ?? {}) }, kind === "condicao" ? [{ id: uid("r"), type: "horario", value: "Fora do horário" }] : undefined);

export function blankFlow(): Flow {
  const t = blank("gatilho", "mensagem"), end = blank("fim", "fim");
  return layout({ nodes: [t, end], edges: [edge(t.id, "next", end.id)] });
}
/* ---------- migração do formato antigo (Quando / Se / Faça) ---------- */
export interface LegacyItem { type: string; value: string; prazo?: string; prazoN?: string }
export interface LegacyRule { trigger: { type: string; value: string }; conditions: LegacyItem[]; actions: LegacyItem[] }
const TRIGGER_KEY: Record<string, string> = { mensagem: "palavra", anuncio: "categoria", etapa: "etapa", tag: "tag", sem_resposta: "horas", pos_ganho: "dias", botao: "texto" };
const ACTION_KEY: Record<string, string> = { atribuir: "para", etapa: "etapa", tag_add: "tag", tag_del: "tag", tarefa: "titulo", mensagem: "texto", modelo: "modelo", notificar: "quem", lista: "lista" };
/** Condições em "E" viram um único bloco; a ordem das ações é mantida; o caminho Não encerra. */
export function migrate(r: LegacyRule): Flow {
  const nodes: FlowNode[] = [], edges: FlowEdge[] = [];
  const key = TRIGGER_KEY[r.trigger.type];
  const t = blank("gatilho", r.trigger.type, key && r.trigger.value ? { [key]: r.trigger.value } : {});
  nodes.push(t);
  let from = t.id, out: Out = "next";
  const link = (n: FlowNode) => { nodes.push(n); edges.push(edge(from, out, n.id)); from = n.id; out = "next"; };
  let cond: FlowNode | undefined;
  if (r.conditions.length) { cond = blank("condicao", "condicao", {}, r.conditions.map((c) => ({ id: uid("r"), type: c.type, value: c.value }))); link(cond); out = "sim"; }
  for (const a of r.actions) {
    if (a.type === "aguardar") { const [n = "", u = "horas"] = a.value.split(" "); link(blank("atraso", "aguardar", { n, u })); continue; }
    link(blank("acao", a.type, { ...(DEFAULTS[a.type] ?? {}), ...(ACTION_KEY[a.type] ? { [ACTION_KEY[a.type]]: a.value } : {}), ...(a.prazo ? { prazo: a.prazo } : {}), ...(a.prazoN ? { prazoN: a.prazoN } : {}) }));
  }
  link(blank("fim", "fim"));
  if (cond) { const end = blank("fim", "fim"); nodes.push(end); edges.push(edge(cond.id, "nao", end.id)); }
  return layout({ nodes, edges });
}
/* ---------- grafo ---------- */
export function descendants(f: Flow, id: string): Set<string> {
  const seen = new Set<string>(), stack = [id];
  while (stack.length) { const cur = stack.pop()!; for (const e of f.edges) if (e.source === cur && !seen.has(e.target)) { seen.add(e.target); stack.push(e.target); } }
  return seen;
}
export function reachable(f: Flow): Set<string> { const t = triggerOf(f); return t ? descendants(f, t.id).add(t.id) : new Set(); }
/** Por que a conexão não pode existir; null quando é válida. */
export function connectError(f: Flow, source: string, target: string): string | null {
  const a = nodeOf(f, source), b = nodeOf(f, target);
  if (!a || !b || a.kind === "fim") return "Conexão inválida.";
  if (b.kind === "gatilho") return "O gatilho só pode iniciar o fluxo.";
  if (source === target || descendants(f, target).has(source)) return "Esta conexão criaria um ciclo.";
  return null;
}
/** Remove blocos Encerrar que ficaram sem entrada. */
const prune = (f: Flow): Flow => { const used = new Set(f.edges.map((e) => e.target)); return { ...f, nodes: f.nodes.filter((n) => n.kind !== "fim" || used.has(n.id)) }; };
/** Cada saída tem uma única conexão: conectar substitui a anterior. `target` "fim" cria um Encerrar. */
export function connect(f: Flow, source: string, out: Out, target: string | "fim"): Flow {
  let nodes = f.nodes, to = target;
  if (target === "fim") { const a = nodeOf(f, source)!, end = { ...blank("fim", "fim"), x: a.x + (NODE_W - END_W) / 2 + (out === "nao" ? 220 : out === "sim" ? -220 : 0), y: a.y + ROW }; nodes = [...nodes, end]; to = end.id; }
  else if (connectError(f, source, target)) return f;
  return arrange(prune({ ...f, nodes, edges: [...f.edges.filter((e) => !(e.source === source && e.out === out)), edge(source, out, to)] }));
}
/** Insere uma etapa na saída indicada; o que vinha depois segue pela nova etapa (no Sim, se for condição). */
export function insert(f: Flow, source: string, out: Out, n: FlowNode): Flow {
  const old = edgeFrom(f, source, out), a = nodeOf(f, source)!, to = old && nodeOf(f, old.target);
  const nodes = [...f.nodes], edges = f.edges.filter((e) => e !== old);
  const placed = { ...n, x: to ? (to.kind === "fim" ? to.x - (NODE_W - END_W) / 2 : to.x) : a.x, y: to ? to.y : a.y + ROW };
  edges.push(edge(source, out, n.id));
  if (to) edges.push(edge(n.id, n.kind === "condicao" ? "sim" : "next", to.id));
  const opened = outsOf(n).filter((o) => !edges.some((e) => e.source === n.id && e.out === o));
  nodes.push(placed);
  for (const o of opened) { const end = { ...blank("fim", "fim"), x: placed.x + (NODE_W - END_W) / 2 + (o === "nao" ? 260 : 0), y: placed.y + ROW }; nodes.push(end); edges.push(edge(n.id, o, end.id)); }
  let next: Flow = { ...f, nodes, edges };
  if (f.manual && to) { const down = descendants(next, n.id); next = { ...next, nodes: next.nodes.map((x) => (down.has(x.id) && f.nodes.some((y) => y.id === x.id) ? { ...x, y: x.y + ROW } : x)) }; }
  return arrange(next);
}
export type Keep = "sim" | "nao" | "nenhum";
/** Blocos que seriam excluídos junto com `id`. */
export function removalImpact(f: Flow, id: string, keep: Keep): FlowNode[] {
  const n = nodeOf(f, id);
  if (!n || n.kind !== "condicao") return [];
  const rest = removeRaw(f, id, keep), root = triggerOf(rest);
  if (!root || !reachable(f).has(id)) return [];
  const alive = reachable(rest), before = descendants(f, id);
  return f.nodes.filter((x) => before.has(x.id) && !alive.has(x.id) && x.kind !== "fim");
}
function removeRaw(f: Flow, id: string, keep: Keep): Flow {
  const n = nodeOf(f, id)!, out: Out = n.kind === "condicao" ? (keep === "nao" ? "nao" : "sim") : "next";
  const next = n.kind === "condicao" && keep === "nenhum" ? undefined : edgeFrom(f, id, out)?.target;
  const nodes = f.nodes.filter((x) => x.id !== id), edges = f.edges.filter((e) => e.source !== id && e.target !== id);
  for (const e of f.edges.filter((x) => x.target === id)) {
    if (next) { edges.push({ ...e, id: uid("e"), target: next }); continue; }
    const end = { ...blank("fim", "fim"), x: n.x + (NODE_W - END_W) / 2, y: n.y };
    nodes.push(end); edges.push({ ...e, id: uid("e"), target: end.id });
  }
  return { ...f, nodes, edges };
}
/** Ação e atraso: o anterior passa a seguir para o próximo. Condição: `keep` diz qual caminho fica. */
export function remove(f: Flow, id: string, keep: Keep = "sim"): Flow {
  const n = nodeOf(f, id);
  if (!n || n.kind === "gatilho" || n.kind === "fim") return f;
  const gone = new Set(removalImpact(f, id, keep).map((x) => x.id)), raw = removeRaw(f, id, keep);
  return arrange(prune({ ...raw, nodes: raw.nodes.filter((x) => !gone.has(x.id)), edges: raw.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)) }));
}
/* ---------- posições ---------- */
/** Organiza de cima para baixo; caminhos lado a lado, Sim à esquerda. */
export function layout(f: Flow): Flow {
  const order: Out[] = ["next", "sim", "nao"];
  const kids = (id: string) => f.edges.filter((e) => e.source === id).sort((a, b) => order.indexOf(a.out) - order.indexOf(b.out)).map((e) => e.target);
  const t = triggerOf(f), hasIn = new Set(f.edges.map((e) => e.target));
  const roots = [...(t ? [t.id] : []), ...f.nodes.filter((n) => n.id !== t?.id && !hasIn.has(n.id)).map((n) => n.id)];
  const depth = new Map<string, number>(), tree = new Map<string, string[]>(), seen = new Set<string>();
  const deepen = (id: string, d: number, path: Set<string>) => { if (path.has(id) || (depth.get(id) ?? -1) >= d) return; depth.set(id, d); path.add(id); kids(id).forEach((k) => deepen(k, d + 1, path)); path.delete(id); };
  const claim = (id: string) => { seen.add(id); const mine: string[] = []; for (const k of kids(id)) if (!seen.has(k)) { mine.push(k); claim(k); } tree.set(id, mine); };
  for (const r of roots) { deepen(r, 0, new Set()); if (!seen.has(r)) claim(r); }
  const width = (id: string): number => { const c = tree.get(id) ?? []; return Math.max(NODE_W, c.reduce((a, k) => a + width(k), 0) + GAP * Math.max(0, c.length - 1)); };
  const pos = new Map<string, { x: number; y: number }>();
  const place = (id: string, left: number) => {
    const w = width(id), fim = nodeOf(f, id)?.kind === "fim", c = tree.get(id) ?? [];
    pos.set(id, { x: Math.round(left + w / 2 - (fim ? END_W : NODE_W) / 2), y: (depth.get(id) ?? 0) * ROW });
    let x = left + (w - (c.reduce((a, k) => a + width(k), 0) + GAP * Math.max(0, c.length - 1))) / 2;
    for (const k of c) { place(k, x); x += width(k) + GAP; }
  };
  let x = 0;
  for (const r of roots) { place(r, x); x += width(r) + GAP * 2; }
  const base = t ? pos.get(t.id)! : { x: 0, y: 0 };
  return { ...f, manual: false, nodes: f.nodes.map((n) => { const p = pos.get(n.id); return p ? { ...n, x: p.x - base.x, y: p.y } : n; }) };
}
const arrange = (f: Flow) => (f.manual ? f : layout(f));

/* ---------- validação ---------- */
export interface Names { etapa: string[]; tag: string[]; produto: string[]; vendedor: string[]; modelo: string[] }
export interface Issue { nodeId: string; text: string; /** falta preencher (em vez de erro de estrutura) */ incomplete?: boolean }
const REF: Partial<Record<FieldInput, keyof Names>> = { etapa: "etapa", tag: "tag", produto: "produto", vendedor: "vendedor", vendedor_rodizio: "vendedor", vendedor_lead: "vendedor", modelo: "modelo" };
const FIXED = ["Rodízio", "Responsável pelo lead"];
function checkValue(input: FieldInput, label: string, v: string, optional: boolean, names?: Names): { text: string; incomplete?: boolean } | null {
  if (!v.trim()) return optional ? null : { text: `Preencha “${label}”.`, incomplete: true };
  if (input === "numero" && !(Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 999)) return { text: `“${label}” deve ser um número de 1 a 999.` };
  const ref = REF[input];
  if (ref && names && !FIXED.includes(v) && !names[ref].includes(v)) return { text: ref === "modelo" ? `O modelo “${v}” não está aprovado.` : `“${v}” não existe mais.` };
  return null;
}
export function validate(f: Flow, names?: Names): Issue[] {
  const out: Issue[] = [], add = (nodeId: string, text: string, incomplete?: boolean) => out.push({ nodeId, text, incomplete });
  const ids = new Set(f.nodes.map((n) => n.id)), trig = f.nodes.filter((n) => n.kind === "gatilho"), live = reachable(f);
  if (!trig.length) add("", "O fluxo não tem gatilho.");
  trig.slice(1).forEach((n) => add(n.id, "Só pode haver um gatilho."));
  for (const n of f.nodes) {
    for (const d of defOf(n).fields) { if (d.show && !d.show(n.config)) continue; const e = checkValue(d.input, d.label, n.config[d.key] ?? "", !!d.optional, names); if (e) add(n.id, e.text, e.incomplete); }
    if (n.kind === "condicao") {
      if (!n.rules?.length) add(n.id, "Adicione ao menos uma verificação.", true);
      for (const r of n.rules ?? []) { const d = ruleOf(r.type); if (!d) { add(n.id, "Verificação desconhecida."); continue; } const e = checkValue(d.input, d.label, r.value, false, names); if (e) add(n.id, e.text, e.incomplete); }
    }
    if (!live.has(n.id)) { if (n.kind !== "fim" && n.kind !== "gatilho") add(n.id, "Bloco desconectado: seria ignorado."); continue; }
    for (const o of outsOf(n)) { const es = f.edges.filter((e) => e.source === n.id && e.out === o); if (!es.length || !ids.has(es[0].target)) add(n.id, o === "next" ? "Falta a próxima etapa." : `Falta o caminho ${OUT_LABEL[o]}.`); else if (es.length > 1) add(n.id, "Esta saída tem mais de uma conexão."); }
    if (f.edges.some((e) => e.source === n.id) && descendants(f, n.id).has(n.id)) add(n.id, "O fluxo volta para este bloco (ciclo).");
  }
  const t = trig[0];
  if (t && !f.nodes.some((n) => live.has(n.id) && n.kind === "acao")) add(t.id, "Adicione ao menos uma ação.", true);
  if (t) for (const n of f.nodes) {
    if (!live.has(n.id) || n.kind !== "acao") continue;
    if ((t.type === "etapa" && n.type === "etapa" && n.config.etapa && n.config.etapa === t.config.etapa) || (t.type === "tag" && n.type === "tag_add" && n.config.tag && n.config.tag === t.config.tag)) add(n.id, "Laço bloqueado: esta ação dispara o próprio gatilho.");
  }
  /* no máximo uma mensagem automática a cada 24 h em um mesmo caminho */
  const flagged = new Set<string>();
  const walk = (id: string, since: number, path: Set<string>) => {
    const n = nodeOf(f, id);
    if (!n || path.has(id)) return;
    let s = since;
    if (n.kind === "atraso") s += delayHours(n.config);
    if (n.kind === "acao" && (n.type === "mensagem" || n.type === "modelo")) { if (s < 24 && !flagged.has(id)) { flagged.add(id); add(id, "Segunda mensagem em menos de 24 h no mesmo caminho."); } s = 0; }
    path.add(id);
    for (const e of f.edges) if (e.source === id) walk(e.target, s, path);
    path.delete(id);
  };
  if (t) walk(t.id, Infinity, new Set());
  return out;
}
