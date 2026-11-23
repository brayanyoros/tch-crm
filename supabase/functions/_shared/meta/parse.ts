/**
 * Normaliza os webhooks oficiais da Meta (WhatsApp Cloud API e Instagram Messaging)
 * em eventos internos. Código puro, sem I/O: roda em Deno (Edge) e em Node (testes).
 *
 * Referências: WhatsApp Cloud API › Webhooks › messages / statuses / message_template_status_update;
 * Instagram Platform › Messaging › Webhooks (messages, message_echoes, messaging_seen, message_reactions, messaging_postbacks).
 */

export type Channel = "whatsapp" | "instagram";
export type MediaKind = "image" | "audio" | "video" | "document" | "sticker";
export type MsgType =
  | "text" | "image" | "audio" | "video" | "document" | "sticker" | "location" | "contacts" | "template"
  | "interactive" | "button" | "reaction" | "story_mention" | "share" | "unsupported";

/** Formato aceito por public.svc_ingest_message. */
export interface IngestPayload {
  external_id: string;
  from_id: string;
  recipient_id?: string;
  profile_name?: string;
  username?: string;
  /** epoch em segundos */
  timestamp: number;
  type: MsgType;
  body?: string | null;
  media?: { kind: MediaKind; external_media_id?: string; source_url?: string; mime_type?: string; sha256?: string; file_name?: string };
  reply_to_external_id?: string;
  referral?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  is_echo?: boolean;
}

export type MetaError = { code?: string; title?: string; message?: string };

export type InboundEvent =
  | { kind: "message"; channel: Channel; accountId: string; payload: IngestPayload }
  | { kind: "status"; channel: Channel; accountId: string; externalId: string; status: "sent" | "delivered" | "read" | "failed"; at: number; error?: MetaError; pricing?: Record<string, unknown> }
  | { kind: "read"; channel: "instagram"; accountId: string; customerId: string; externalId?: string; at: number }
  | { kind: "deleted"; channel: Channel; accountId: string; externalId: string }
  | { kind: "template_status"; wabaId: string; externalId?: string; name?: string; language?: string; status: TemplateStatus; reason?: string }
  | { kind: "channel_health"; wabaId: string; quality?: string; limit?: string; event?: string }
  | { kind: "ignored"; reason: string };

export type TemplateStatus = "aprovado" | "em_analise" | "rejeitado" | "pausado" | "desativado";

// deno-lint-ignore no-explicit-any
type Json = any;

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length ? v : typeof v === "number" ? String(v) : undefined);
const clip = (v: string | undefined, n = 4096) => (v === undefined ? undefined : v.slice(0, n));
const seconds = (v: unknown, ms = false): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return Math.floor(Date.now() / 1000);
  return ms ? Math.floor(n / 1000) : Math.floor(n);
};

export function providerOf(payload: Json): Channel | null {
  if (payload?.object === "whatsapp_business_account") return "whatsapp";
  if (payload?.object === "instagram" || payload?.object === "page") return "instagram";
  return null;
}

export function parseWebhook(payload: Json): InboundEvent[] {
  const p = providerOf(payload);
  if (p === "whatsapp") return parseWhatsApp(payload);
  if (p === "instagram") return parseInstagram(payload);
  return [{ kind: "ignored", reason: `objeto desconhecido: ${String(payload?.object)}` }];
}

// ---------------------------------------------------------------- WhatsApp
export const WA_TEMPLATE_STATUS: Record<string, TemplateStatus> = {
  APPROVED: "aprovado", PENDING: "em_analise", IN_APPEAL: "em_analise", PENDING_DELETION: "desativado", REJECTED: "rejeitado",
  PAUSED: "pausado", DISABLED: "desativado", FLAGGED: "pausado", REINSTATED: "aprovado", DELETED: "desativado", LIMIT_EXCEEDED: "pausado",
};

