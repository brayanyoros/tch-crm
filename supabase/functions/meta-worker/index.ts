/**
 * Worker chamado a cada minuto pelo pg_cron (header x-worker-secret).
 * Em até ~50 s: libera envios presos, dispara campanhas, reprocessa webhooks,
 * envia a fila de saída (com retentativas) e baixa mídias pendentes.
 */
import { adminClient, rpc } from "../_shared/db.ts";
import { env, errorInfo, HttpError, json, pool, serve, timingSafeEqual } from "../_shared/runtime.ts";
import { dispatchOutbound, downloadInboundMedia, type MediaJob, processWebhookRow, type WebhookRow } from "../_shared/pipeline.ts";
import type { ClaimedMessage } from "../_shared/meta/outbound.ts";

const BUDGET_MS = 50_000;

serve("meta-worker", async (req, log) => {
  const secret = req.headers.get("x-worker-secret") ?? "";
  if (!secret || !timingSafeEqual(secret, env("WORKER_SECRET"))) throw new HttpError(401, "auth", "Não autorizado.");

  const db = adminClient(), started = Date.now(), left = () => BUDGET_MS - (Date.now() - started);
  const stats = { stuck: 0, campaign_queued: 0, webhooks: 0, webhook_failures: 0, sent: 0, retry: 0, failed: 0, media: 0 };

  stats.stuck = await rpc<number>(db, "svc_release_stuck_outbound", {});
  stats.campaign_queued = await rpc<number>(db, "svc_dispatch_campaigns", { p_batch: Number(Deno.env.get("CAMPAIGN_BATCH") ?? 200) });

  // webhooks pendentes/falhos (ordem de chegada; processamento é idempotente)
  while (left() > 10_000) {
    const rows = await rpc<WebhookRow[]>(db, "svc_claim_webhook_events", { p_limit: 25 });
    if (!rows?.length) break;
    for (const row of rows) {
      try {
        await processWebhookRow(db, row, log);
        await rpc(db, "svc_finish_webhook_event", { p_id: row.id, p_ok: true, p_error: null });
        stats.webhooks++;
      } catch (e) {
        stats.webhook_failures++;
        log.warn("webhook falhou de novo", { webhook_id: row.id, attempts: row.attempts, ...errorInfo(e) });
        await rpc(db, "svc_finish_webhook_event", { p_id: row.id, p_ok: false, p_error: (e as Error)?.message ?? String(e) });
      }
    }
  }

  // fila de saída
  while (left() > 8_000) {
    const batch = await rpc<ClaimedMessage[]>(db, "svc_claim_outbound", { p_limit: 40 });
    if (!batch?.length) break;
    await pool(batch, 8, async (m) => {
      const r = await dispatchOutbound(db, m, log);
      if (r.status === "sent") stats.sent++; else if (r.status === "pending") stats.retry++; else stats.failed++;
    });
  }

  // mídia recebida
  while (left() > 5_000) {
    const jobs = await rpc<MediaJob[]>(db, "svc_claim_media", { p_limit: 10 });
    if (!jobs?.length) break;
    await pool(jobs, 4, async (m) => { if (await downloadInboundMedia(db, m, log)) stats.media++; });
  }

  return json(req, 200, { ok: true, ms: Date.now() - started, ...stats });
});
