// Testes do banco: migrations + RLS + regras de negócio + motor de mensagens.
// Os webhooks passam pelo mesmo parser das Edge Functions (functions/_shared/meta/parse.ts).
// Rodar: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createDb, as, asService, createUser, rejects } from "./harness.mjs";
import { parseWebhook } from "../../functions/_shared/meta/parse.ts";

let db, admin, gestor, ana, bruno, wa, ig, stages, product;
const one = async (tx, sql, params = []) => (await tx.query(sql, params)).rows[0];
const all = async (tx, sql, params = []) => (await tx.query(sql, params)).rows;
const rpc = (tx, fn, args) => one(tx, `select ${fn} as r`, args).then((x) => x.r);
const now = () => Math.floor(Date.now() / 1000);

const waPayload = ({ id, from, name = "Cliente", text = "Olá", ts = now(), phoneNumberId = "1111", extra = {} }) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "9999", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { display_phone_number: "552136421880", phone_number_id: phoneNumberId },
    contacts: [{ profile: { name }, wa_id: from }],
    messages: [{ from, id, timestamp: String(ts), type: "text", text: { body: text }, ...extra }],
  } }] }],
});
const waStatus = (id, status, ts = now(), errors) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "9999", changes: [{ field: "messages", value: { metadata: { phone_number_id: "1111" }, statuses: [{ id, status, timestamp: String(ts), recipient_id: "x", ...(errors ? { errors } : {}) }] } }] }],
});

/** Aplica eventos normalizados como a Edge Function faz (mesmas RPCs). */
async function deliver(payload) {
  return asService(db, async (tx) => {
    const out = [];
    for (const ev of parseWebhook(payload)) {
      if (ev.kind === "message") {
        const ch = await rpc(tx, "public.svc_channel_lookup($1, $2)", [ev.channel, ev.accountId]);
        out.push(await rpc(tx, "public.svc_ingest_message($1, $2::jsonb)", [ch.id, JSON.stringify(ev.payload)]));
      } else if (ev.kind === "status") {
        const ch = await rpc(tx, "public.svc_channel_lookup($1, $2)", [ev.channel, ev.accountId]);
        out.push(await rpc(tx, "public.svc_record_status($1, $2, $3, $4, $5::jsonb, $6::jsonb)",
          [ch.id, ev.externalId, ev.status, new Date(ev.at * 1000).toISOString(), ev.error ? JSON.stringify(ev.error) : null, null]));
      } else if (ev.kind === "deleted") {
        const ch = await rpc(tx, "public.svc_channel_lookup($1, $2)", [ev.channel, ev.accountId]);
        out.push(await rpc(tx, "public.svc_message_deleted($1, $2)", [ch.id, ev.externalId]));
      } else if (ev.kind === "read") {
        const ch = await rpc(tx, "public.svc_channel_lookup($1, $2)", [ev.channel, ev.accountId]);
        out.push(await rpc(tx, "public.svc_record_read($1, $2, $3, $4)", [ch.id, ev.customerId, ev.externalId ?? null, new Date(ev.at * 1000).toISOString()]));
      } else out.push(ev);
    }
    return out;
  });
}

async function enqueue(user, p) {
  return as(db, user, (tx) => rpc(tx, "public.enqueue_outbound_message($1::jsonb)", [JSON.stringify({ client_id: crypto.randomUUID(), ...p })]));
}
async function claimAndComplete(id, externalId) {
  return asService(db, async (tx) => {
    const claimed = await all(tx, "select * from public.svc_claim_outbound(1, $1) r", [id]);
    await tx.query("select public.svc_complete_outbound($1, $2, null, null)", [id, externalId]);
    return claimed.map((x) => x.r);
  });
}

before(async () => {
  db = await createDb();
  admin = await createUser(db, "brayan@tch.com.br", "admin", "Brayan");
  gestor = await createUser(db, "rafael@tch.com.br", "gestor", "Rafael Monteiro");
  ana = await createUser(db, "ana@tch.com.br", "vendedor", "Ana Ribeiro");
  bruno = await createUser(db, "bruno@tch.com.br", "vendedor", "Bruno Medeiros");
  await db.query(`insert into public.channels (type, handle, status, phone_number_id, waba_id) values ('whatsapp', '(21) 3642-1880', 'conectado', '1111', '9999')`);
  await db.query(`insert into public.channels (type, handle, status, ig_user_id) values ('instagram', '@tchexperiencia', 'conectado', '17840000000000001')`);
  wa = (await one(db, `select id from public.channels where type = 'whatsapp'`)).id;
  ig = (await one(db, `select id from public.channels where type = 'instagram'`)).id;
  stages = (await all(db, `select id, name from public.pipeline_stages order by position`)).map((s) => s.id);
  product = (await one(db, `select id from public.products order by name limit 1`)).id;
});