export function parseWhatsApp(payload: Json): InboundEvent[] {
  const out: InboundEvent[] = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    const wabaId = str(entry?.id) ?? "";
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const field = change?.field, value = change?.value ?? {};
      if (field === "messages") {
        const accountId = str(value?.metadata?.phone_number_id);
        if (!accountId) { out.push({ kind: "ignored", reason: "messages sem phone_number_id" }); continue; }
        const names = new Map<string, string>();
        for (const c of Array.isArray(value.contacts) ? value.contacts : []) {
          const id = str(c?.wa_id), name = str(c?.profile?.name);
          if (id && name) names.set(id, name);
        }
        for (const m of Array.isArray(value.messages) ? value.messages : []) {
          const ev = whatsAppMessage(m, names);
          out.push(ev ? { kind: "message", channel: "whatsapp", accountId, payload: ev } : { kind: "ignored", reason: "mensagem sem id/remetente" });
        }
        for (const s of Array.isArray(value.statuses) ? value.statuses : []) {
          const id = str(s?.id), status = s?.status;
          if (!id || !["sent", "delivered", "read", "failed"].includes(status)) { out.push({ kind: "ignored", reason: `status ${status}` }); continue; }
          const e = Array.isArray(s.errors) ? s.errors[0] : undefined;
          out.push({
            kind: "status", channel: "whatsapp", accountId, externalId: id, status, at: seconds(s.timestamp),
            ...(e ? { error: { code: str(e.code), title: str(e.title), message: str(e.error_data?.details) ?? str(e.message) ?? str(e.title) } } : {}),
            ...(s.pricing || s.conversation ? { pricing: { ...(s.pricing ?? {}), conversation: s.conversation ?? null } } : {}),
          });
        }
        if (!value.messages && !value.statuses) out.push({ kind: "ignored", reason: "messages sem conteúdo" });
      } else if (field === "message_template_status_update") {
        const status = WA_TEMPLATE_STATUS[String(value?.event ?? "").toUpperCase()];
        if (!status) { out.push({ kind: "ignored", reason: `template ${value?.event}` }); continue; }
        out.push({
          kind: "template_status", wabaId, status, externalId: str(value.message_template_id), name: str(value.message_template_name),
          language: str(value.message_template_language), reason: str(value.reason) === "NONE" ? undefined : str(value.reason),
        });
      } else if (field === "phone_number_quality_update" || field === "account_update") {
        out.push({ kind: "channel_health", wabaId, event: str(value?.event), quality: str(value?.event), limit: str(value?.current_limit) });
      } else {
        out.push({ kind: "ignored", reason: `campo ${field}` });
      }
    }
  }
  return out;
}

function whatsAppMessage(m: Json, names: Map<string, string>): IngestPayload | null {
  const id = str(m?.id), from = str(m?.from);
  if (!id || !from) return null;
  const type = String(m.type ?? "unsupported");
  const base: IngestPayload = {
    external_id: id, from_id: from, profile_name: names.get(from), timestamp: seconds(m.timestamp), type: "unsupported",
    ...(str(m.context?.id) ? { reply_to_external_id: str(m.context.id) } : {}),
  };
  const meta: Record<string, unknown> = {};
  if (m.context?.forwarded || m.context?.frequently_forwarded) meta.forwarded = true;
  if (m.referral) {
    base.referral = {
      source_type: str(m.referral.source_type), source_id: str(m.referral.source_id), source_url: str(m.referral.source_url),
      headline: str(m.referral.headline), body: clip(str(m.referral.body), 500), media_type: str(m.referral.media_type), ctwa_clid: str(m.referral.ctwa_clid),
    };
  }
  switch (type) {
    case "text":
      base.type = "text"; base.body = clip(str(m.text?.body)); break;
    case "image": case "audio": case "video": case "document": case "sticker": {
      const media = m[type] ?? {};
      base.type = type as MsgType;
      base.body = clip(str(media.caption));
      base.media = { kind: type as MediaKind, external_media_id: str(media.id), mime_type: str(media.mime_type), sha256: str(media.sha256), file_name: str(media.filename) };
      if (type === "audio" && media.voice) meta.voice = true;
      if (type === "sticker" && media.animated) meta.animated = true;
      break;
    }
    case "location": {
      const l = m.location ?? {};
      base.type = "location";
      base.body = [str(l.name), str(l.address)].filter(Boolean).join(" · ") || `${l.latitude}, ${l.longitude}`;
      meta.location = { latitude: l.latitude, longitude: l.longitude, name: str(l.name), address: str(l.address), url: str(l.url) };
      break;
    }
    case "contacts": {
      const list = Array.isArray(m.contacts) ? m.contacts : [];
      base.type = "contacts";
      base.body = list.map((c: Json) => str(c?.name?.formatted_name) ?? "Contato").join(", ");
      meta.contacts = list.map((c: Json) => ({ name: str(c?.name?.formatted_name), phones: (c?.phones ?? []).map((p: Json) => str(p?.phone)).filter(Boolean) }));
      break;
    }
    case "button":
      base.type = "button"; base.body = clip(str(m.button?.text)); meta.payload = str(m.button?.payload); break;
    case "interactive": {
      const r = m.interactive?.button_reply ?? m.interactive?.list_reply ?? m.interactive?.nfm_reply;
      base.type = "interactive"; base.body = clip(str(r?.title) ?? str(r?.body)); meta.reply_id = str(r?.id); meta.interactive_type = str(m.interactive?.type);
      break;
    }
    case "reaction":
      base.type = "reaction"; base.body = str(m.reaction?.emoji) ?? null; meta.reacted_to = str(m.reaction?.message_id);
      if (!str(m.reaction?.emoji)) meta.removed = true;
      break;
    case "system":
      base.type = "unsupported"; base.body = clip(str(m.system?.body)); meta.system = { type: str(m.system?.type), new_wa_id: str(m.system?.wa_id ?? m.system?.new_wa_id) };
      break;
    default:
      base.type = "unsupported"; base.body = null; meta.original_type = type;
      if (Array.isArray(m.errors) && m.errors[0]) meta.error = { code: str(m.errors[0].code), title: str(m.errors[0].title) };
  }
  if (Object.keys(meta).length) base.metadata = meta;
  return base;
}

