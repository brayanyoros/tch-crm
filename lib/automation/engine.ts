/*
 * Motor de automações. Simular e executar percorrem o fluxo com o mesmo código:
 * a única diferença é aplicar ou não o efeito de cada ação.
 * Roda no navegador de quem está logado (mock); no Supabase vira uma função agendada.
 */
import type { Automation, Contact, Conversation, Deal, Flow, FlowNode, Out, Task, User } from "../data/types";
import { changed, conversationView, db, newId, nowIso, userOf, windowEndsAt } from "../data/db";
import { dateTime, DAY, HOUR, norm, now } from "../format";
import { summaryText } from "../ai/summary";
import { defOf, delayHours, ruleOf, titleOf } from "./catalog";
import { edgeFrom, nodeOf, triggerOf } from "./flow";
import { loadAutomations } from "./storage";

export interface FlowEvent { type: string; contactId: string; dealId?: string; taskId?: string; value?: string; channel?: string; category?: string }
export interface Step { nodeId: string; ok: boolean; text: string; out?: Out; skipped?: boolean }
interface Env { contact: Contact; deal?: Deal; conv?: Conversation; task?: Task; at: Date; stage?: string; tags: string[]; owner: User | null; windowEnd?: Date; lastAuto?: Date; chain: string[]; automation: Pick<Automation, "id" | "name"> }

/* ---------- horário do showroom ---------- */
const openDay = (d: Date) => { const days = db.settings.hours.days, w = d.getDay(); return days === "Todos os dias" || (w !== 0 && (days !== "Segunda a sexta" || w !== 6)); };
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
export const isOpen = (d: Date) => openDay(d) && hhmm(d) >= db.settings.hours.open && hhmm(d) < db.settings.hours.close;
export function nextOpening(d: Date) {
  const [h, m] = db.settings.hours.open.split(":").map(Number), x = new Date(d);
  x.setHours(h, m, 0, 0);
  while (x <= d || !openDay(x)) x.setDate(x.getDate() + 1);
  return x;
}
export const hoursText = () => `${db.settings.hours.days}, das ${db.settings.hours.open} às ${db.settings.hours.close}`;

