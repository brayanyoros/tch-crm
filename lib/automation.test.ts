import assert from "node:assert";
import { beforeEach, test } from "node:test";
import { db, setSession } from "./data/db.ts";
import type { Automation, Flow, FlowNode } from "./data/types.ts";
import { emit, isOpen, nextOpening, resetEngine, simulate, tick } from "./automation/engine.ts";
import { blankFlow, connect, connectError, edgeFrom, insert, layout, migrate, newNode, nodeOf, outsOf, reachable, remove, removalImpact, triggerOf, validate, type LegacyRule } from "./automation/flow.ts";
import { getAutomation, listRefs, publishAutomation, saveDraft, setAutomationActive } from "./data/repositories/automations.ts";

/* navegador de mentira: o suficiente para persistir */
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };

const OFF: LegacyRule = { trigger: { type: "mensagem", value: "" }, conditions: [{ type: "horario", value: "Fora do horário" }], actions: [{ type: "mensagem", value: "Voltamos, {{nome}}." }, { type: "tarefa", value: "Retorno", prazo: "abertura" }] };
const SUNDAY = new Date(2026, 10, 22, 14, 32), MONDAY = new Date(2026, 10, 23, 10, 0);
const marcelo = () => db.contacts.find((c) => c.name === "Marcelo Tavares")!;
const conv = () => db.conversations.find((v) => v.contactId === marcelo().id)!;
const by = (f: Flow, p: (n: FlowNode) => boolean) => f.nodes.find(p)!;
const live = (flow: Flow, extra: Partial<Automation> = {}): Automation => ({ id: "t" + Math.random(), name: "Teste", status: "ativa", draft: flow, published: flow, version: 1, activatedAt: new Date(2026, 10, 22, 14, 0).toISOString(), runs: [], ...extra });
beforeEach(() => { resetEngine(); setSession("rafael"); db.automations.splice(0); });

