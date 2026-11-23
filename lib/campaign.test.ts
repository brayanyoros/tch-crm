import assert from "node:assert";
import { beforeEach, test } from "node:test";
import { db, setSession } from "./data/db.ts";
import type { Audience, AudRule, CampaignDraft } from "./data/types.ts";
import { fromInput, fromSp, inWindow, nextWindow, planSend, sp, toInput } from "./campaign/schedule.ts";
import { blankAudience, evaluate, maskPhone, validPhone } from "./campaign/audience.ts";
import { checkVars, render, templateBlock } from "./campaign/message.ts";
import { confirmCampaign, getCampaign, readiness, saveAudience, saveCampaignDraft } from "./data/repositories/campaigns.ts";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
setSession("rafael");
const r = (o: Partial<AudRule> & Pick<AudRule, "field">): AudRule => ({ id: Math.random().toString(36), op: "inclui", values: [], ...o });
const aud = (o: Partial<Audience> = {}) => ({ ...blankAudience(), ...o });
/* segunda-feira 23/11/2026, 10:15 em Brasília (o cenário relatado) */
const MON_1015 = fromSp(2026, 11, 23, 10, 15);

test("fuso: Brasília é UTC−3 e a conversão é ida e volta", () => {
  assert.equal(MON_1015.toISOString(), "2026-11-23T13:15:00.000Z");
  assert.equal(toInput(MON_1015), "2026-11-23T10:15");
  assert.equal(fromInput("2026-11-24T09:30")!.toISOString(), "2026-11-24T12:30:00.000Z");
  assert.deepEqual(sp(MON_1015).wd, 1);
});
test("cenário relatado: 'Agora' às 10h15 de segunda sai agora, e 9h do mesmo dia é passado", () => {
  const now = planSend("agora", "", MON_1015);
  assert.ok(now.ok && now.immediate);
  const past = planSend("agendar", fromInput("2026-11-23T09:00")!.toISOString(), MON_1015);
  assert.ok(!past.ok); assert.match(past.reason!, /já passaram/);
});
test("fora da janela: 'Agora' vira agendamento para o próximo horário permitido, com motivo", () => {
  const sun = fromSp(2026, 11, 22, 14, 32), p = planSend("agora", "", sun);
  assert.ok(p.ok && !p.immediate); assert.equal(toInput(p.sendAt!), "2026-11-23T08:00"); assert.match(p.reason!, /fora do horário/);
  assert.equal(toInput(nextWindow(fromSp(2026, 11, 28, 20, 0))), "2026-11-30T08:00");
  assert.ok(inWindow(fromSp(2026, 11, 28, 19, 59)) && !inWindow(fromSp(2026, 11, 28, 20, 0)) && !inWindow(fromSp(2026, 11, 24, 7, 59)));
  const night = planSend("agendar", fromInput("2026-11-24T21:00")!.toISOString(), MON_1015);
  assert.ok(!night.ok); assert.equal(toInput(night.suggestion!), "2026-11-25T08:00");
});
test("público: vários valores, todas/qualquer, sem duplicar contato com vários negócios", () => {
  const saunas = evaluate(aud({ rules: [r({ field: "produto", values: ["vapor4", "seca6"] })] }));
  const ids = saunas.rows.map((x) => x.contactId);
  assert.equal(new Set(ids).size, ids.length);
  const both = evaluate(aud({ rules: [r({ field: "tag", values: ["pousada"] }), r({ field: "cidade", values: ["Teresópolis"] })] })).found;
  const either = evaluate(aud({ match: "qualquer", rules: [r({ field: "tag", values: ["pousada"] }), r({ field: "cidade", values: ["Teresópolis"] })] })).found;
  assert.ok(both < either);
  const not = evaluate(aud({ rules: [r({ field: "tag", op: "exclui", values: ["pousada"] })] }));
  assert.equal(not.found + evaluate(aud({ rules: [r({ field: "tag", values: ["pousada"] })] })).found, db.contacts.length);
});
test("exclusões contam cada contato uma vez, no primeiro motivo", () => {
  const res = evaluate(aud());
  assert.equal(res.found, db.contacts.length);
  assert.equal(Object.values(res.reasons).reduce((a, n) => a + (n ?? 0), 0), res.excluded);
  assert.equal(res.eligible + res.excluded, res.found);
  const c = db.contacts.find((x) => x.consent.status === "autorizado" && x.phone)!;
  const removed = evaluate(aud({ excludeContacts: [c.id] }));
  assert.equal(removed.eligible, res.eligible - 1); assert.equal(removed.reasons["Removido desta campanha"], 1);
});
test("telefone repetido e inválido não recebem", () => {
  const [a, b] = db.contacts.filter((x) => x.consent.status === "autorizado" && x.phone);
  const keep = b.phone; b.phone = a.phone;
  const res = evaluate(aud({ rules: [r({ field: "cidade", values: [a.city, b.city] })] }));
  assert.equal(res.rows.filter((x) => x.contactId === a.id || x.contactId === b.id).filter((x) => x.eligible).length, 1);
  b.phone = "123"; assert.equal(evaluate(aud()).rows.find((x) => x.contactId === b.id)!.reason, "Telefone inválido");
  b.phone = keep;
  assert.ok(validPhone("(21) 98741-2263") && validPhone("+55 21 98741-2263") && !validPhone("(21) 1234")); assert.equal(maskPhone("(21) 98741-2263"), "(21) 9••••-2263");
});
test("última interação: nunca, últimos X dias, há mais de X dias", () => {
  const never = evaluate(aud({ rules: [r({ field: "interacao", op: "nunca" })] })), recent = evaluate(aud({ rules: [r({ field: "interacao", op: "ultimos", n: 1 })] })), old = evaluate(aud({ rules: [r({ field: "interacao", op: "mais_de", n: 1 })] }));
  assert.equal(never.found + recent.found + old.found, db.contacts.length);
  assert.ok(recent.rows.some((x) => x.name === "Marcelo Tavares"));
  assert.match(evaluate(aud({ rules: [r({ field: "interacao", op: "mais_de" })] })).problems[0], /dias/);
});
test("variáveis: valida o público inteiro e exige alternativa para quem fica sem valor", () => {
  const t = db.templates.find((x) => x.id === "tp2")!, ids = evaluate(aud()).rows.filter((x) => x.eligible).map((x) => x.contactId);
  const lone = db.contacts.find((c) => c.id === ids[3])!, owner = lone.ownerId; lone.ownerId = null; // um destinatário sem responsável
  const plain = checkVars(t, { nome: { source: "primeiro_nome" }, produto: { source: "responsavel" } }, ids);
  assert.equal(plain[0].problem, undefined); assert.ok(plain[1].missing > 0 && plain[1].problem);
  assert.equal(checkVars(t, { nome: { source: "primeiro_nome" }, produto: { source: "responsavel", fallback: "nossa equipe" } }, ids)[1].problem, undefined);
  lone.ownerId = owner;
  const marcelo = db.contacts.find((c) => c.name === "Marcelo Tavares")!;
  assert.match(render(t, { nome: { source: "primeiro_nome" }, produto: { source: "produto" } }, marcelo), /^Marcelo, .*sauna a vapor 4 pessoas/);
  assert.match(templateBlock(db.templates.find((x) => x.id === "tp1")!, "wa")!, /utilidade/); assert.match(templateBlock(db.templates.find((x) => x.id === "tp5")!, "wa")!, /aprovação/); assert.match(templateBlock(t, "outro")!, /outro número/);
});
const draft = (o: Partial<CampaignDraft> = {}): CampaignDraft => ({ name: "Teste", senderId: "wa", audience: aud({ rules: [r({ field: "tag", values: ["pousada"] })] }), templateId: "tp2", vars: { nome: { source: "primeiro_nome" }, produto: { source: "produto", fallback: "nossa linha" } }, replies: { owner: "manter", ownerId: "", replyTagId: "", buttons: [{ text: "Quero saber mais", action: "nada", value: "" }, { text: "Não tenho interesse", action: "nada", value: "" }] }, when: "agendar", scheduledAt: fromInput("2026-11-24T09:30")!.toISOString(), ...o });
beforeEach(() => { setSession("rafael"); });
test("prontidão aponta a etapa certa", () => {
  assert.deepEqual(readiness(draft(), MON_1015).problems, []);
  const bad = readiness(draft({ senderId: "x", audience: aud({ rules: [r({ field: "cidade", values: ["Lugar nenhum"] })] }), templateId: "tp5", scheduledAt: fromInput("2026-11-23T09:00")!.toISOString() }), MON_1015).problems.map((p) => p.step);
  assert.deepEqual([...new Set(bad)], ["configuracao", "publico", "mensagem", "envio"]);
});
test("rascunho persiste; confirmar uma vez só; recusa se o público mudou", async () => {
  const { id } = await saveCampaignDraft(draft({ scheduledAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }));
  assert.ok(JSON.parse(store.get("tch-campanhas-v1")!).campaigns.some((c: { id: string }) => c.id === id));
  const c = await getCampaign(id), p = readiness(c);
  if (!p.plan.ok) { await saveCampaignDraft({ ...c, scheduledAt: nextWindow(new Date(Date.now() + 86_400_000)).toISOString() }); }
  const r2 = readiness(await getCampaign(id));
  await assert.rejects(confirmCampaign(id, { eligible: r2.eligible + 1, sendAt: r2.plan.sendAt!.toISOString() }), /público mudou/);
  await confirmCampaign(id, { eligible: r2.eligible, sendAt: r2.plan.sendAt!.toISOString() });
  const done = await getCampaign(id);
  assert.equal(done.status, "Agendada"); assert.equal(done.recipients.length, r2.eligible); assert.ok(done.recipients.every((x) => x.status === "Na fila"));
  await assert.rejects(confirmCampaign(id, { eligible: r2.eligible, sendAt: r2.plan.sendAt!.toISOString() }), /já foi confirmada/);
  await assert.rejects(saveCampaignDraft({ ...done, name: "x" }), /já foi confirmada/);
});
test("falha ao salvar não perde nem corrompe", async () => {
  const set = localStorage.setItem, before = db.campaigns.length; localStorage.setItem = () => { throw new Error("cheio"); };
  await assert.rejects(saveCampaignDraft(draft({ name: "Não salva" })), /não permitiu salvar/);
  localStorage.setItem = set; assert.equal(db.campaigns.length, before);
  await assert.rejects(saveAudience("Pousadas e hotéis", aud()), /Já existe/);
  setSession("ana"); await assert.rejects(saveCampaignDraft(draft()), /permissão/);
});
