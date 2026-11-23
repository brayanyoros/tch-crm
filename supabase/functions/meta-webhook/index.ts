/**
 * Webhook único da Meta (WhatsApp Cloud API + Instagram Messaging).
 *  GET  → verificação da assinatura do webhook (hub.challenge).
 *  POST → valida X-Hub-Signature-256 sobre o corpo cru, grava o evento (deduplicado por hash)
 *         e responde 200 na hora; o processamento segue em segundo plano e, se falhar,
 *         o meta-worker reprocessa com backoff. Se não conseguir gravar, responde 500 para a Meta reenviar.
 */
import { adminClient } from "../_shared/db.ts";
import { background, env, errorInfo, HttpError, optionalEnv, serve, sha256Hex, timingSafeEqual, verifyMetaSignature } from "../_shared/runtime.ts";
import { providerOf } from "../_shared/meta/parse.ts";
import { processWebhookRow, type WebhookRow } from "../_shared/pipeline.ts";

const MAX_BODY = 3 * 1024 * 1024;

serve("meta-webhook", async (req, log) => {
  if (req.method === "GET") {
    const q = new URL(req.url).searchParams;
    const token = q.get("hub.verify_token") ?? "", challenge = q.get("hub.challenge") ?? "";
    if (q.get("hub.mode") === "subscribe" && challenge && timingSafeEqual(token, env("META_VERIFY_TOKEN"))) {
      log.info("webhook verificado");
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    log.warn("verificação recusada");
    return new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") throw new HttpError(405, "metodo", "Método não permitido.");

  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.byteLength > MAX_BODY) throw new HttpError(413, "tamanho", "Payload grande demais.");
  const secrets = [env("META_APP_SECRET"), optionalEnv("INSTAGRAM_APP_SECRET") ?? ""].filter(Boolean);
  if (!(await verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), secrets))) {
    log.warn("assinatura inválida", { bytes: raw.byteLength });
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(raw)); } catch { throw new HttpError(400, "json", "JSON inválido."); }
  const provider = providerOf(payload);
  if (!provider) {
    log.info("objeto ignorado", { object: (payload as { object?: string })?.object });
    return new Response("IGNORED", { status: 200 });
  }

  const db = adminClient();
  const { data: id, error } = await db.rpc("svc_store_webhook", { p_provider: provider, p_payload: payload, p_hash: await sha256Hex(raw) });
  if (error) {
    log.error("não gravou o webhook", { code: error.code });
    return new Response("Retry", { status: 500 }); // a Meta reenvia
  }
  if (id === null) {
    log.info("entrega repetida ignorada", { provider });
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  background((async () => {
    const { data: rows, error: e1 } = await db.rpc("svc_claim_webhook_events", { p_limit: 1, p_id: id });
    if (e1 || !rows?.length) return;
    const row = rows[0] as WebhookRow;
    try {
      await processWebhookRow(db, row, log);
      await db.rpc("svc_finish_webhook_event", { p_id: row.id, p_ok: true, p_error: null });
    } catch (e) {
      log.error("falha ao processar webhook; será reprocessado", { webhook_id: row.id, ...errorInfo(e) });
      await db.rpc("svc_finish_webhook_event", { p_id: row.id, p_ok: false, p_error: (e as Error)?.message ?? String(e) });
    }
  })());

  return new Response("EVENT_RECEIVED", { status: 200 });
});
