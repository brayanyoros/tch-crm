import assert from "node:assert";
import { test } from "node:test";
import { conversationView, db, dealView, setSession } from "./data/db.ts";
import type { Settings } from "./data/types.ts";
import { fromSp, toInput } from "./campaign/schedule.ts";
import { change, closeRate, cohort, createdIn, goalStatus, monthForecast, monthSeries, openNow, ranges, sum, ticket, weighted, wonIn } from "./insights.ts";
import { clientTurn, priorities } from "./priorities.ts";

setSession("rafael");
const all = () => db.deals.map(dealView);
const s = (o: Partial<Settings> = {}): Settings => ({ ...structuredClone(db.settings), ...o });
const REF = fromSp(2026, 11, 22, 14, 32);

test("mês em Brasília e intervalo anterior equivalente", () => {
  const r = ranges({ period: "mes", from: "", to: "" }, REF);
  assert.equal(toInput(r.cur.from), "2026-11-01T00:00"); assert.equal(toInput(r.prev.from), "2026-10-01T00:00"); assert.equal(toInput(r.prev.to), "2026-10-22T14:32");
  const turn = ranges({ period: "mes", from: "", to: "" }, fromSp(2026, 12, 1, 0, 5));
  assert.equal(toInput(turn.cur.from), "2026-12-01T00:00"); assert.equal(toInput(turn.prev.to), "2026-11-01T00:05");
  const mar = ranges({ period: "mes", from: "", to: "" }, fromSp(2027, 3, 31, 10, 0));
  assert.equal(toInput(mar.prev.to), "2027-02-28T23:59");
  const d7 = ranges({ period: "7", from: "", to: "" }, REF);
  assert.equal(toInput(d7.cur.from), "2026-11-16T00:00"); assert.equal(d7.cur.to.getTime() - d7.cur.from.getTime(), d7.prev.to.getTime() - d7.prev.from.getTime());
});
test("vendas ganhas contam pelo fechamento, não pela criação", () => {
  const r = ranges({ period: "mes", from: "", to: "" }, REF).cur, ds = all();
  const w = wonIn(ds, r);
  assert.equal(w.length, 9); assert.equal(sum(w), 96300);
  const d = ds.find((x) => x.status === "ganho")!, oct = { ...d, createdAt: fromSp(2026, 10, 15, 10, 0).toISOString() };
  assert.ok(wonIn([oct], r).length === 1 && createdIn([oct], r).length === 0);
  assert.equal(ticket([]), null); assert.equal(ticket(w), 96300 / 9);
});
test("conversão de fechamento = ganhos ÷ (ganhos + perdidos) encerrados no período", () => {
  const r = ranges({ period: "mes", from: "", to: "" }, REF).cur, c = closeRate(all(), r);
  assert.equal(c.rate, c.won.length / (c.won.length + c.lost.length)); assert.ok(c.lost.every((d) => d.status === "perdido"));
  assert.equal(closeRate([], r).rate, null);
});
test("variação: anterior zero é 'sem base', nunca infinito", () => {
  assert.deepEqual(change(10, 0), { kind: "sem_base" }); assert.deepEqual(change(0, 0), { kind: "igual" }); assert.equal(change(null, 5), null);
  assert.equal((change(114, 100) as { value: number }).value.toFixed(2), "0.14");
});
test("meta: ausente, superada, mês encerrado e hoje no cálculo", () => {
  const none = goalStatus(s({ goalsByMonth: {} }), 96300, REF);
  assert.equal(none.goal, null); assert.equal(none.pct, null); assert.equal(none.pace, null);
  const g = goalStatus(s(), 96300, REF);
  assert.equal(g.goal, 165000); assert.equal(g.remaining, 68700);
  /* domingo 22/11 não é dia comercial; restam 23–28 e 30/11 = 7 dias */
  assert.equal(g.daysLeft, 7); assert.equal(g.todayCounts, false); assert.equal(g.pace, 68700 / 7);
  const mon = goalStatus(s(), 0, fromSp(2026, 11, 23, 10, 0)); assert.ok(mon.todayCounts); assert.equal(mon.daysLeft, 7);
  const over = goalStatus(s(), 200000, REF); assert.equal(over.remaining, 0); assert.ok(over.pct! > 1);
  const end = goalStatus(s(), 1, fromSp(2026, 11, 30, 19, 0)); assert.ok(end.ended); assert.equal(end.pace, null);
  assert.equal(goalStatus(s(), 41200, REF, "ana").goal, 60000);
});
test("série: realizado para até hoje, meta acumulada até o fim do mês", () => {
  const sr = monthSeries(all(), s(), 165000, REF);
  assert.equal(sr.length, 30); assert.equal(sr[21].realizado, 96300); assert.equal(sr[22].realizado, null); assert.equal(sr[29].meta, 165000);
});
test("previsão: não soma ganhos de novo e separa sem data", () => {
  const ds = all(), f = monthForecast(ds, REF);
  assert.ok(f.inMonth.every((d) => d.status === "aberto")); assert.equal(f.inMonth.length + f.overdue.length + f.noDate.length + openNow(ds).filter((d) => d.expectedCloseAt && d.expectedCloseAt > "2026-11-30").length, openNow(ds).length);
  assert.ok(f.estimated <= f.potential); assert.equal(f.estimated, weighted(f.inMonth));
});
test("coorte: cada negócio uma vez; amostra pequena sinalizada", () => {
  const r = ranges({ period: "mes", from: "", to: "" }, REF).cur, c = cohort(all(), r, db.stages);
  assert.deepEqual(c.steps.map((x) => x.deals.length), [126, 84, 41, 19, 9]); assert.equal(c.small, false);
  assert.ok(cohort(all(), { from: fromSp(2026, 11, 22, 14, 0), to: REF }, db.stages).small);
});
test("pendências: mostra a mensagem do cliente, não a automática, e não zera a espera", () => {
  const v = db.conversations.find((x) => db.contacts.find((c) => c.id === x.contactId)?.name === "Thiago Moura")!;
  const before = conversationView(v).waitingSince;
  v.messages.push({ id: "auto1", kind: "equipe", text: "Recebemos sua mensagem…", at: REF.toISOString(), status: "enviada" });
  const cv = conversationView(v), t = clientTurn(cv);
  assert.equal(cv.waitingSince, before); assert.ok(t.autoReplied); assert.match(t.lastClient!.text, /aquecedor/);
  const list = priorities({ convs: db.conversations.map(conversationView), deals: all(), tasks: [], settings: s(), ref: REF });
  const item = list.find((x) => x.name === "Thiago Moura")!;
  assert.equal(item.kind, "aguardando"); assert.match(item.reason, /automática/);
  assert.equal(new Set(list.map((x) => x.contactId)).size, list.length);
  v.messages.pop();
});
