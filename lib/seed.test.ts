// Confere que o seed bate com os totais da especificação. Rode: npm test
import assert from "node:assert";
import { test } from "node:test";
import { deals, conversations, contacts } from "./data/seed.ts";
import { can } from "./permissions.ts";
import { parseCsv, toCsv } from "./format.ts";

const month = deals.filter((d) => d.createdAt >= new Date(2026, 10, 1).toISOString());
test("totais do funil", () => {
  const pipe = month.filter((d) => d.status !== "perdido");
  const t = (s: string) => { const x = pipe.filter((d) => d.stageId === s); return [x.length, x.reduce((a, d) => a + d.value, 0)]; };
  assert.deepEqual(t("novo"), [8, 148600]);
  assert.deepEqual(t("atendimento"), [11, 263900]);
  assert.deepEqual(t("proposta"), [6, 171300]);
  assert.deepEqual(t("negociacao"), [4, 212400]);
  assert.deepEqual(t("ganho"), [9, 96300]);
});
test("insights do mês", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => month.filter((d) => d.reached >= i).length), [126, 84, 41, 19, 9]);
  assert.equal(month.filter((d) => d.channel === "whatsapp").length, 79);
  for (const [u, n, r, p, v] of [["ana", 46, 7, 16, 41200], ["bruno", 42, 10, 14, 32600], ["camila", 38, 11, 11, 22500]] as const) {
    const m = month.filter((d) => d.ownerId === u);
    assert.equal(m.length, n);
    assert.equal(Math.round(m.reduce((a, d) => a + d.firstReplyMin, 0) / m.length), r);
    assert.equal(m.filter((d) => d.reached >= 2).length, p);
    assert.equal(m.filter((d) => d.status === "ganho").reduce((a, d) => a + d.value, 0), v);
  }
});
test("sem resposta = 7 e nomes únicos", () => {
  assert.equal(conversations.filter((v) => v.messages.filter((m) => m.kind !== "nota").at(-1)?.kind === "cliente").length, 7);
  assert.equal(new Set(contacts.map((c) => c.name)).size, contacts.length);
});
test("permissões", () => {
  const v = { id: "ana", role: "vendedor" as const }, g = { id: "rafael", role: "gestor" as const };
  assert.ok(can(v, "lead.view", { ownerId: null }) && !can(v, "lead.view", { ownerId: "bruno" }) && !can(v, "lead.reply", { ownerId: null }));
  assert.ok(!can(v, "campaigns") && can(g, "campaigns") && !can(g, "users") && can(v, "tag.create"));
});
test("csv ida e volta e proteção de fórmula", () => {
  assert.deepEqual(parseCsv(toCsv([["a;b", 'c"d'], ["x\ny", "=1+1"]])), [["a;b", 'c"d'], ["x\ny", "'=1+1"]]);
});