// ---------------------------------------------------------------- Instagram
const IG_ATTACHMENT: Record<string, { type: MsgType; media?: MediaKind }> = {
  image: { type: "image", media: "image" }, video: { type: "video", media: "video" }, audio: { type: "audio", media: "audio" },
  file: { type: "document", media: "document" }, sticker: { type: "sticker", media: "image" }, animated_image: { type: "image", media: "image" },
  story_mention: { type: "story_mention" }, share: { type: "share" }, ig_reel: { type: "share" }, reel: { type: "share" }, ig_post: { type: "share" },
};

export function parseInstagram(payload: Json): InboundEvent[] {
  const out: InboundEvent[] = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    const accountId = str(entry?.id);
    if (!accountId) { out.push({ kind: "ignored", reason: "entry sem id" }); continue; }
    const items = Array.isArray(entry.messaging) ? entry.messaging : Array.isArray(entry.standby) ? entry.standby : [];
    if (!items.length) out.push({ kind: "ignored", reason: "entry sem messaging (comentários/menções não tratados)" });
    for (const ev of items) {
      const sender = str(ev?.sender?.id), recipient = str(ev?.recipient?.id), at = seconds(ev?.timestamp, true);
      if (!sender || !recipient) { out.push({ kind: "ignored", reason: "evento sem sender/recipient" }); continue; }
      if (ev.message) {
        const msg = ev.message, mid = str(msg.mid);
        if (!mid) { out.push({ kind: "ignored", reason: "message sem mid" }); continue; }
        if (msg.is_deleted) { out.push({ kind: "deleted", channel: "instagram", accountId, externalId: mid }); continue; }
        const echo = !!msg.is_echo;
        const p: IngestPayload = {
          external_id: mid, from_id: sender, timestamp: at, type: "text", body: clip(str(msg.text), 4096),
          ...(echo ? { is_echo: true, recipient_id: recipient } : {}),
          ...(str(msg.reply_to?.mid) ? { reply_to_external_id: str(msg.reply_to.mid) } : {}),
        };
        const meta: Record<string, unknown> = {};
        if (msg.reply_to?.story) meta.story = { id: str(msg.reply_to.story.id), url: str(msg.reply_to.story.url) };
        if (msg.quick_reply?.payload) meta.payload = str(msg.quick_reply.payload);
        if (msg.referral) p.referral = { source: str(msg.referral.source), type: str(msg.referral.type), ad_id: str(msg.referral.ad_id), ref: str(msg.referral.ref) };
        const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
        if (atts.length) {
          const first = atts[0], map = IG_ATTACHMENT[String(first?.type)];
          if (map) {
            p.type = map.type;
            const url = str(first?.payload?.url);
            if (map.media && url) p.media = { kind: map.media, source_url: url };
            else if (url) meta.url = url;
            if (first?.payload?.title) meta.title = str(first.payload.title);
          } else {
            p.type = "unsupported"; meta.original_type = str(first?.type);
          }
          if (atts.length > 1) meta.attachments = atts.slice(1).map((a: Json) => ({ type: str(a?.type), url: str(a?.payload?.url) }));
        } else if (msg.is_unsupported) {
          p.type = "unsupported"; p.body = null;
        } else if (!p.body) {
          out.push({ kind: "ignored", reason: "mensagem vazia" }); continue;
        }
        if (Object.keys(meta).length) p.metadata = meta;
        out.push({ kind: "message", channel: "instagram", accountId, payload: p });
      } else if (ev.read) {
        out.push({ kind: "read", channel: "instagram", accountId, customerId: sender, externalId: str(ev.read.mid), at: ev.read.watermark ? seconds(ev.read.watermark, true) : at });
      } else if (ev.reaction) {
        const mid = str(ev.reaction.mid);
        if (!mid) { out.push({ kind: "ignored", reason: "reaction sem mid" }); continue; }
        const removed = ev.reaction.action === "unreact";
        out.push({ kind: "message", channel: "instagram", accountId, payload: {
          external_id: `reaction:${mid}:${sender}:${at}`, from_id: sender, timestamp: at, type: "reaction",
          body: removed ? null : str(ev.reaction.emoji) ?? str(ev.reaction.reaction) ?? null,
          metadata: { reacted_to: mid, ...(removed ? { removed: true } : {}) },
        } });
      } else if (ev.postback) {
        const mid = str(ev.postback.mid) ?? `postback:${sender}:${at}`;
        out.push({ kind: "message", channel: "instagram", accountId, payload: {
          external_id: mid, from_id: sender, timestamp: at, type: "button", body: clip(str(ev.postback.title)), metadata: { payload: str(ev.postback.payload) },
        } });
      } else {
        out.push({ kind: "ignored", reason: "evento instagram não tratado" });
      }
    }
  }
  return out;
}
