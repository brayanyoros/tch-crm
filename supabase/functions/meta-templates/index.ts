/**
 * Modelos de mensagem do WhatsApp (gestor/admin).
 *  sync            → importa os modelos da WABA (status, categoria, componentes);
 *  create          → submete um modelo novo para aprovação da Meta;
 *  set_header_link → define a mídia (URL https pública) usada no cabeçalho de imagem/vídeo/documento.
 * Mudanças de status chegam depois pelo webhook message_template_status_update.
 */
import { z } from "npm:zod@3.24.1";
import { adminClient, requireCaller, rpc } from "../_shared/db.ts";
import { HttpError, json, readJson, serve } from "../_shared/runtime.ts";
import { GRAPH_VERSION, graphFetch, MetaApiError } from "../_shared/meta/graph.ts";
import { WA_TEMPLATE_STATUS } from "../_shared/meta/parse.ts";
import { templateVars } from "../_shared/meta/outbound.ts";
import { channelToken } from "../_shared/pipeline.ts";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync"), channel_id: z.string().uuid().optional() }),
  z.object({
    action: z.literal("create"), channel_id: z.string().uuid(), name: z.string().regex(/^[a-z0-9_]{1,512}$/),
    category: z.enum(["marketing", "utilidade"]), language: z.string().regex(/^[a-z]{2}(_[A-Z]{2})?$/).default("pt_BR"),
    body: z.string().trim().min(1).max(1024), examples: z.record(z.string().max(200)).default({}),
  }),
  z.object({ action: z.literal("set_header_link"), template_id: z.string().uuid(), link: z.string().url().startsWith("https://").max(2048) }),
]);

const CATEGORY: Record<string, string> = { MARKETING: "marketing", UTILITY: "utilidade", AUTHENTICATION: "autenticacao" };
interface MetaTemplate { id: string; name: string; language: string; status: string; category: string; rejected_reason?: string; components?: { type: string; format?: string; text?: string; buttons?: { type: string; text?: string; url?: string }[] }[] }

const fail = (e: unknown) => e instanceof MetaApiError ? new HttpError(502, "meta", e.message) : e;

serve("meta-templates", async (req, log) => {
  await requireCaller(req, ["gestor", "admin"]);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "invalido", parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const b = parsed.data, db = adminClient();

  if (b.action === "set_header_link") {
    const { data: t } = await db.from("templates").select("header").eq("id", b.template_id).maybeSingle();
    if (!t) throw new HttpError(404, "modelo", "Modelo não encontrado.");
    await db.from("templates").update({ header: { ...(t.header ?? {}), link: b.link } }).eq("id", b.template_id);
    return json(req, 200, { ok: true });
  }

  let q = db.from("channels").select("id, waba_id").eq("type", "whatsapp").neq("status", "desativado");
  if (b.action === "create" || b.channel_id) q = q.eq("id", b.channel_id!);
  const { data: channels } = await q;
  if (!channels?.length) throw new HttpError(404, "canal", "Nenhum número de WhatsApp cadastrado.");

  try {
    if (b.action === "create") {
      const ch = channels[0], token = await channelToken(db, ch.id, "whatsapp");
      const vars = templateVars(b.body), named = vars.some((v) => !/^\d+$/.test(v));
      const ex = (v: string) => b.examples[v] ?? (v === "nome" || v === "1" ? "Maria" : "exemplo");
      const component = vars.length
        ? { type: "BODY", text: b.body, example: named ? { body_text_named_params: vars.map((v) => ({ param_name: v, example: ex(v) })) } : { body_text: [vars.map(ex)] } }
        : { type: "BODY", text: b.body };
      const res = await graphFetch<{ id: string; status: string; category: string }>({
        url: `https://graph.facebook.com/${GRAPH_VERSION}/${ch.waba_id}/message_templates`, token, idempotent: false,
        json: { name: b.name, language: b.language, category: b.category === "marketing" ? "MARKETING" : "UTILITY", ...(named ? { parameter_format: "NAMED" } : {}), components: [component] },
      });
      const id = await rpc<string>(db, "svc_upsert_template", { p_channel_id: ch.id, p: {
        name: b.name, language: b.language, category: CATEGORY[res.category] ?? b.category, status: WA_TEMPLATE_STATUS[res.status] ?? "em_analise",
        body: b.body, buttons: [], components: [component], external_id: res.id,
      } });
      return json(req, 200, { id, status: WA_TEMPLATE_STATUS[res.status] ?? "em_analise" });
    }

    let synced = 0;
    for (const ch of channels) {
      const token = await channelToken(db, ch.id, "whatsapp");
      let url: string | undefined = `https://graph.facebook.com/${GRAPH_VERSION}/${ch.waba_id}/message_templates?fields=id,name,language,status,category,components,rejected_reason&limit=100`;
      for (let page = 0; url && page < 30; page++) {
        const res: { data: MetaTemplate[]; paging?: { next?: string } } = await graphFetch({ url, token });
        for (const t of res.data ?? []) {
          const status = WA_TEMPLATE_STATUS[t.status];
          const category = CATEGORY[t.category];
          if (!status || !category) continue;
          const body = t.components?.find((c) => c.type === "BODY")?.text ?? "";
          const header = t.components?.find((c) => c.type === "HEADER");
          const buttons = t.components?.find((c) => c.type === "BUTTONS")?.buttons?.map((x) => x.text ?? "") ?? [];
          await rpc(db, "svc_upsert_template", { p_channel_id: ch.id, p: {
            name: t.name, language: t.language, category, status, body, buttons, components: t.components ?? [], external_id: t.id,
            header: header ? { format: header.format, text: header.text ?? null } : null,
            rejection_reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
          } });
          synced++;
        }
        url = res.paging?.next;
      }
    }
    log.info("modelos sincronizados", { synced });
    return json(req, 200, { synced });
  } catch (e) {
    throw fail(e);
  }
});
