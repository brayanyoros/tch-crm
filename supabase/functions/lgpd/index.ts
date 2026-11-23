/**
 * Direitos do titular (LGPD art. 18) e exclusões que envolvem arquivos (admin):
 *  export        → relatório completo dos dados do contato (JSON);
 *  anonymize     → remove identificadores e conteúdo, mantém estatística;
 *  delete_contact / delete_conversation → exclusão definitiva, incluindo mídias no Storage.
 * As regras e a auditoria ficam no banco; aqui só se apagam os arquivos devolvidos.
 */
import { z } from "npm:zod@3.24.1";
import { adminClient, requireCaller, rpc } from "../_shared/db.ts";
import { HttpError, json, readJson, serve } from "../_shared/runtime.ts";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("export"), contact_id: z.string().uuid() }),
  z.object({ action: z.literal("anonymize"), contact_id: z.string().uuid(), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("delete_contact"), contact_id: z.string().uuid() }),
  z.object({ action: z.literal("delete_conversation"), conversation_id: z.string().uuid() }),
]);

serve("lgpd", async (req, log) => {
  const caller = await requireCaller(req, ["admin"]);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "invalido", "Dados inválidos.");
  const b = parsed.data;

  if (b.action === "export") {
    const data = await rpc(caller.client, "lgpd_export_contact", { p_id: b.contact_id });
    return json(req, 200, data, { "Content-Disposition": `attachment; filename="titular-${b.contact_id}.json"`, "Cache-Control": "no-store" });
  }
  const paths = b.action === "anonymize"
    ? await rpc<string[]>(caller.client, "lgpd_anonymize_contact", { p_id: b.contact_id, p_reason: b.reason })
    : b.action === "delete_contact"
    ? await rpc<string[]>(caller.client, "delete_contact", { p_id: b.contact_id })
    : await rpc<string[]>(caller.client, "delete_conversation", { p_id: b.conversation_id });

  let removed = 0;
  const storage = adminClient().storage.from("chat-media");
  const list = (paths ?? []).filter(Boolean);
  for (let i = 0; i < list.length; i += 100) {
    const { data, error } = await storage.remove(list.slice(i, i + 100));
    if (error) log.error("arquivos não removidos; remover manualmente", { count: list.length - i });
    else removed += data?.length ?? 0;
  }
  return json(req, 200, { ok: true, files_removed: removed, files_total: list.length });
});
