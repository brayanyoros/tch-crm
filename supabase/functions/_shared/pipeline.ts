/**
 * Processamento confiável das integrações Meta:
 *  - processWebhookRow: webhook_events → contatos, conversas, mensagens, status (idempotente);
 *  - dispatchOutbound: fila de saída → Graph API → status (sem reenvio em caso ambíguo);
 *  - downloadInboundMedia: mídia recebida → bucket privado chat-media.
 */
import type { Db } from "./db.ts";
import { errorInfo, type Logger, optionalEnv } from "./runtime.ts";
import { backoffMs, GRAPH_VERSION, graphFetch, MetaApiError } from "./meta/graph.ts";
import { type InboundEvent, parseWebhook } from "./meta/parse.ts";
import { buildInstagram, buildWhatsApp, type ClaimedMessage, externalIdFrom } from "./meta/outbound.ts";

const BUCKET = "chat-media";
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

async function call<T>(db: Db, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message} (${error.code})`);
  return data as T;
}

// ---------------------------------------------------------------- canais e tokens (cache curto por instância)
interface ChannelRow { id: string; type: "whatsapp" | "instagram"; phone_number_id: string | null; waba_id: string | null; ig_user_id: string | null; page_id: string | null; ig_api: "instagram_login" | "facebook_login"; status: string }
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function findChannel(db: Db, type: "whatsapp" | "instagram", accountId: string) {
  return cached<ChannelRow | null>(`ch:${type}:${accountId}`, 60_000, async () => {
    const row = await call<ChannelRow | null>(db, "svc_channel_lookup", { p_type: type, p_external_id: accountId });
    if (row || type !== "instagram") return row;
    const { data } = await db.from("channels").select("id, type, phone_number_id, waba_id, ig_user_id, page_id, ig_api, status")
      .eq("type", "instagram").eq("page_id", accountId).neq("status", "desativado").maybeSingle();
    return (data as ChannelRow | null) ?? null;
  });
}

/** Token do canal: Vault (por canal) ou secret global da função. Nunca é logado nem devolvido ao cliente. */
export function channelToken(db: Db, channelId: string, type: "whatsapp" | "instagram") {
  return cached<string>(`tk:${channelId}`, 5 * 60_000, async () => {
    const fromVault = await call<string | null>(db, "svc_channel_token", { p_channel_id: channelId });
    const token = fromVault ?? optionalEnv(type === "whatsapp" ? "WHATSAPP_ACCESS_TOKEN" : "INSTAGRAM_ACCESS_TOKEN");
    if (!token) throw new MetaApiError("Token de acesso do canal não configurado.", 0, "no_token", false, false, true);
    return token;
  });
}

// ---------------------------------------------------------------- entrada
export interface WebhookRow { id: number; provider: string; payload: unknown; attempts: number }

const QUALITY: Record<string, string> = { FLAGGED: "Baixa (sinalizada)", UNFLAGGED: "Alta", GREEN: "Alta", YELLOW: "Média", RED: "Baixa" };
const TIERS: Record<string, string> = {
  TIER_50: "50 conversas por dia", TIER_250: "250 conversas por dia", TIER_1K: "1.000 conversas por dia", TIER_10K: "10.000 conversas por dia",
  TIER_100K: "100.000 conversas por dia", TIER_UNLIMITED: "Sem limite diário",
};

/** Processa um webhook gravado. Lança erro para que o evento seja reprocessado depois. */
export async function processWebhookRow(db: Db, row: WebhookRow, log: Logger) {
  const events = parseWebhook(row.payload);
  const stats = { messages: 0, statuses: 0, ignored: 0, duplicates: 0 };
  for (const ev of events) await handleEvent(db, ev, stats, log);
  log.info("webhook processado", { webhook_id: row.id, ...stats });
  return stats;
}

async function handleEvent(db: Db, ev: InboundEvent, stats: Record<string, number>, log: Logger) {
  switch (ev.kind) {
    case "ignored":
      stats.ignored++; log.debug("evento ignorado", { reason: ev.reason }); return;
    case "template_status":
      await call(db, "svc_template_status", { p_waba_id: ev.wabaId, p_external_id: ev.externalId ?? null, p_name: ev.name ?? null, p_language: ev.language ?? null, p_status: ev.status, p_reason: ev.reason ?? null });
      return;
    case "channel_health": {
      const patch: Record<string, string> = {};
      if (ev.quality && QUALITY[ev.quality]) patch.quality = QUALITY[ev.quality];
      if (ev.limit && TIERS[ev.limit]) patch.messaging_limit = TIERS[ev.limit];
      if (Object.keys(patch).length) await db.from("channels").update(patch).eq("waba_id", ev.wabaId);
      return;
    }
  }
  const channel = await findChannel(db, ev.channel, ev.accountId);
  if (!channel) {
    // Conta não cadastrada: guardar para nada seria inútil; registra e segue.
    stats.ignored++; log.warn("conta Meta não cadastrada em channels", { channel: ev.channel, account: ev.accountId }); return;
  }
  switch (ev.kind) {
    case "message": {
      const r = await call<{ duplicate: boolean; message_id: string; contact_id?: string; media_id?: string; needs_profile?: boolean }>(
        db, "svc_ingest_message", { p_channel_id: channel.id, p: ev.payload });
      if (r.duplicate) { stats.duplicates++; return; }
      stats.messages++;
      if (r.media_id) {
        const [m] = await call<MediaJob[]>(db, "svc_claim_media", { p_limit: 1, p_id: r.media_id });
        if (m) await downloadInboundMedia(db, m, log); // falha fica para o worker
      }
      if (r.needs_profile && r.contact_id) await fillInstagramProfile(db, channel, ev.payload.from_id, r.contact_id, log);
      return;
    }
    case "status":
      stats.statuses++;
      await call(db, "svc_record_status", {
        p_channel_id: channel.id, p_external_id: ev.externalId, p_status: ev.status, p_at: new Date(ev.at * 1000).toISOString(),
        p_error: ev.error ?? null, p_pricing: ev.pricing ?? null,
      });
      return;
    case "read":
      stats.statuses++;
      await call(db, "svc_record_read", { p_channel_id: channel.id, p_customer_id: ev.customerId, p_external_id: ev.externalId ?? null, p_at: new Date(ev.at * 1000).toISOString() });
      return;
    case "deleted":
      await call(db, "svc_message_deleted", { p_channel_id: channel.id, p_external_id: ev.externalId });
      return;
  }
}

async function fillInstagramProfile(db: Db, channel: ChannelRow, igsid: string, contactId: string, log: Logger) {
  try {
    const token = await channelToken(db, channel.id, "instagram");
    const host = channel.ig_api === "facebook_login" ? "graph.facebook.com" : "graph.instagram.com";
    const p = await graphFetch<{ name?: string; username?: string }>({ url: `https://${host}/${GRAPH_VERSION}/${igsid}?fields=name,username`, token, timeoutMs: 8000 });
    await call(db, "svc_set_contact_profile", { p_contact_id: contactId, p_name: p.name ?? p.username ?? null, p_username: p.username ?? null });
  } catch (e) {
    log.warn("perfil do Instagram indisponível", errorInfo(e)); // o contato fica com nome provisório
  }
}

