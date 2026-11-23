// Testes das Edge Functions sem rede nem banco: parser, assinatura, montagem de envio,
// classificação de erros e o fluxo de despacho com Graph API simulada.
// Rodar: cd supabase/functions && deno task test
import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1.0.13";
import { parseWebhook } from "../_shared/meta/parse.ts";
import { buildInstagram, buildWhatsApp, type ClaimedMessage, templateComponents } from "../_shared/meta/outbound.ts";
import { MetaApiError, toMetaError } from "../_shared/meta/graph.ts";
import { hmacSha256Hex, redact, verifyMetaSignature } from "../_shared/runtime.ts";
import { dispatchOutbound } from "../_shared/pipeline.ts";
import type { Db } from "../_shared/db.ts";

// deno-lint-ignore no-explicit-any
type Any = any;
const enc = new TextEncoder();
const silent = { requestId: "t", debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as never;

Deno.test("assinatura X-Hub-Signature-256: aceita a correta, recusa alterada e ausente", async () => {
  const body = enc.encode('{"object":"whatsapp_business_account"}');
  const sig = "sha256=" + await hmacSha256Hex("segredo-app", body);
  assert(await verifyMetaSignature(body, sig, ["segredo-app"]));
  assert(await verifyMetaSignature(body, sig, ["outro", "segredo-app"]), "aceita o segredo do app do Instagram");
  assert(!(await verifyMetaSignature(enc.encode('{"object":"x"}'), sig, ["segredo-app"])));
  assert(!(await verifyMetaSignature(body, null, ["segredo-app"])));
  assert(!(await verifyMetaSignature(body, "sha1=abc", ["segredo-app"])));
});

Deno.test("logs não carregam segredos nem dados pessoais", () => {
  const r = redact({ access_token: "EAAB", phone: "+5521999990000", nested: { body: "meu cpf", status: "sent" } }) as Record<string, unknown>;
  assertEquals(r.access_token, "[segredo]");
  assertEquals(r.phone, "[dado pessoal]");
  assertEquals((r.nested as Record<string, unknown>).body, "[dado pessoal]");
  assertEquals((r.nested as Record<string, unknown>).status, "sent");
});

Deno.test("WhatsApp: mensagens, mídia, anúncio, status com erro e modelos", () => {
  const evs = parseWebhook({ object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [
    { field: "messages", value: { metadata: { phone_number_id: "PN" }, contacts: [{ wa_id: "5521999990000", profile: { name: "Ana" } }], messages: [
      { from: "5521999990000", id: "w1", timestamp: "1700000000", type: "text", text: { body: "Oi" }, referral: { source_type: "ad", headline: "Sauna" }, context: { id: "w0" } },
      { from: "5521999990000", id: "w2", timestamp: "1700000001", type: "document", document: { id: "M1", mime_type: "application/pdf", filename: "planta.pdf", caption: "planta" } },
      { from: "5521999990000", id: "w3", timestamp: "1700000002", type: "reaction", reaction: { message_id: "w1", emoji: "👍" } },
      { from: "5521999990000", id: "w4", timestamp: "1700000003", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "b1", title: "Quero saber mais" } } },
      { from: "5521999990000", id: "w5", timestamp: "1700000004", type: "unknown", errors: [{ code: 131051, title: "Unsupported" }] },
    ], statuses: [{ id: "out1", status: "failed", timestamp: "1700000005", errors: [{ code: 131047, title: "Re-engagement", error_data: { details: "24h" } }] }] } },
    { field: "message_template_status_update", value: { event: "REJECTED", message_template_id: 77, message_template_name: "promo", message_template_language: "pt_BR", reason: "PROMOTIONAL" } },
  ] }] });
  const msgs = evs.filter((e) => e.kind === "message").map((e) => (e as Any).payload);
  assertEquals(msgs.length, 5);
  assertEquals(msgs[0].profile_name, "Ana");
  assertEquals(msgs[0].reply_to_external_id, "w0");
  assertEquals((msgs[0].referral as Record<string, unknown>).headline, "Sauna");
  assertEquals(msgs[1].media, { kind: "document", external_media_id: "M1", mime_type: "application/pdf", sha256: undefined, file_name: "planta.pdf" });
  assertEquals(msgs[1].body, "planta");
  assertEquals([msgs[2].type, msgs[2].body], ["reaction", "👍"]);
  assertEquals([msgs[3].type, msgs[3].body], ["interactive", "Quero saber mais"]);
  assertEquals(msgs[4].type, "unsupported");
  const st = evs.find((e) => e.kind === "status") as { status: string; error: { code: string } };
  assertEquals(st.status, "failed"); assertEquals(st.error.code, "131047");
  const tpl = evs.find((e) => e.kind === "template_status") as { status: string; externalId: string };
  assertEquals([tpl.status, tpl.externalId], ["rejeitado", "77"]);
});

