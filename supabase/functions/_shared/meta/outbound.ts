/**
 * Monta as requisições de envio para WhatsApp Cloud API e Instagram Messaging API
 * a partir da mensagem reservada na fila (public.svc_claim_outbound). Código puro.
 */
import { GRAPH_VERSION, MetaApiError } from "./graph.ts";

export interface ClaimedMessage {
  id: string;
  conversation_id: string;
  channel_id: string;
  type: string;
  body: string | null;
  attempts: number;
  reply_to_external_id: string | null;
  metadata: Record<string, unknown>;
  campaign_id: string | null;
  template_params: unknown;
  recipient: string | null;
  channel: { type: "whatsapp" | "instagram"; phone_number_id: string | null; waba_id: string | null; ig_user_id: string | null; page_id: string | null; ig_api: "instagram_login" | "facebook_login"; status: string };
  template: { name: string; language: string; category: string; components: TemplateComponent[]; header?: { format?: string; link?: string } | null } | null;
  media: { id: string; kind: "image" | "audio" | "video" | "document"; mime_type: string | null; file_name: string | null; storage_path: string } | null;
}

export interface TemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: { type: string; text?: string; url?: string }[];
}

/** Erro de montagem: definitivo (não adianta tentar de novo). */
const invalid = (msg: string) => new MetaApiError(msg, 0, "invalid_request", false);

/** Variáveis na ordem em que aparecem: {{1}}, {{2}} ou {{nome}}. */
export function templateVars(text: string | undefined): string[] {
  const seen: string[] = [];
  for (const m of (text ?? "").matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

function paramValue(params: unknown, name: string): string | undefined {
  if (Array.isArray(params)) return /^\d+$/.test(name) ? params[Number(name) - 1] as string | undefined : undefined;
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[name];
    return v === undefined || v === null ? undefined : String(v);
  }
  return undefined;
}

function textParams(text: string | undefined, params: unknown) {
  const vars = templateVars(text);
  const named = vars.some((v) => !/^\d+$/.test(v));
  const ordered = named ? vars : [...vars].sort((a, b) => Number(a) - Number(b));
  return ordered.map((name) => {
    const value = paramValue(params, name);
    if (value === undefined || value.trim() === "") throw invalid(`Variável {{${name}}} do modelo sem valor.`);
    return named ? { type: "text", parameter_name: name, text: value } : { type: "text", text: value };
  });
}

/** Componentes do envio de modelo, conforme o modelo aprovado. */
export function templateComponents(t: NonNullable<ClaimedMessage["template"]>, params: unknown) {
  const out: Record<string, unknown>[] = [];
  for (const c of t.components ?? []) {
    const type = c.type?.toUpperCase();
    if (type === "HEADER") {
      const format = c.format?.toUpperCase();
      if (format === "TEXT") {
        const p = textParams(c.text, params);
        if (p.length) out.push({ type: "header", parameters: p });
      } else if (format === "IMAGE" || format === "VIDEO" || format === "DOCUMENT") {
        const link = t.header?.link ?? paramValue(params, "__header_link");
        if (!link) throw invalid("Configure a mídia do cabeçalho deste modelo antes de enviar.");
        const key = format.toLowerCase();
        out.push({ type: "header", parameters: [{ type: key, [key]: { link } }] });
      }
    } else if (type === "BODY") {
      const p = textParams(c.text, params);
      if (p.length) out.push({ type: "body", parameters: p });
    } else if (type === "BUTTONS") {
      (c.buttons ?? []).forEach((b, index) => {
        if (b.type?.toUpperCase() === "URL" && templateVars(b.url).length) {
          const v = paramValue(params, `__button_${index}`);
          if (!v) throw invalid(`O botão "${b.text ?? index + 1}" do modelo precisa de um valor.`);
          out.push({ type: "button", sub_type: "url", index: String(index), parameters: [{ type: "text", text: v }] });
        }
      });
    }
  }
  return out;
}

export interface OutboundRequest { url: string; json: Record<string, unknown> }

/** WhatsApp: corpo do POST /{phone-number-id}/messages. `mediaId` vem do upload prévio. */
export function buildWhatsApp(m: ClaimedMessage, mediaId?: string): OutboundRequest {
  if (!m.channel.phone_number_id) throw invalid("Canal de WhatsApp sem phone_number_id.");
  if (!m.recipient) throw invalid("Contato sem número de WhatsApp.");
  const base: Record<string, unknown> = {
    messaging_product: "whatsapp", recipient_type: "individual", to: m.recipient,
    ...(m.reply_to_external_id ? { context: { message_id: m.reply_to_external_id } } : {}),
  };
  let json: Record<string, unknown>;
  if (m.type === "template") {
    if (!m.template) throw invalid("Modelo não encontrado.");
    const components = templateComponents(m.template, m.template_params);
    json = { ...base, type: "template", template: { name: m.template.name, language: { code: m.template.language }, ...(components.length ? { components } : {}) } };
  } else if (m.media) {
    if (!mediaId) throw invalid("Anexo não enviado à Meta.");
    const kind = m.media.kind;
    const obj: Record<string, unknown> = { id: mediaId };
    if (m.body && kind !== "audio") obj.caption = m.body.slice(0, 1024);
    if (kind === "document" && m.media.file_name) obj.filename = m.media.file_name;
    json = { ...base, type: kind, [kind]: obj };
  } else {
    if (!m.body) throw invalid("Mensagem vazia.");
    json = { ...base, type: "text", text: { body: m.body, preview_url: /https?:\/\//i.test(m.body) } };
  }
  return { url: `https://graph.facebook.com/${GRAPH_VERSION}/${m.channel.phone_number_id}/messages`, json };
}

/** Instagram: corpo do POST /{ig-user-id}/messages (login do Instagram) ou /{page-id}/messages (login do Facebook). */
export function buildInstagram(m: ClaimedMessage, mediaUrl?: string): OutboundRequest {
  if (!m.recipient) throw invalid("No Instagram, só é possível responder quem escreveu primeiro.");
  const fb = m.channel.ig_api === "facebook_login";
  const owner = fb ? m.channel.page_id : m.channel.ig_user_id;
  if (!owner) throw invalid(fb ? "Canal do Instagram sem page_id." : "Canal do Instagram sem ig_user_id.");
  let message: Record<string, unknown>;
  if (m.media) {
    if (!mediaUrl) throw invalid("Anexo sem link temporário.");
    const type = m.media.kind === "document" ? "file" : m.media.kind;
    message = { attachment: { type, payload: { url: mediaUrl } } };
  } else {
    if (!m.body) throw invalid("Mensagem vazia.");
    message = { text: m.body };
  }
  const json: Record<string, unknown> = { recipient: { id: m.recipient }, message };
  if (m.metadata?.tag === "HUMAN_AGENT") Object.assign(json, { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
  const host = fb ? "graph.facebook.com" : "graph.instagram.com";
  return { url: `https://${host}/${GRAPH_VERSION}/${owner}/messages`, json };
}

/** Id da mensagem na resposta de cada API. */
export function externalIdFrom(channel: "whatsapp" | "instagram", res: Record<string, unknown>): string | undefined {
  if (channel === "whatsapp") return (res.messages as { id?: string }[] | undefined)?.[0]?.id;
  return (res.message_id as string | undefined) ?? undefined;
}