// ---------------------------------------------------------------- equipe e RLS
test("perfis são criados pelo trigger do Auth com o papel do app_metadata", async () => {
  const rows = await all(db, `select email, role from public.profiles order by email`);
  assert.deepEqual(rows.map((r) => r.role).sort(), ["admin", "gestor", "vendedor", "vendedor"]);
});

test("anon não lê nada", async () => {
  await rejects(as(db, null, (tx) => tx.query("select * from public.contacts"), "anon"), "permission denied");
  await rejects(as(db, null, (tx) => tx.query("select * from public.messages"), "anon"), "permission denied");
});

test("vendedor vê só os próprios leads e os sem responsável; gestor vê todos", async () => {
  const mine = await as(db, ana, (tx) => rpc(tx, "public.create_contact($1, 'whatsapp', $2, 'Teresópolis')", ["Lead da Ana", "(21) 98888-1111"]));
  const free = await as(db, gestor, (tx) => rpc(tx, "public.create_contact($1, 'whatsapp', $2, 'Petrópolis', null, null)", ["Lead livre", "21 97777-2222"]));
  const seenByBruno = await as(db, bruno, (tx) => all(tx, "select id from public.contacts"));
  assert.ok(!seenByBruno.some((r) => r.id === mine), "Bruno não pode ver o lead da Ana");
  assert.ok(seenByBruno.some((r) => r.id === free), "lead sem responsável é visível");
  const seenByGestor = await as(db, gestor, (tx) => all(tx, "select id from public.contacts"));
  assert.ok(seenByGestor.some((r) => r.id === mine));
  const c = await one(db, "select phone, owner_id from public.contacts where id = $1", [mine]);
  assert.equal(c.phone, "+5521988881111");
  assert.equal(c.owner_id, ana);

  await as(db, ana, (tx) => tx.query("select public.claim_contact($1)", [free]));
  await rejects(as(db, bruno, (tx) => tx.query("select public.claim_contact($1)", [free])), "Contato não encontrado");
  assert.equal((await as(db, bruno, (tx) => all(tx, "select id from public.contacts where id = $1", [free]))).length, 0);
});

test("escrita direta em tabelas protegidas é negada; papel não pode ser autoalterado", async () => {
  await rejects(as(db, ana, (tx) => tx.query(`insert into public.contacts (name) values ('x')`)), "permission denied");
  await rejects(as(db, ana, (tx) => tx.query(`update public.profiles set role = 'admin' where id = $1`, [ana])), "permission denied");
  await rejects(as(db, ana, (tx) => tx.query(`insert into public.messages (conversation_id, channel_id, kind, status) values (gen_random_uuid(), $1, 'equipe', 'sent')`, [wa])), "permission denied");
  await as(db, ana, (tx) => tx.query(`update public.profiles set name = 'Ana R.' where id = $1`, [ana]));
  await rejects(as(db, ana, (tx) => tx.query("select public.assign_contacts(array[]::uuid[], $1)", [bruno])), "permissão");
  await rejects(as(db, ana, (tx) => tx.query("select public.svc_run_retention()")), "permission denied");
  const ch = await as(db, gestor, (tx) => one(tx, "select id, type, handle, status, phone_number_id from public.channels limit 1"));
  assert.equal(ch.token_secret_id, undefined);
  await rejects(as(db, gestor, (tx) => tx.query("select token_secret_id from public.channels")), "permission denied");
  await rejects(as(db, gestor, (tx) => tx.query("select * from public.channels")), "permission denied");
});

test("telefone duplicado (com e sem nono dígito) é recusado", async () => {
  await rejects(as(db, gestor, (tx) => tx.query("select public.create_contact('Outro', 'whatsapp', '+55 21 8888-1111')")), "Já existe um contato com este telefone");
  const r = await as(db, gestor, (tx) => rpc(tx, "public.import_contacts($1::jsonb)", [JSON.stringify([
    { name: "Novo 1", channel: "whatsapp", handle: "(24) 99999-0001", city: "Petrópolis" },
    { name: "Repetido", channel: "whatsapp", handle: "21988881111", city: "" },
    { name: "Insta", channel: "instagram", handle: "@nova.cliente", city: "Rio" },
    { name: "", channel: "whatsapp", handle: "123", city: "" },
  ])]));
  assert.equal(r.added, 2);
  assert.equal(r.skipped, 2);
});

test("tarefas: vendedor só cria para si e só vê as próprias", async () => {
  await rejects(as(db, ana, (tx) => tx.query(`insert into public.tasks (title, type, due_at, owner_id) values ('x', 'Retorno', now(), $1)`, [bruno])), "row-level security");
  await as(db, ana, (tx) => tx.query(`insert into public.tasks (title, type, due_at, owner_id) values ('Ligar', 'Retorno', now() + interval '10 minutes', $1)`, [ana]));
  assert.equal((await as(db, bruno, (tx) => all(tx, "select * from public.tasks"))).length, 0);
  const n = await asService(db, (tx) => rpc(tx, "public.svc_task_reminders()", []));
  assert.ok(n >= 1);
  const notes = await as(db, ana, (tx) => all(tx, "select text from public.notifications"));
  assert.ok(notes.some((x) => x.text.startsWith("Lembrete: Ligar")));
});