// ---------------------------------------------------------------- mídia recebida
export interface MediaJob { id: string; kind: string; mime_type: string | null; file_name: string | null; external_media_id: string | null; source_url: string | null; message_id: string; conversation_id: string; channel_id: string; channel_type: "whatsapp" | "instagram" }

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
  "audio/aac": "aac", "audio/amr": "amr", "video/mp4": "mp4", "video/3gpp": "3gp", "application/pdf": "pdf",
};

export async function downloadInboundMedia(db: Db, m: MediaJob, log: Logger) {
  try {
    let url = m.source_url ?? "", mime = m.mime_type ?? "", headers: Record<string, string> = {};
    if (m.channel_type === "whatsapp") {
      const token = await channelToken(db, m.channel_id, "whatsapp");
      const info = await graphFetch<{ url: string; mime_type?: string; file_size?: number }>({ url: `https://graph.facebook.com/${GRAPH_VERSION}/${m.external_media_id}`, token, timeoutMs: 10_000 });
      if ((info.file_size ?? 0) > MAX_MEDIA_BYTES) throw new Error("mídia acima do limite");
      url = info.url; mime = info.mime_type ?? mime; headers = { Authorization: `Bearer ${token}` };
    }
    if (!/^https:\/\//.test(url)) throw new Error("URL de mídia inválida");
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error("mídia acima do limite");
    mime = (mime || res.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    const ext = EXT[mime] ?? (m.file_name?.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin");
    const path = `inbound/${m.conversation_id}/${m.message_id}-${m.id}.${ext}`;
    const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
    if (error) throw new Error(`storage: ${error.message}`);
    await call(db, "svc_media_result", { p_media_id: m.id, p_storage_path: path, p_size: bytes.byteLength, p_mime: mime, p_error: null });
    return true;
  } catch (e) {
    log.warn("falha ao baixar mídia", { media_id: m.id, ...errorInfo(e) });
    await call(db, "svc_media_result", { p_media_id: m.id, p_storage_path: null, p_size: null, p_mime: null, p_error: (e as Error).message ?? String(e) });
    return false;
  }
}

// ---------------------------------------------------------------- saída
export type DispatchResult = { id: string; status: "sent" | "pending" | "failed"; error?: string };

export async function dispatchOutbound(db: Db, m: ClaimedMessage, log: Logger): Promise<DispatchResult> {
  try {
    if (m.channel.status === "desativado") throw new MetaApiError("Este canal está desativado.", 0, "channel_disabled", false);
    const token = await channelToken(db, m.channel_id, m.channel.type);
    let req;
    if (m.channel.type === "whatsapp") {
      const mediaId = m.media ? await uploadWhatsAppMedia(db, m, token) : undefined;
      req = buildWhatsApp(m, mediaId);
    } else {
      let link: string | undefined;
      if (m.media) {
        const { data, error } = await db.storage.from(BUCKET).createSignedUrl(m.media.storage_path, 60 * 60);
        if (error || !data) throw new MetaApiError("Anexo não encontrado.", 0, "media_missing", false);
        link = data.signedUrl;
      }
      req = buildInstagram(m, link);
    }
    const res = await graphFetch({ url: req.url, token, json: req.json, timeoutMs: 25_000, idempotent: false });
    const externalId = externalIdFrom(m.channel.type, res);
    if (!externalId) throw new MetaApiError("A Meta aceitou o envio mas não devolveu o id.", 200, "no_id", false, true);
    await call(db, "svc_complete_outbound", { p_message_id: m.id, p_external_id: externalId, p_error: null, p_retry_at: null });
    log.info("mensagem enviada", { message_id: m.id, channel: m.channel.type, attempt: m.attempts });
    return { id: m.id, status: "sent" };
  } catch (e) {
    const err = e instanceof MetaApiError ? e : new MetaApiError("Falha inesperada no envio.", 0, "internal", true);
    if (!(e instanceof MetaApiError)) log.error("erro no envio", { message_id: m.id, ...errorInfo(e) });
    const retry = err.retryable && !err.ambiguous && m.attempts < 5;
    const code = err.ambiguous ? "ambiguous" : err.code;
    const message = err.ambiguous ? `${err.message} Confira a conversa antes de reenviar.` : err.message;
    await call(db, "svc_complete_outbound", {
      p_message_id: m.id, p_external_id: null, p_error: { code, message },
      p_retry_at: retry ? new Date(Date.now() + backoffMs(m.attempts)).toISOString() : null,
    });
    if (err.authProblem) await call(db, "svc_channel_health", { p_channel_id: m.channel_id, p_status: "erro", p_quality: null, p_limit: null, p_error: err.message });
    log.warn("envio não concluído", { message_id: m.id, code, retry, status: err.status });
    return { id: m.id, status: retry ? "pending" : "failed", error: message };
  }
}

async function uploadWhatsAppMedia(db: Db, m: ClaimedMessage, token: string) {
  const media = m.media!;
  const { data, error } = await db.storage.from(BUCKET).download(media.storage_path);
  if (error || !data) throw new MetaApiError("Anexo não encontrado.", 0, "media_missing", false);
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", media.mime_type ?? data.type ?? "application/octet-stream");
  form.append("file", new Blob([await data.arrayBuffer()], { type: media.mime_type ?? data.type }), media.file_name ?? "arquivo");
  // Upload é idempotente do ponto de vista do cliente (gera só um id de mídia): pode repetir.
  const res = await graphFetch<{ id: string }>({ url: `https://graph.facebook.com/${GRAPH_VERSION}/${m.channel.phone_number_id}/media`, token, form, timeoutMs: 60_000, idempotent: true });
  return res.id;
}