/* ---------- ambiente ---------- */
function envFor(a: Pick<Automation, "id" | "name">, ev: FlowEvent, at: Date, chain: string[]): Env | null {
  const contact = db.contacts.find((c) => c.id === ev.contactId);
  if (!contact) return null;
  const deals = db.deals.filter((d) => d.contactId === contact.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  const deal = deals.find((d) => d.id === ev.dealId) ?? deals.find((d) => d.status === "aberto") ?? deals.find((d) => d.status === "ganho");
  const conv = db.conversations.find((v) => v.contactId === contact.id);
  const auto = conv && [...conv.messages].reverse().find((m) => m.kind === "equipe" && !m.authorId), end = conv && windowEndsAt(conv);
  return {
    contact, deal, conv, task: db.tasks.find((t) => t.id === ev.taskId), at, chain, automation: a,
    stage: db.stages.find((s) => s.id === deal?.stageId)?.name, tags: contact.tagIds.flatMap((t) => db.tags.find((x) => x.id === t)?.name ?? []), owner: userOf(contact.ownerId),
    windowEnd: ev.type === "mensagem" ? new Date(at.getTime() + db.settings.limits.windowH * HOUR) : end ? new Date(end) : undefined, lastAuto: auto ? new Date(auto.at) : undefined,
  };
}
export const channelName = (c?: Conversation | null, k?: Contact) => ((c?.channel ?? k?.channels[0]) === "instagram" ? "Instagram" : "WhatsApp");
function holds(e: Env, type: string, value: string): boolean {
  switch (type) {
    case "canal": return channelName(e.conv, e.contact) === value;
    case "etapa": return e.stage === value;
    case "tag": return e.tags.includes(value);
    case "responsavel": return e.owner?.name === value;
    case "valor": return (e.deal?.value ?? 0) >= Number(value);
    case "produto": return e.deal?.title === value;
    case "origem": return e.deal?.origin === value;
    case "horario": return isOpen(e.at) === (value === "Dentro do horário");
    default: return false;
  }
}
/** O evento atende ao gatilho? */
export function matches(t: FlowNode, ev: FlowEvent): boolean {
  if (t.type !== ev.type) return false;
  const c = t.config;
  switch (t.type) {
    case "mensagem": return (!c.canal || c.canal === ev.channel) && (!c.palavra || norm(ev.value ?? "").includes(norm(c.palavra)));
    case "anuncio": return !c.categoria || norm(ev.category ?? "").includes(norm(c.categoria));
    case "etapa": return c.etapa === ev.value;
    case "tag": return c.tag === ev.value;
    case "botao": return norm(c.texto ?? "") === norm(ev.value ?? "");
    default: return true;
  }
}

/* ---------- ações ---------- */
let turn = 0;
let notifier: (userId: string, text: string, href: string) => void = () => {};
export const onNotify = (f: typeof notifier) => { notifier = f; };
const manager = () => db.users.find((u) => u.role === "gestor" && u.active) ?? null;
const seller = (name: string) => db.users.find((u) => u.name === name && u.active) ?? null;
type Plan = { ok: boolean; text: string; apply?: () => void };
const fail = (text: string): Plan => ({ ok: false, text });
const fill = (s: string, e: Env) => s.replaceAll("{{nome}}", e.contact.name.split(" ")[0]).replaceAll("{{produto}}", (e.deal?.title ?? "nossa linha outdoor").toLowerCase());
const history = (e: Env, text: string) => { if (e.deal) e.deal.history.push({ id: newId("h"), at: nowIso(), text: `${text} (automação ${e.automation.name})` }); };

function send(e: Env, text: string, template: boolean): Plan {
  if (!e.conv) return fail("o lead não tem conversa aberta");
  if (template && channelName(e.conv) !== "WhatsApp") return fail("modelos só saem no WhatsApp");
  if (!template && (!e.windowEnd || e.windowEnd <= e.at)) return fail("janela de 24h encerrada; use um modelo aprovado");
  if (e.lastAuto && e.at.getTime() - e.lastAuto.getTime() < 24 * HOUR) return fail("já houve mensagem automática para este lead em 24 h");
  e.lastAuto = e.at;
  const conv = e.conv;
  return { ok: true, text: `${template ? "Modelo" : "Mensagem"} para ${e.contact.name}: “${text}”`, apply: () => { conv.messages.push({ id: newId("m"), kind: "equipe", text, at: nowIso(), status: "enviada" }); } };
}
/** Decide o resultado da ação e devolve como aplicá-lo. Atualiza o ambiente, para as próximas etapas verem o efeito. */
function plan(n: FlowNode, e: Env): Plan {
  const c = n.config;
  switch (n.type) {
    case "mensagem": return c.texto?.trim() ? send(e, fill(c.texto, e), false) : fail("mensagem sem texto");
    case "modelo": { const t = db.templates.find((x) => x.name === c.modelo && x.status === "Aprovado"); return t ? send(e, fill(t.body, e), true) : fail("modelo não aprovado"); }
    case "tarefa": {
      const owner = c.responsavel === "Responsável pelo lead" ? e.owner ?? manager() : seller(c.responsavel ?? "");
      if (!owner) return fail("sem responsável para a tarefa");
      const k = Number(c.prazoN), due = c.prazo === "abertura" ? nextOpening(e.at) : c.prazo === "horas" && k ? new Date(e.at.getTime() + k * HOUR) : c.prazo === "dias" && k ? new Date(e.at.getTime() + k * DAY) : null;
      if (!due) return fail("prazo não definido");
      if (c.prazo === "dias") due.setHours(9, 0, 0, 0);
      const dueAt = due.toISOString();
      return { ok: true, text: `Tarefa “${c.titulo}” para ${owner.name}, ${dateTime(dueAt).toLowerCase()}`, apply: () => { db.tasks.push({ id: newId("t"), title: c.titulo, type: "Retorno", contactId: e.contact.id, dealId: e.deal?.id, dueAt, ownerId: owner.id }); } };
    }
    case "atribuir": {
      const ring = db.settings.distribution.members, rr = c.para === "Rodízio", u = rr ? userOf(ring[turn % Math.max(1, ring.length)] ?? null) : seller(c.para ?? "");
      if (!u) return fail("responsável não encontrado");
      e.owner = u;
      return { ok: true, text: `Responsável: ${u.name}${rr ? " (rodízio)" : ""}`, apply: () => { if (rr) turn++; e.contact.ownerId = u.id; for (const d of db.deals) if (d.contactId === e.contact.id && d.status === "aberto") d.ownerId = u.id; history(e, `Transferido para ${u.name}`); } };
    }
    case "etapa": {
      const i = db.stages.findIndex((s) => s.name === c.etapa), d = e.deal;
      if (i < 0) return fail("etapa não existe");
      if (!d || d.status === "perdido") return fail("o lead não tem negócio aberto");
      const from = e.stage; e.stage = c.etapa;
      return { ok: true, text: `Etapa: ${from} → ${c.etapa}`, apply: () => { const won = i === db.stages.length - 1; Object.assign(d, { stageId: db.stages[i].id, reached: Math.max(d.reached, i), status: won ? "ganho" : "aberto", closedAt: won ? nowIso() : undefined }); history(e, `Etapa: ${from} → ${c.etapa}`); emit({ type: "etapa", contactId: e.contact.id, dealId: d.id, value: c.etapa }, e.chain); } };
    }
    case "tag_add": case "tag_del": {
      const t = db.tags.find((x) => x.name === c.tag), add = n.type === "tag_add";
      if (!t) return fail("tag não existe");
      const had = e.tags.includes(t.name);
      e.tags = add ? [...new Set([...e.tags, t.name])] : e.tags.filter((x) => x !== t.name);
      return { ok: true, text: add ? (had ? `Já tinha a tag ${t.name}` : `Tag ${t.name} adicionada`) : had ? `Tag ${t.name} removida` : `Não tinha a tag ${t.name}`, apply: () => { if (add === had) return; e.contact.tagIds = add ? [...e.contact.tagIds, t.id] : e.contact.tagIds.filter((x) => x !== t.id); if (add) emit({ type: "tag", contactId: e.contact.id, dealId: e.deal?.id, value: t.name }, e.chain); } };
    }
    case "notificar": {
      const u = c.quem === "Gestor" ? manager() : e.owner ?? manager();
      if (!u) return fail("ninguém para avisar");
      return { ok: true, text: `Aviso para ${u.name}`, apply: () => notifier(u.id, `${e.automation.name}: ${e.contact.name}`, e.conv ? `/conversas/${e.conv.id}` : `/contatos/${e.contact.id}`) };
    }
    case "lista": { const l = c.lista?.trim(); return l ? { ok: true, text: `Incluído na lista “${l}”`, apply: () => { if (!e.contact.lists.includes(l)) e.contact.lists.push(l); } } : fail("lista sem nome"); }
    case "resumo": { const conv = e.conv; return conv ? { ok: true, text: "Resumo adicionado como nota interna", apply: () => { conv.messages.push({ id: newId("m"), kind: "nota", text: summaryText(conversationView(conv)), at: nowIso() }); } } : fail("o lead não tem conversa"); }
    default: return fail("ação não suportada");
  }
}

/* ---------- percurso ---------- */
interface Walked { steps: Step[]; wait?: { nodeId: string; until: Date } }
function walk(f: Flow, startId: string, e: Env, apply: boolean): Walked {
  const steps: Step[] = [], seen = new Set<string>();
  let id: string | undefined = startId;
  while (id) {
    const n = nodeOf(f, id);
    if (!n) { steps.push({ nodeId: id, ok: false, text: "conexão sem destino" }); break; }
    if (seen.has(id)) { steps.push({ nodeId: id, ok: false, text: "repetição bloqueada" }); break; }
    seen.add(id);
    let out: Out = "next";
    if (n.kind === "fim") { steps.push({ nodeId: id, ok: true, text: "Fluxo encerrado" }); break; }
    if (n.kind === "condicao") {
      const rules = n.rules ?? [], res = rules.map((r) => ({ say: ruleOf(r.type)?.say(r.value) ?? r.type, ok: holds(e, r.type, r.value) }));
      out = rules.length > 0 && res.every((r) => r.ok) ? "sim" : "nao";
      steps.push({ nodeId: id, ok: true, out, text: res.map((r) => `${r.say}: ${r.ok ? "sim" : "não"}`).join("; ") });
    } else if (n.kind === "atraso") {
      const until = new Date(e.at.getTime() + delayHours(n.config) * HOUR);
      steps.push({ nodeId: id, ok: true, out, text: `Aguarda até ${dateTime(until.toISOString()).toLowerCase()}` });
      if (apply) return { steps, wait: { nodeId: id, until } };
      e.at = until;
    } else if (n.kind === "acao") {
      const p = plan(n, e);
      if (apply && p.ok) p.apply?.();
      steps.push({ nodeId: id, ok: p.ok, out, text: p.ok ? p.text : `Não executada: ${p.text}` });
    } else steps.push({ nodeId: id, ok: true, out, text: "Gatilho disparado" });
    id = edgeFrom(f, n.id, out)?.target;
  }
  return { steps };
}

/* ---------- execução ---------- */
interface Waiting { automationId: string; flow: Flow; version: number; nodeId: string; ev: FlowEvent; until: Date; chain: string[] }
let waits: Waiting[] = [];
const fired = new Set<string>();
/** Só para testes. */
export const resetEngine = () => { waits = []; fired.clear(); turn = 0; };
export const waitingCount = (automationId: string) => waits.filter((w) => w.automationId === automationId).length;
function record(a: Automation, f: Flow, version: number, e: Env, steps: Step[]) {
  const acts = steps.filter((s) => { const k = nodeOf(f, s.nodeId)?.kind; return k === "acao" || k === "atraso"; }), bad = acts.filter((s) => !s.ok);
  a.runs.unshift({ id: newId("r"), at: nowIso(), contactName: e.contact.name, version, actions: acts.filter((s) => s.ok).map((s) => titleOf(nodeOf(f, s.nodeId)!)), ...(bad.length ? { failure: bad.map((s) => `${defOf(nodeOf(f, s.nodeId)!).label}: ${s.text.replace("Não executada: ", "")}`).join("; ") } : {}) });
  a.runs.length = Math.min(a.runs.length, 200);
}
function start(a: Automation, f: Flow, version: number, startId: string, ev: FlowEvent, chain: string[]) {
  const e = envFor(a, ev, now(), [...chain, a.id]);
  if (!e) return;
  const r = walk(f, startId, e, true);
  record(a, f, version, e, r.steps);
  if (r.wait) waits.push({ automationId: a.id, flow: f, version, nodeId: r.wait.nodeId, ev, until: r.wait.until, chain });
}
/** Um evento do CRM. `chain` são as automações que o causaram: nenhuma delas dispara de novo (laço). */
export function emit(ev: FlowEvent, chain: string[] = []) {
  loadAutomations();
  for (const a of db.automations) {
    const t = a.status === "ativa" && a.published && triggerOf(a.published);
    if (t && !chain.includes(a.id) && matches(t, ev)) start(a, a.published!, a.version, t.id, ev, chain);
  }
}
/** Gatilhos de tempo e esperas vencidas. Só conta o que venceu depois da publicação. */
export function tick() {
  loadAutomations();
  const t0 = now();
  let did = false;
  const due = waits.filter((w) => w.until <= t0);
  if (due.length) {
    waits = waits.filter((w) => w.until > t0);
    for (const w of due) {
      const a = db.automations.find((x) => x.id === w.automationId), next = edgeFrom(w.flow, w.nodeId, "next")?.target;
      if (a?.status === "ativa" && next) { start(a, w.flow, w.version, next, { ...w.ev, type: "retomada" }, w.chain); did = true; }
    }
  }
  for (const a of db.automations) {
    const t = a.status === "ativa" && a.published && triggerOf(a.published);
    if (!t || !a.activatedAt) continue;
    const since = new Date(a.activatedAt);
    const fire = (key: string, when: Date, ev: FlowEvent) => { const k = `${a.id}:${key}`; if (when > t0 || when < since || fired.has(k)) return; fired.add(k); start(a, a.published!, a.version, t.id, ev, []); did = true; };
    if (t.type === "tarefa_atrasada") for (const x of [...db.tasks]) { if (!x.doneAt && x.contactId) fire(x.id + x.dueAt, new Date(x.dueAt), { type: t.type, contactId: x.contactId, dealId: x.dealId, taskId: x.id }); }
    if (t.type === "pos_ganho") for (const d of db.deals) { if (d.status === "ganho" && d.closedAt) fire(d.id + d.closedAt, new Date(new Date(d.closedAt).getTime() + Number(t.config.dias) * DAY), { type: t.type, contactId: d.contactId, dealId: d.id }); }
    if (t.type === "sem_resposta") for (const v of db.conversations) { const l = v.messages.filter((m) => m.kind !== "nota").at(-1); if (!v.closed && l?.kind === "equipe") fire(v.id + l.id, new Date(new Date(l.at).getTime() + Number(t.config.horas) * HOUR), { type: t.type, contactId: v.contactId }); }
  }
  if (did) changed();
}

/* ---------- simulação ---------- */
export interface SimInput { contactId: string; at: Date; text?: string }
export interface SimResult { name: string; steps: Step[]; triggered: boolean; reason?: string }
export function simulate(a: Pick<Automation, "id" | "name">, f: Flow, i: SimInput): SimResult {
  const t = triggerOf(f), contact = db.contacts.find((c) => c.id === i.contactId);
  if (!t || !contact) return { name: contact?.name ?? "", steps: [], triggered: false, reason: "O fluxo não tem gatilho." };
  const conv = db.conversations.find((v) => v.contactId === contact.id);
  /* mensagem e botão testam o texto informado; nos demais, supõe que o evento do gatilho aconteceu */
  const ev: FlowEvent = { type: t.type, contactId: contact.id, channel: channelName(conv, contact), value: t.type === "mensagem" ? i.text ?? "" : t.type === "etapa" ? t.config.etapa : t.type === "tag" ? t.config.tag : t.config.texto, category: t.config.categoria };
  if (!matches(t, ev)) return { name: contact.name, steps: [], triggered: false, reason: t.config.canal && t.config.canal !== ev.channel ? `O canal do lead é ${ev.channel}.` : "A mensagem não contém a palavra-chave." };
  const e = envFor(a, ev, new Date(i.at), [a.id])!;
  if (t.type === "etapa") e.stage = t.config.etapa;
  if (t.type === "tag" && t.config.tag) e.tags = [...new Set([...e.tags, t.config.tag])];
  return { name: contact.name, steps: walk(f, t.id, e, false).steps, triggered: true };
}