test("usuário desativado perde o acesso na hora; admin não altera o próprio acesso", async () => {
  const temp = await createUser(db, "temp@tch.com.br", "vendedor");
  await as(db, admin, (tx) => tx.query("select public.admin_update_user($1, null, false)", [temp]));
  assert.equal((await as(db, temp, (tx) => all(tx, "select * from public.tags"))).length, 0);
  await rejects(as(db, temp, (tx) => tx.query("select public.create_contact('x', 'whatsapp', '21999990009')")), "Sessão encerrada");
  await rejects(as(db, admin, (tx) => tx.query("select public.admin_update_user($1, 'vendedor', null)", [admin])), "próprio acesso");
  await rejects(as(db, gestor, (tx) => tx.query("select public.admin_update_user($1, 'admin', null)", [ana])), "permissão");
});

// ---------------------------------------------------------------- funil
test("negócio: criar, mover, ganhar, perder e histórico", async () => {
  const id = await as(db, ana, (tx) => rpc(tx, "public.create_deal($1::jsonb)", [JSON.stringify({
    new_contact: { name: "Marcelo Tavares", channel: "whatsapp", handle: "21 96666-3333", city: "Teresópolis" },
    product_id: product, value: 38900, owner_id: bruno, stage_id: stages[0],
  })]));
  let d = await one(db, "select * from public.deals where id = $1", [id]);
  assert.equal(d.owner_id, ana, "vendedor não escolhe outro responsável");
  await as(db, ana, (tx) => tx.query("select public.move_deal($1, $2)", [id, stages[2]]));
  await as(db, ana, (tx) => tx.query("select public.move_deal($1, $2, 41000)", [id, stages[4]]));
  d = await one(db, "select * from public.deals where id = $1", [id]);
  assert.equal(d.status, "ganho"); assert.ok(d.closed_at); assert.equal(Number(d.value), 41000); assert.equal(d.reached, 4);
  await rejects(as(db, bruno, (tx) => tx.query("select public.lose_deal($1, 'Preço')", [id])), "Negócio não encontrado");
  await as(db, gestor, (tx) => tx.query("select public.lose_deal($1, 'Preço')", [id]));
  const hist = await as(db, ana, (tx) => all(tx, "select text from public.deal_history where deal_id = $1 order by id", [id]));
  assert.deepEqual(hist.map((h) => h.text), ["Negócio criado", "Etapa: Novo contato → Proposta enviada", "Etapa: Proposta enviada → Fechado ganho", "Marcado como perdido: Preço"]);
});

test("etapas: não exclui etapa com negócio aberto; última é sempre ganho", async () => {
  const id = await as(db, gestor, (tx) => rpc(tx, "public.create_deal($1::jsonb)", [JSON.stringify({
    new_contact: { name: "Teste Etapa", channel: "instagram", handle: "teste.etapa" }, product_id: product, value: 1, owner_id: gestor, stage_id: stages[3],
  })]));
  const cur = await all(db, "select id, name, chance from public.pipeline_stages order by position");
  await rejects(as(db, gestor, (tx) => tx.query("select public.save_stages($1::jsonb)", [JSON.stringify(cur.filter((_, i) => i !== 3))])), "Mova os negócios");
  await rejects(as(db, ana, (tx) => tx.query("select public.save_stages($1::jsonb)", [JSON.stringify(cur)])), "permissão");
  const next = [...cur.slice(0, 4), { name: "Visita técnica", chance: 85 }, cur[4]];
  await as(db, gestor, (tx) => tx.query("select public.save_stages($1::jsonb)", [JSON.stringify(next)]));
  const after = await all(db, "select name, position from public.pipeline_stages order by position");
  assert.deepEqual(after.map((s) => s.name), ["Novo contato", "Em atendimento", "Proposta enviada", "Negociação", "Visita técnica", "Fechado ganho"]);
  assert.equal((await one(db, "select reached from public.deals where id = $1", [id])).reached, 3);
});