test("migração: E num bloco só, ordem das ações, Não encerra", () => {
  const f = migrate({ ...OFF, conditions: [...OFF.conditions, { type: "canal", value: "WhatsApp" }] }), t = triggerOf(f)!;
  const cond = nodeOf(f, edgeFrom(f, t.id, "next")!.target)!;
  assert.deepEqual(cond.rules!.map((r) => r.type), ["horario", "canal"]);
  const a1 = nodeOf(f, edgeFrom(f, cond.id, "sim")!.target)!, a2 = nodeOf(f, edgeFrom(f, a1.id, "next")!.target)!;
  assert.deepEqual([a1.type, a2.type, a2.config.prazo, nodeOf(f, edgeFrom(f, a2.id, "next")!.target)!.kind, nodeOf(f, edgeFrom(f, cond.id, "nao")!.target)!.kind], ["mensagem", "tarefa", "abertura", "fim", "fim"]);
  assert.deepEqual(validate(f), []);
});
test("posição não muda a execução", () => {
  const f = migrate(OFF), mixed = { ...f, nodes: f.nodes.map((n, i) => ({ ...n, x: -i * 300, y: -i * 90 })).reverse() };
  const run = (x: Flow) => simulate({ id: "x", name: "x" }, x, { contactId: marcelo().id, at: SUNDAY, text: "oi" }).steps.map((s) => s.nodeId);
  assert.deepEqual(run(mixed), run(f));
});
test("simulação percorre Sim e Não sem alterar dados", () => {
  const f = migrate(OFF), n = conv().messages.length, k = db.tasks.length;
  const yes = simulate({ id: "x", name: "x" }, f, { contactId: marcelo().id, at: SUNDAY, text: "oi" }), no = simulate({ id: "x", name: "x" }, f, { contactId: marcelo().id, at: MONDAY, text: "oi" });
  assert.equal(yes.steps[1].out, "sim"); assert.match(yes.steps[2].text, /Voltamos, Marcelo/); assert.equal(yes.steps.length, 5);
  assert.equal(no.steps[1].out, "nao"); assert.equal(no.steps.length, 3);
  assert.equal(conv().messages.length, n); assert.equal(db.tasks.length, k);
});
test("execução faz o mesmo que a simulação e respeita 1 mensagem em 24 h", () => {
  const f = migrate(OFF), a = live(f), sim = simulate(a, f, { contactId: marcelo().id, at: SUNDAY, text: "oi" });
  db.automations.push(a);
  const n = conv().messages.length, k = db.tasks.length;
  conv().messages.push({ id: "mx", kind: "cliente", text: "oi", at: SUNDAY.toISOString() });
  emit({ type: "mensagem", contactId: marcelo().id, value: "oi", channel: "WhatsApp" });
  assert.equal(conv().messages.length, n + 2); assert.equal(db.tasks.length, k + 1);
  assert.deepEqual(a.runs[0].actions, ["Enviar mensagem", "Criar tarefa"]);
  assert.equal(sim.steps.filter((s) => s.ok).length, 5);
  assert.equal(new Date(db.tasks.at(-1)!.dueAt).getTime(), new Date(2026, 10, 23, 9).getTime());
  emit({ type: "mensagem", contactId: marcelo().id, value: "oi de novo", channel: "WhatsApp" });
  assert.equal(conv().messages.length, n + 2); assert.match(a.runs[0].failure!, /24 h/);
});
test("palavra-chave e canal filtram o gatilho", () => {
  const f = migrate({ trigger: { type: "mensagem", value: "prazo" }, conditions: [], actions: [{ type: "tag_add", value: "Sauna" }] });
  const go = (text: string) => simulate({ id: "x", name: "x" }, f, { contactId: marcelo().id, at: SUNDAY, text }).triggered;
  assert.ok(go("Qual o PRAZO?")); assert.ok(!go("bom dia"));
});
test("inserir no meio preserva a ordem; condição manda o resto para o Sim", () => {
  let f = migrate(OFF); const msg = by(f, (n) => n.kind === "acao" && n.type === "mensagem"), task = by(f, (n) => n.type === "tarefa"), w = newNode("atraso", "aguardar"), c = newNode("condicao", "condicao");
  f = insert(f, msg.id, "next", w);
  assert.equal(edgeFrom(f, msg.id, "next")!.target, w.id); assert.equal(edgeFrom(f, w.id, "next")!.target, task.id);
  f = insert(f, w.id, "next", c);
  assert.equal(edgeFrom(f, c.id, "sim")!.target, task.id); assert.equal(nodeOf(f, edgeFrom(f, c.id, "nao")!.target)!.kind, "fim");
  for (const n of f.nodes) for (const o of outsOf(n)) assert.ok(edgeFrom(f, n.id, o));
});
test("conexões inválidas e ciclos são recusados; trocar não deixa Encerrar solto", () => {
  let f = migrate(OFF); const t = triggerOf(f)!, c = by(f, (n) => n.kind === "condicao"), task = by(f, (n) => n.type === "tarefa");
  assert.match(connectError(f, task.id, c.id)!, /ciclo/); assert.match(connectError(f, task.id, t.id)!, /gatilho/);
  assert.equal(connect(f, task.id, "next", c.id), f);
  f = connect(f, c.id, "nao", task.id);
  assert.equal(edgeFrom(f, c.id, "nao")!.target, task.id); assert.equal(f.nodes.filter((n) => n.kind === "fim").length, 1);
  assert.deepEqual(validate(f), []);
});
test("excluir: ação religa; condição mantém um caminho ou nenhum", () => {
  const f = migrate(OFF), c = by(f, (n) => n.kind === "condicao"), msg = by(f, (n) => n.kind === "acao" && n.type === "mensagem"), task = by(f, (n) => n.type === "tarefa"), t = triggerOf(f)!;
  assert.equal(edgeFrom(remove(f, msg.id), c.id, "sim")!.target, task.id);
  assert.equal(removalImpact(f, c.id, "sim").length, 0); assert.equal(removalImpact(f, c.id, "nao").length, 2);
  assert.equal(edgeFrom(remove(f, c.id, "sim"), t.id, "next")!.target, msg.id);
  const none = remove(f, c.id, "nenhum");
  assert.equal(none.nodes.length, 2); assert.equal(reachable(none).size, 2); assert.equal(remove(f, t.id), f);
});
test("validação aponta o bloco", async () => {
  const names = await listRefs(), f = migrate({ trigger: { type: "tag", value: "Sauna" }, conditions: [{ type: "etapa", value: "Etapa apagada" }], actions: [{ type: "tag_add", value: "Sauna" }, { type: "tarefa", value: "Sem prazo" }, { type: "mensagem", value: "a" }, { type: "modelo", value: "retomada_orcamento" }] });
  const has = (type: string, re: RegExp) => assert.ok(validate(f, names).some((i) => nodeOf(f, i.nodeId)?.type === type && re.test(i.text)), type);
  has("condicao", /não existe/); has("tag_add", /Laço/); has("tarefa", /Prazo/); has("modelo", /menos de 24 h/);
  const lost = newNode("acao", "resumo"), g = { ...migrate(OFF), nodes: [...migrate(OFF).nodes, lost] };
  assert.ok(validate(g).some((i) => i.nodeId === lost.id && /desconectado/.test(i.text)));
  assert.ok(validate(blankFlow()).some((i) => /ao menos uma ação/.test(i.text)));
});
test("rascunho isolado da versão publicada, e persistido", async () => {
  const { id } = await saveDraft(undefined, "Isolada", migrate({ trigger: { type: "lead", value: "" }, conditions: [], actions: [{ type: "tag_add", value: "Sauna" }] }));
  assert.equal((await getAutomation(id)).status, "rascunho");
  emit({ type: "lead", contactId: marcelo().id }); assert.ok(!marcelo().tagIds.includes("sauna"));
  await publishAutomation(id);
  const a = await getAutomation(id), edited = structuredClone(a.draft);
  by(edited, (n) => n.type === "tag_add").config.tag = "Prioridade";
  await saveDraft(id, "Isolada", edited);
  emit({ type: "lead", contactId: marcelo().id });
  assert.ok(marcelo().tagIds.includes("sauna") && !marcelo().tagIds.includes("prioridade"));
  const saved = (JSON.parse(store.get("tch-automacoes-v1")!) as Automation[]).find((x) => x.id === id)!;
  assert.equal(by(saved.draft, (n) => n.type === "tag_add").config.tag, "Prioridade"); assert.equal(by(saved.published!, (n) => n.type === "tag_add").config.tag, "Sauna");
  await publishAutomation(id); emit({ type: "lead", contactId: marcelo().id }); assert.ok(marcelo().tagIds.includes("prioridade"));
  await setAutomationActive(id, false);
  assert.equal((await getAutomation(id)).version, 2);
  await saveDraft(id, "Isolada", blankFlow()); await assert.rejects(publishAutomation(id), /Revise/);
  setSession("ana"); await assert.rejects(saveDraft(id, "x", blankFlow()), /permissão/);
});
test("falha ao persistir desfaz e avisa", async () => {
  const set = localStorage.setItem; localStorage.setItem = () => { throw new Error("cheio"); };
  await assert.rejects(saveDraft(undefined, "Não salva", blankFlow()), /não permitiu salvar/);
  localStorage.setItem = set; assert.ok(!db.automations.some((a) => a.name === "Não salva"));
});
test("laço entre automações é cortado", () => {
  const mk = (from: string, to: string) => live(migrate({ trigger: { type: "tag", value: from }, conditions: [], actions: [{ type: "tag_del", value: from }, { type: "tag_add", value: to }] }));
  const a = mk("Condomínio", "Pousada"), b = mk("Pousada", "Condomínio"); db.automations.push(a, b);
  marcelo().tagIds = ["condominio"]; emit({ type: "tag", contactId: marcelo().id, value: "Condomínio" });
  assert.equal(a.runs.length, 1); assert.equal(b.runs.length, 1);
});
test("espera retoma só se continuar ativa; tempo só vale após publicar", () => {
  const f = migrate({ trigger: { type: "lead", value: "" }, conditions: [], actions: [{ type: "aguardar", value: "1 horas" }, { type: "tag_add", value: "Retorno" }] }), a = live(f); db.automations.push(a);
  emit({ type: "lead", contactId: marcelo().id }); assert.deepEqual(a.runs[0].actions, ["Aguardar"]); tick(); assert.equal(a.runs.length, 1);
  const real = Date.now; Date.now = () => real() + 3_700_000; tick(); Date.now = real;
  assert.deepEqual(a.runs[0].actions, ["Adicionar tag"]); assert.ok(marcelo().tagIds.includes("retorno"));
  const late = live(migrate({ trigger: { type: "tarefa_atrasada", value: "" }, conditions: [], actions: [{ type: "notificar", value: "Gestor" }] }), { activatedAt: new Date(2026, 10, 22, 14, 40).toISOString() });
  db.automations.push(late); tick(); assert.equal(late.runs.length, 0);
});
test("horário e próxima abertura", () => {
  assert.ok(!isOpen(SUNDAY) && isOpen(MONDAY)); assert.equal(nextOpening(new Date(2026, 10, 21, 19)).getDate(), 23);
  const f = layout(migrate(OFF)); const c = by(f, (n) => n.kind === "condicao"); assert.ok(nodeOf(f, edgeFrom(f, c.id, "sim")!.target)!.x < nodeOf(f, edgeFrom(f, c.id, "nao")!.target)!.x);
});
