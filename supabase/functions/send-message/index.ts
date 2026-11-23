/**
 * Envio pela tela de conversas (JWT do usuário).
 *  1. enqueue_outbound_message (no banco, com o JWT): permissão, janela de 24 h, modelo aprovado,
 *     consentimento de marketing, limites de anexo e idempotência por client_id.
 *  2. Reserva e envia na hora pela Graph API. Se a Meta pedir para esperar, o meta-worker tenta de novo.
 * Notas internas (kind "nota") não saem para a Meta.
 */
import { z } from "npm:zod@3.24.1";
import { adminClient, requireCaller, rpc } from "../_shared/db.ts";
import { HttpError, json, readJson, serve } from "../_shared/runtime.ts";
import { dispatchOutbound } from "../_shared/pipeline.ts";
import type { ClaimedMessage } from "../_shared/meta/outbound.ts";

const Body = z.object({
  conversation_id: z.string().uuid(),
  client_id: z.string().uuid(),
  kind: z.enum(["equipe", "nota"]).default("equipe"),
  text: z.string().max(4096).optional(),
  template: z.object({
    id: z.string().uuid(),
    params: z.union([z.array(z.string().max(1024)).max(30), z.record(z.string().max(1024))]).optional(),
  }).optional(),
  media: z.object({
    storage_path: z.string().min(1).max(512),
    kind: z.enum(["image", "audio", "video", "document"]),
    mime_type: z.string().max(120),
    file_name: z.string().max(255),
    size_bytes: z.number().int().nonnegative(),
  }).optional(),
  reply_to_id: z.string().uuid().optional(),
}).strict();

serve("send-message", async (req, log) => {
  const caller = await requireCaller(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "invalido", "Dados de envio inválidos.");
  const b = parsed.data;

  if (b.kind === "nota") {
    const id = await rpc<string>(caller.client, "add_internal_note", { p_conversation_id: b.conversation_id, p_text: b.text ?? "", p_client_id: b.client_id });
    return json(req, 200, { message_id: id, status: null });
  }

  const queued = await rpc<{ id: string; status: string }>(caller.client, "enqueue_outbound_message", {
    p: { conversation_id: b.conversation_id, client_id: b.client_id, text: b.text, template: b.template ?? null, media: b.media ?? null, reply_to_id: b.reply_to_id ?? null },
  });

  let result: { status: string; error?: string } = { status: queued.status };
  if (queued.status === "pending") {
    const db = adminClient();
    const claimed = await rpc<ClaimedMessage[]>(db, "svc_claim_outbound", { p_limit: 1, p_message_id: queued.id });
    if (claimed?.length) result = await dispatchOutbound(db, claimed[0], log);
  }
  if (result.status === "failed") throw new HttpError(422, "meta", result.error ?? "A Meta recusou a mensagem.");
  return json(req, 200, { message_id: queued.id, status: result.status, ...(result.status === "pending" ? { info: "A Meta pediu para aguardar; o envio será repetido automaticamente." } : {}) });
});