// ---------------------------------------------------------------- WhatsApp: entrada
test("webhook do WhatsApp cria contato (rodízio), conversa, notificação; reentrega não duplica", async () => {
  await as(db, gestor, (tx) => tx.query(`select public.update_settings($1::jsonb)`, [JSON.stringify({ distribution: { mode: "rodizio", members: [ana, bruno] } })]));
  const p = waPayload({ id: "wamid.IN1", from: "5524977770001", name: "Daniela Rocha", text: "Quero saber o preço da sauna",
    extra: { referral: { source_type: "ad", source_id: "123", headline: "Sauna a vapor | Serra", ctwa_clid: "abc" } } });
  const [r] = await deliver(p);
  assert.equal(r.duplicate, false); assert.equal(r.new_contact, true);
  const c = await one(db, "select * from public.contacts where id = $1", [r.contact_id]);
  assert.equal(c.name, "Daniela Rocha"); assert.equal(c.wa_id, "5524977770001"); assert.equal(c.phone, "+5524977770001");
  assert.equal(c.origin, "Anúncio do Meta"); assert.ok([ana, bruno].includes(c.owner_id));
  const v = await one(db, "select * from public.conversations where id = $1", [r.conversation_id]);
  assert.equal(v.unread, 1); assert.ok(v.last_inbound_at); assert.ok(v.awaiting_since);
  const notif = await as(db, c.owner_id, (tx) => all(tx, "select text, href from public.notifications where href = $1", [`/conversas/${v.id}`]));
  assert.equal(notif.length, 1);

  const [dup] = await deliver(p);
  assert.equal(dup.duplicate, true);
  assert.equal((await one(db, "select count(*)::int n from public.messages where conversation_id = $1", [v.id])).n, 1);

  // próximo lead novo vai para a outra pessoa do rodízio
  const [r2] = await deliver(waPayload({ id: "wamid.IN2", from: "5524977770002", name: "Outro Lead" }));
  const c2 = await one(db, "select owner_id from public.contacts where id = $1", [r2.contact_id]);
  assert.notEqual(c2.owner_id, c.owner_id);
});

test("wa_id sem o nono dígito encontra o contato cadastrado com 9", async () => {
  const before = await one(db, "select id from public.contacts where phone = '+5521988881111'");
  const [r] = await deliver(waPayload({ id: "wamid.IN9", from: "552188881111", name: "Lead da Ana" }));
  assert.equal(r.contact_id, before.id);
  assert.equal(r.new_contact, false);
  assert.equal((await one(db, "select wa_id from public.contacts where id = $1", [before.id])).wa_id, "552188881111");
});

test("mídia recebida fica pendente para download e entra na fila do worker", async () => {
  const p = waPayload({ id: "wamid.IMG", from: "5524977770001", extra: { type: "image", text: undefined, image: { id: "MEDIA1", mime_type: "image/jpeg", sha256: "x", caption: "Meu deck" } } });
  const [r] = await deliver(p);
  assert.ok(r.media_id);
  const jobs = await asService(db, (tx) => all(tx, "select r from public.svc_claim_media(10) r"));
  assert.ok(jobs.some((j) => j.r.external_media_id === "MEDIA1" && j.r.channel_type === "whatsapp"));
  await asService(db, (tx) => tx.query("select public.svc_media_result($1, $2, 1234, 'image/jpeg', null)", [r.media_id, `inbound/${r.conversation_id}/x.jpg`]));
  assert.equal((await one(db, "select status from public.message_media where id = $1", [r.media_id])).status, "stored");
  const msg = await one(db, "select type, body from public.messages where id = $1", [r.message_id]);
  assert.deepEqual(msg, { type: "image", body: "Meu deck" });
});

// ---------------------------------------------------------------- WhatsApp: saída e status
test("envio dentro da janela, idempotência, status fora de ordem e status antes do id", async () => {
  const conv = (await one(db, "select v.id from public.conversations v join public.contacts c on c.id = v.contact_id where c.wa_id = '552188881111'")).id;
  const clientId = crypto.randomUUID();
  const m1 = await enqueue(ana, { conversation_id: conv, client_id: clientId, text: "Bom dia! Segue o orçamento." });
  const m1b = await enqueue(ana, { conversation_id: conv, client_id: clientId, text: "Bom dia! Segue o orçamento." });
  assert.equal(m1.id, m1b.id, "mesmo clique não gera duas mensagens");
  assert.equal(m1.status, "pending");
  await rejects(enqueue(bruno, { conversation_id: conv, text: "oi" }), "Conversa não encontrada");

  const v = await one(db, "select unread, awaiting_since from public.conversations where id = $1", [conv]);
  assert.equal(v.unread, 0); assert.equal(v.awaiting_since, null);

  // status "sent" chega antes de gravarmos o wamid (corrida real)
  await deliver(waStatus("wamid.OUT1", "delivered"));
  const [claimed] = await claimAndComplete(m1.id, "wamid.OUT1");
  assert.equal(claimed.recipient, "552188881111");
  assert.equal(claimed.channel.phone_number_id, "1111");
  let m = await one(db, "select status, delivered_at from public.messages where id = $1", [m1.id]);
  assert.equal(m.status, "delivered"); assert.ok(m.delivered_at);
  await deliver(waStatus("wamid.OUT1", "read"));
  await deliver(waStatus("wamid.OUT1", "delivered")); // atrasado: não regride
  await deliver(waStatus("wamid.OUT1", "failed", now(), [{ code: 131026, title: "x" }])); // falha após leitura é ignorada
  m = await one(db, "select status from public.messages where id = $1", [m1.id]);
  assert.equal(m.status, "read");

  const deal = await one(db, "select first_reply_min from public.deals d join public.contacts c on c.id = d.contact_id where c.wa_id = '552188881111' limit 1");
  void deal; // contato sem negócio aberto aqui; métrica testada abaixo
});