Deno.test("Instagram: mensagem, eco, anexo, leitura, reação, apagada", () => {
  const ig = (messaging: unknown[]): Any[] => parseWebhook({ object: "instagram", entry: [{ id: "IG", time: 1, messaging }] });
  const [m] = ig([{ sender: { id: "U" }, recipient: { id: "IG" }, timestamp: 1700000000000, message: { mid: "m1", text: "oi", reply_to: { mid: "m0" } } }]);
  assertEquals([m.kind, m.payload.from_id, m.payload.timestamp, m.payload.reply_to_external_id], ["message", "U", 1700000000, "m0"]);
  const [echo] = ig([{ sender: { id: "IG" }, recipient: { id: "U" }, timestamp: 1, message: { mid: "m2", text: "resposta", is_echo: true } }]);
  assertEquals([echo.payload.is_echo, echo.payload.recipient_id], [true, "U"]);
  const [img] = ig([{ sender: { id: "U" }, recipient: { id: "IG" }, timestamp: 1, message: { mid: "m3", attachments: [{ type: "image", payload: { url: "https://cdn/x.jpg" } }] } }]);
  assertEquals(img.payload.media, { kind: "image", source_url: "https://cdn/x.jpg" });
  const [read] = ig([{ sender: { id: "U" }, recipient: { id: "IG" }, timestamp: 5000, read: { mid: "m2" } }]);
  assertEquals(read, { kind: "read", channel: "instagram", accountId: "IG", customerId: "U", externalId: "m2", at: 5 });
  const [react] = ig([{ sender: { id: "U" }, recipient: { id: "IG" }, timestamp: 1000, reaction: { mid: "m2", action: "react", emoji: "❤️" } }]);
  assertEquals([react.payload.type, react.payload.body, react.payload.external_id], ["reaction", "❤️", "reaction:m2:U:1"]);
  const [del] = ig([{ sender: { id: "U" }, recipient: { id: "IG" }, timestamp: 1, message: { mid: "m1", is_deleted: true } }]);
  assertEquals(del.kind, "deleted");
  assertEquals(parseWebhook({ object: "user" })[0].kind, "ignored");
});

const claimed = (over: Partial<ClaimedMessage> = {}): ClaimedMessage => ({
  id: "msg-1", conversation_id: "c", channel_id: crypto.randomUUID(), type: "text", body: "Olá", attempts: 1, reply_to_external_id: null, metadata: {},
  campaign_id: null, template_params: null, recipient: "5521999990000", template: null, media: null,
  channel: { type: "whatsapp", phone_number_id: "PN", waba_id: "W", ig_user_id: null, page_id: null, ig_api: "instagram_login", status: "conectado" },
  ...over,
});