test("janela de 24h: texto bloqueado fora da janela; modelo exige aprovação e consentimento", async () => {
  const conv = (await one(db, "select v.id, v.contact_id from public.conversations v join public.contacts c on c.id = v.contact_id where c.wa_id = '5524977770001'"));
  const owner = (await one(db, "select owner_id from public.contacts where id = $1", [conv.contact_id])).owner_id;
  await db.query("update public.conversations set last_inbound_at = now() - interval '25 hours' where id = $1", [conv.id]);
  await rejects(enqueue(owner, { conversation_id: conv.id, text: "Oi?" }), "janela de 24h encerrou");
  const w = await as(db, owner, (tx) => rpc(tx, "public.conversation_window($1)", [conv.id]));
  assert.equal(w.open, false);

  const tpl = await asService(db, (tx) => rpc(tx, "public.svc_upsert_template($1, $2::jsonb)", [wa, JSON.stringify({
    name: "convite_showroom", language: "pt_BR", category: "marketing", status: "aprovado",
    body: "{{nome}}, a linha de verão chegou ao showroom. Venha sentir {{produto}} de perto.",
    components: [{ type: "BODY", text: "{{nome}}, a linha de verão chegou ao showroom. Venha sentir {{produto}} de perto." }],
  })]));
  await rejects(enqueue(owner, { conversation_id: conv.id, template: { id: tpl, params: { nome: "Daniela", produto: "a sauna" } } }), "não autorizou mensagens de marketing");
  await as(db, owner, (tx) => tx.query("select public.set_consent($1, 'autorizado', 'Formulário do showroom')", [conv.contact_id]));
  await rejects(enqueue(owner, { conversation_id: conv.id, template: { id: tpl, params: { nome: "Daniela" } } }), "Preencha todas as variáveis");
  const m = await enqueue(owner, { conversation_id: conv.id, template: { id: tpl, params: { nome: "Daniela", produto: "a sauna" } } });
  assert.equal(m.type, "template");
  assert.equal(m.body, "Daniela, a linha de verão chegou ao showroom. Venha sentir a sauna de perto.");
  const ev = await all(db, "select status, origin from public.consent_events where contact_id = $1", [conv.contact_id]);
  assert.equal(ev.length, 1);
});

test("falha temporária volta para a fila; envio preso vira falha ambígua (sem reenvio)", async () => {
  const conv = (await one(db, "select v.id from public.conversations v join public.contacts c on c.id = v.contact_id where c.wa_id = '552188881111'")).id;
  const m = await enqueue(ana, { conversation_id: conv, text: "Teste de retentativa" });
  await asService(db, async (tx) => {
    await tx.query("select * from public.svc_claim_outbound(1, $1)", [m.id]);
    await tx.query(`select public.svc_complete_outbound($1, null, '{"code":"130429","message":"limite"}'::jsonb, now() + interval '1 minute')`, [m.id]);
  });
  let row = await one(db, "select status, attempts, error_code from public.messages where id = $1", [m.id]);
  assert.deepEqual(row, { status: "pending", attempts: 1, error_code: "130429" });
  const none = await asService(db, (tx) => all(tx, "select * from public.svc_claim_outbound(10)"));
  assert.ok(!none.some((x) => x.svc_claim_outbound?.id === m.id), "respeita next_attempt_at");
  await db.query("update public.messages set next_attempt_at = now() - interval '1 second' where id = $1", [m.id]);
  await asService(db, (tx) => tx.query("select * from public.svc_claim_outbound(10)"));
  await db.query("update public.messages set locked_at = now() - interval '10 minutes' where id = $1", [m.id]);
  assert.equal(await asService(db, (tx) => rpc(tx, "public.svc_release_stuck_outbound()", [])), 1);
  row = await one(db, "select status, error_code from public.messages where id = $1", [m.id]);
  assert.deepEqual(row, { status: "failed", error_code: "ambiguous" });
});

test("pedido de saída por palavra-chave registra revogação do consentimento", async () => {
  const [r] = await deliver(waPayload({ id: "wamid.SAIR", from: "5524977770001", text: "  Sair " }));
  const c = await one(db, "select consent_status, consent_origin from public.contacts where id = $1", [r.contact_id]);
  assert.equal(c.consent_status, "saiu");
  const last = await one(db, "select status from public.consent_events where contact_id = $1 order by id desc limit 1", [r.contact_id]);
  assert.equal(last.status, "saiu");
});

test("tempo de resposta: primeira resposta humana calcula métrica no negócio aberto", async () => {
  const [r] = await deliver(waPayload({ id: "wamid.RT1", from: "5521955554444", name: "Gustavo Rezende", ts: now() - 600 }));
  const owner = (await one(db, "select owner_id from public.contacts where id = $1", [r.contact_id])).owner_id;
  const deal = await as(db, owner, (tx) => rpc(tx, "public.create_deal($1::jsonb)", [JSON.stringify({ contact_id: r.contact_id, product_id: product, value: 100, owner_id: owner, stage_id: stages[1] })]));
  await enqueue(owner, { conversation_id: r.conversation_id, text: "Oi Gustavo!" });
  const d = await one(db, "select first_reply_min, avg_reply_min, reply_count, origin from public.deals where id = $1", [deal]);
  assert.ok(d.first_reply_min >= 9 && d.first_reply_min <= 11, `first_reply_min=${d.first_reply_min}`);
  assert.equal(d.reply_count, 1);
  assert.equal(d.origin, "WhatsApp");
});

// ---------------------------------------------------------------- Instagram
test("Instagram: entrada, eco que chega antes da confirmação, leitura e mensagem apagada", async () => {
  const igIn = { object: "instagram", entry: [{ id: "17840000000000001", time: Date.now(), messaging: [{
    sender: { id: "900001" }, recipient: { id: "17840000000000001" }, timestamp: Date.now(), message: { mid: "aWdfbWlkMQ", text: "Vocês entregam em Búzios?" } }] }] };
  const [r] = await deliver(igIn);
  assert.equal(r.needs_profile, true);
  await asService(db, (tx) => tx.query("select public.svc_set_contact_profile($1, 'Fernanda Lacerda', 'fe.lacerda')", [r.contact_id]));
  const c = await one(db, "select name, instagram_username, channels from public.contacts where id = $1", [r.contact_id]);
  assert.equal(c.name, "Fernanda Lacerda"); assert.equal(c.instagram_username, "fe.lacerda");
  const owner = (await one(db, "select owner_id from public.contacts where id = $1", [r.contact_id])).owner_id;

  await rejects(enqueue(owner, { conversation_id: r.conversation_id, text: "Segue foto", media: { kind: "image", storage_path: `outbound/${r.conversation_id}/a.jpg`, mime_type: "image/jpeg", file_name: "a.jpg", size_bytes: 1000 } }), "mensagens separadas");
  const m = await enqueue(owner, { conversation_id: r.conversation_id, text: "Entregamos sim!" });
  const [claimed] = await asService(db, (tx) => all(tx, "select r from public.svc_claim_outbound(1, $1) r", [m.id]));
  assert.equal(claimed.r.recipient, "900001");
  // o eco da nossa própria mensagem chega antes da resposta da Graph API
  await deliver({ object: "instagram", entry: [{ id: "17840000000000001", messaging: [{ sender: { id: "17840000000000001" }, recipient: { id: "900001" }, timestamp: Date.now(), message: { mid: "aWdfbWlkMg", text: "Entregamos sim!", is_echo: true } }] }] });
  await asService(db, (tx) => tx.query("select public.svc_complete_outbound($1, 'aWdfbWlkMg', null, null)", [m.id]));
  const outs = await all(db, "select id, author_id, external_id from public.messages where conversation_id = $1 and kind = 'equipe'", [r.conversation_id]);
  assert.equal(outs.length, 1, "eco absorvido, sem mensagem duplicada");
  assert.equal(outs[0].external_id, "aWdfbWlkMg");

  await asService(db, (tx) => tx.query("select public.svc_record_read($1, '900001', 'aWdfbWlkMg', now())", [ig]));
  assert.equal((await one(db, "select status from public.messages where id = $1", [m.id])).status, "read");

  await deliver({ object: "instagram", entry: [{ id: "17840000000000001", messaging: [{ sender: { id: "900001" }, recipient: { id: "17840000000000001" }, timestamp: Date.now(), message: { mid: "aWdfbWlkMQ", is_deleted: true } }] }] });
  const del = await one(db, "select body, metadata from public.messages where external_id = 'aWdfbWlkMQ'");
  assert.equal(del.body, null); assert.equal(del.metadata.deleted, true);
});

test("Instagram: fora de 24h só com HUMAN_AGENT habilitado (até 7 dias)", async () => {
  const v = await one(db, "select v.id, c.owner_id from public.conversations v join public.contacts c on c.id = v.contact_id where c.instagram_id = '900001'");
  await db.query("update public.conversations set last_inbound_at = now() - interval '3 days' where id = $1", [v.id]);
  await rejects(enqueue(v.owner_id, { conversation_id: v.id, text: "Oi" }), "janela de atendimento do Instagram");
  await rejects(as(db, gestor, (tx) => tx.query("select public.set_instagram_human_agent(true)")), "permissão");
  await as(db, admin, (tx) => tx.query("select public.set_instagram_human_agent(true)"));
  const m = await enqueue(v.owner_id, { conversation_id: v.id, text: "Oi, tudo certo com o pedido?" });
  assert.equal(m.metadata.tag, "HUMAN_AGENT");
  await db.query("update public.conversations set last_inbound_at = now() - interval '8 days' where id = $1", [v.id]);
  await rejects(enqueue(v.owner_id, { conversation_id: v.id, text: "Oi" }), "janela de atendimento do Instagram");
  await rejects(enqueue(v.owner_id, { conversation_id: v.id, template: { id: crypto.randomUUID() } }), "apenas no WhatsApp");
});