Deno.test("montagem: WhatsApp texto/resposta/modelo e Instagram com HUMAN_AGENT", () => {
  const t = buildWhatsApp(claimed({ reply_to_external_id: "wamid.X", body: "veja https://tch.com.br" }));
  assertEquals(t.url, "https://graph.facebook.com/v23.0/PN/messages");
  assertEquals(t.json.context, { message_id: "wamid.X" });
  assertEquals(t.json.text, { body: "veja https://tch.com.br", preview_url: true });

  const named = { name: "convite", language: "pt_BR", category: "marketing", components: [{ type: "BODY", text: "{{nome}}, venha ver {{produto}}" }] };
  const wt = buildWhatsApp(claimed({ type: "template", template: named, template_params: { nome: "Ana", produto: "a sauna" } }));
  assertEquals((wt.json.template as Record<string, unknown>).components, [{ type: "body", parameters: [{ type: "text", parameter_name: "nome", text: "Ana" }, { type: "text", parameter_name: "produto", text: "a sauna" }] }]);
  const positional = templateComponents({ ...named, components: [{ type: "BODY", text: "Oi {{2}} e {{1}}" }] }, ["A", "B"]);
  assertEquals(positional, [{ type: "body", parameters: [{ type: "text", text: "A" }, { type: "text", text: "B" }] }]);
  assertThrows(() => templateComponents(named, { nome: "Ana" }), MetaApiError, "{{produto}}");
  assertThrows(() => templateComponents({ ...named, components: [{ type: "HEADER", format: "IMAGE" }] }, {}), MetaApiError, "cabeçalho");
  const withHeader = templateComponents({ ...named, header: { link: "https://cdn/x.jpg" }, components: [{ type: "HEADER", format: "IMAGE" }] }, {});
  assertEquals(withHeader, [{ type: "header", parameters: [{ type: "image", image: { link: "https://cdn/x.jpg" } }] }]);

  const igCh = { type: "instagram" as const, phone_number_id: null, waba_id: null, ig_user_id: "IG", page_id: "PG", ig_api: "instagram_login" as const, status: "conectado" };
  const i1 = buildInstagram(claimed({ channel: igCh, recipient: "U", metadata: { tag: "HUMAN_AGENT" } }));
  assertEquals(i1.url, "https://graph.instagram.com/v23.0/IG/messages");
  assertEquals(i1.json, { recipient: { id: "U" }, message: { text: "Olá" }, messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
  const i2 = buildInstagram(claimed({ channel: { ...igCh, ig_api: "facebook_login" }, recipient: "U", media: { id: "m", kind: "document", mime_type: "application/pdf", file_name: "a.pdf", storage_path: "outbound/c/a.pdf" }, body: null }), "https://signed");
  assertEquals(i2.url, "https://graph.facebook.com/v23.0/PG/messages");
  assertEquals(i2.json.message, { attachment: { type: "file", payload: { url: "https://signed" } } });
});

Deno.test("classificação de erros da Meta", () => {
  const rate = toMetaError(400, { error: { code: 130429, message: "Rate limit" } });
  assert(rate.retryable && !rate.ambiguous);
  const window = toMetaError(400, { error: { code: 131047, message: "Re-engagement message" } });
  assert(!window.retryable); assert(window.message.includes("24 h"));
  const auth = toMetaError(401, { error: { code: 190, message: "expired" } });
  assert(auth.authProblem && !auth.retryable);
  assert(toMetaError(503, {}).retryable);
});

/** Banco falso: registra as RPCs e responde o token do canal. */
function fakeDb() {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = {
    calls,
    rpc: (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return Promise.resolve({ data: fn === "svc_channel_token" ? "TOKEN" : null, error: null }); },
    storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: { signedUrl: "https://signed" }, error: null }) }) },
  };
  return db as unknown as Db & { calls: typeof calls };
}
async function withFetch<T>(impl: (url: string, init: RequestInit) => Promise<Response>, run: () => Promise<T>) {
  const original = globalThis.fetch;
  globalThis.fetch = ((u: string, i: RequestInit) => impl(String(u), i)) as typeof fetch;
  try { return await run(); } finally { globalThis.fetch = original; }
}

Deno.test("despacho: sucesso grava o wamid; token vai só no header", async () => {
  const db = fakeDb();
  let seen: RequestInit | undefined;
  const r = await withFetch(async (_u, init) => { seen = init; return new Response(JSON.stringify({ messages: [{ id: "wamid.OK" }] })); },
    () => dispatchOutbound(db, claimed(), silent));
  assertEquals(r.status, "sent");
  assertEquals((seen!.headers as Record<string, string>).Authorization, "Bearer TOKEN");
  assert(!String(seen!.body).includes("TOKEN"));
  const done = db.calls.find((c) => c.fn === "svc_complete_outbound")!;
  assertEquals(done.args.p_external_id, "wamid.OK");
});

Deno.test("despacho: limite da Meta agenda nova tentativa", async () => {
  const db = fakeDb();
  const r = await withFetch(() => Promise.resolve(new Response(JSON.stringify({ error: { code: 130429, message: "rate" } }), { status: 400 })),
    () => dispatchOutbound(db, claimed(), silent));
  assertEquals(r.status, "pending");
  const done = db.calls.find((c) => c.fn === "svc_complete_outbound")!;
  assert(done.args.p_retry_at, "tem retry_at");
});

Deno.test("despacho: timeout é ambíguo e NÃO é reenviado (evita duplicidade)", async () => {
  const db = fakeDb();
  const r = await withFetch(() => Promise.reject(new DOMException("aborted", "AbortError")), () => dispatchOutbound(db, claimed(), silent));
  assertEquals(r.status, "failed");
  const done = db.calls.find((c) => c.fn === "svc_complete_outbound")!;
  assertEquals(done.args.p_retry_at, null);
  assertEquals((done.args.p_error as { code: string }).code, "ambiguous");
});

Deno.test("despacho: token inválido marca o canal com erro", async () => {
  const db = fakeDb();
  const r = await withFetch(() => Promise.resolve(new Response(JSON.stringify({ error: { code: 190, message: "expired" } }), { status: 401 })),
    () => dispatchOutbound(db, claimed(), silent));
  assertEquals(r.status, "failed");
  assert(db.calls.some((c) => c.fn === "svc_channel_health" && c.args.p_status === "erro"));
});

Deno.test("despacho: montagem inválida falha sem chamar a Meta", async () => {
  const db = fakeDb();
  await withFetch(() => { throw new Error("não deveria chamar a Meta"); }, async () => {
    const r = await dispatchOutbound(db, claimed({ recipient: null }), silent);
    assertEquals(r.status, "failed");
  });
  await assertRejects(() => Promise.reject(new MetaApiError("x", 0, "y", false)));
});