// ---------------------------------------------------------------- webhooks: fila confiável
test("fila de webhooks: deduplica por hash, reprocessa com backoff", async () => {
  const id = await asService(db, (tx) => rpc(tx, "public.svc_store_webhook('whatsapp', '{}'::jsonb, 'hash-1')", []));
  assert.ok(id);
  assert.equal(await asService(db, (tx) => rpc(tx, "public.svc_store_webhook('whatsapp', '{}'::jsonb, 'hash-1')", [])), null);
  const claimed = await asService(db, (tx) => all(tx, "select * from public.svc_claim_webhook_events(10, $1)", [id]));
  assert.equal(claimed.length, 1);
  assert.equal((await asService(db, (tx) => all(tx, "select * from public.svc_claim_webhook_events(10, $1)", [id]))).length, 0, "já em processamento");
  await asService(db, (tx) => tx.query("select public.svc_finish_webhook_event($1, false, 'timeout')", [id]));
  const row = await one(db, "select status, attempts, next_attempt_at > now() as later from public.webhook_events where id = $1", [id]);
  assert.deepEqual(row, { status: "failed", attempts: 1, later: true });
});

// ---------------------------------------------------------------- campanhas
test("campanha: confirma uma vez, respeita consentimento, despacha, status e resposta", async () => {
  const tpl = (await one(db, "select id from public.templates where name = 'convite_showroom'")).id;
  const ok = await as(db, gestor, (tx) => rpc(tx, "public.create_contact('Cliente Autorizado', 'whatsapp', '21 93333-0001', 'Rio', null, null)", []));
  const nope = await as(db, gestor, (tx) => rpc(tx, "public.create_contact('Cliente Sem Consentimento', 'whatsapp', '21 93333-0002', 'Rio', null, null)", []));
  await as(db, gestor, (tx) => tx.query("select public.set_consent($1, 'autorizado', 'Cadastro no showroom')", [ok]));
  const campId = (await as(db, gestor, (tx) => one(tx, `insert into public.campaigns (name, sender_channel_id, template_id, vars) values ('Verão', $1, $2, $3::jsonb) returning id`,
    [wa, tpl, JSON.stringify({ nome: { source: "primeiro_nome" }, produto: { source: "produto", fallback: "nossa linha outdoor" } })]))).id;
  await rejects(as(db, ana, (tx) => tx.query(`insert into public.campaigns (name) values ('x')`)), "row-level security");
  await rejects(as(db, ana, (tx) => tx.query("select public.confirm_campaign($1, $2, now())", [campId, [ok, nope]])), "permissão");
  const res = await as(db, gestor, (tx) => rpc(tx, "public.confirm_campaign($1, $2, now())", [campId, [ok, nope]]));
  assert.deepEqual(res, { recipients: 1, skipped: 1 });
  await rejects(as(db, gestor, (tx) => tx.query("select public.confirm_campaign($1, $2, now())", [campId, [ok]])), "já foi confirmada");
  // confirmada não é mais editável (a RLS de update só enxerga rascunhos)
  await as(db, gestor, (tx) => tx.query(`update public.campaigns set name = 'x' where id = $1`, [campId]));
  assert.equal((await one(db, "select name from public.campaigns where id = $1", [campId])).name, "Verão");

  assert.equal(await asService(db, (tx) => rpc(tx, "public.svc_dispatch_campaigns(100)", [])), 1);
  const msg = await one(db, "select * from public.messages where campaign_id = $1", [campId]);
  assert.equal(msg.body, "Cliente, a linha de verão chegou ao showroom. Venha sentir nossa linha outdoor de perto.");
  assert.equal(msg.author_id, null);
  const [claimed] = await claimAndComplete(msg.id, "wamid.CAMP1");
  assert.equal(claimed.template.name, "convite_showroom");
  assert.deepEqual(claimed.template_params, { nome: "Cliente", produto: "nossa linha outdoor" });
  await deliver(waStatus("wamid.CAMP1", "delivered"));
  let rec = await one(db, "select status from public.campaign_recipients where campaign_id = $1", [campId]);
  assert.equal(rec.status, "Entregue");
  await asService(db, (tx) => rpc(tx, "public.svc_dispatch_campaigns(100)", []));
  assert.equal((await one(db, "select status from public.campaigns where id = $1", [campId])).status, "Concluída");
  const wa_id = (await one(db, "select ltrim(phone, '+') p from public.contacts where id = $1", [ok])).p;
  await deliver(waPayload({ id: "wamid.REPLY", from: wa_id, text: "Quero saber mais" }));
  rec = await one(db, "select status from public.campaign_recipients where campaign_id = $1", [campId]);
  assert.equal(rec.status, "Respondeu");
});

// ---------------------------------------------------------------- mesclagem, LGPD, Storage
test("mesclar contatos une conversas do mesmo canal e mantém o pedido de saída", async () => {
  const [a] = await deliver(waPayload({ id: "wamid.MA", from: "5531911110001", name: "Duplicado A" }));
  const [b] = await deliver(waPayload({ id: "wamid.MB", from: "5531911110002", name: "Duplicado B" }));
  await deliver(waPayload({ id: "wamid.MB2", from: "5531911110002", text: "parar" }));
  await as(db, gestor, (tx) => tx.query("select public.merge_contacts($1, $2)", [a.contact_id, b.contact_id]));
  const convs = await all(db, "select id, unread from public.conversations where contact_id = $1", [a.contact_id]);
  assert.equal(convs.length, 1);
  assert.equal((await one(db, "select count(*)::int n from public.messages where conversation_id = $1", [convs[0].id])).n, 3);
  const c = await one(db, "select consent_status, wa_id from public.contacts where id = $1", [a.contact_id]);
  assert.equal(c.consent_status, "saiu"); assert.equal(c.wa_id, "5531911110001");
  assert.equal((await one(db, "select count(*)::int n from public.contacts where id = $1", [b.contact_id])).n, 0);
});

test("LGPD: exportação e anonimização só por admin, com trilha de auditoria", async () => {
  const [r] = await deliver(waPayload({ id: "wamid.LG", from: "5521944440000", name: "Titular", text: "Meu endereço é Rua X, 10" }));
  await rejects(as(db, gestor, (tx) => tx.query("select public.lgpd_export_contact($1)", [r.contact_id])), "permissão");
  const exp = await as(db, admin, (tx) => rpc(tx, "public.lgpd_export_contact($1)", [r.contact_id]));
  assert.equal(exp.contato.name, "Titular");
  assert.equal(exp.conversas[0].mensagens[0].texto, "Meu endereço é Rua X, 10");
  await as(db, admin, (tx) => tx.query("select public.lgpd_anonymize_contact($1, 'Pedido do titular por e-mail')", [r.contact_id]));
  const c = await one(db, "select name, phone, wa_id, consent_status, anonymized_at from public.contacts where id = $1", [r.contact_id]);
  assert.equal(c.name, "Contato anonimizado"); assert.equal(c.phone, null); assert.equal(c.wa_id, null); assert.ok(c.anonymized_at);
  assert.equal((await one(db, "select body from public.messages where external_id = 'wamid.LG'")).body, null);
  await rejects(enqueue(admin, { conversation_id: r.conversation_id, text: "oi" }), "anonimizado");
  const audit = await as(db, admin, (tx) => all(tx, "select action from public.audit_log where entity = 'contact' and entity_id = $1", [r.contact_id]));
  assert.deepEqual(audit.map((x) => x.action).sort(), ["anonymize", "export"]);
});

test("Storage: upload só na pasta de conversa que a pessoa pode responder", async () => {
  const conv = (await one(db, "select v.id from public.conversations v join public.contacts c on c.id = v.contact_id where c.wa_id = '552188881111'")).id;
  await as(db, ana, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('chat-media', $1)`, [`outbound/${conv}/foto.jpg`]));
  await rejects(as(db, bruno, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('chat-media', $1)`, [`outbound/${conv}/foto2.jpg`])), "row-level security");
  await rejects(as(db, ana, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('chat-media', $1)`, [`inbound/${conv}/x.jpg`])), "row-level security");
  assert.equal((await as(db, bruno, (tx) => all(tx, "select * from storage.objects"))).length, 0);
  assert.equal((await as(db, ana, (tx) => all(tx, "select * from storage.objects"))).length, 1);
});

test("Realtime publica as tabelas da tela de conversas", async () => {
  const t = await all(db, "select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1");
  for (const name of ["messages", "conversations", "contacts", "deals", "tasks", "notifications"]) assert.ok(t.some((x) => x.tablename === name), name);
});

test("privilégios: svc_* só para service_role; SECURITY DEFINER sempre com search_path fixo", async () => {
  await rejects(as(db, ana, (tx) => tx.query(`select public.svc_ingest_message($1, '{}'::jsonb)`, [wa])), "permission denied for function");
  await rejects(as(db, ana, (tx) => tx.query(`select public.svc_channel_token($1)`, [wa])), "permission denied for function");
  await rejects(as(db, null, (tx) => tx.query(`select public.create_contact('x', 'whatsapp', '21999990000')`), "anon"), "permission denied for function");
  const unsafe = await all(db, `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
  assert.deepEqual(unsafe, []);
  const svcGranted = await all(db, `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'svc\\_%' and has_function_privilege('authenticated', p.oid, 'execute')`);
  assert.deepEqual(svcGranted, []);
});

test("retenção apaga eventos operacionais antigos", async () => {
  await db.query(`update public.webhook_events set status = 'processed', received_at = now() - interval '40 days'`);
  const r = await asService(db, (tx) => rpc(tx, "public.svc_run_retention()", []));
  assert.ok(r.webhook_events >= 1);
});
