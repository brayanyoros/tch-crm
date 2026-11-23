-- =============================================================================
-- TCH CRM · 0009 · Agendamentos (pg_cron + pg_net)
-- =============================================================================
-- meta-worker (a cada minuto): reprocessa webhooks, envia a fila, baixa mídia, dispara campanhas.
-- Requer dois segredos no Vault (ver supabase/README.md):
--   project_url   → https://<ref>.supabase.co
--   worker_secret → mesmo valor do secret WORKER_SECRET das Edge Functions
-- Em ambientes sem pg_cron (ex.: testes) os jobs simplesmente não são criados.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron/pg_net indisponíveis: agendamentos não criados';
    return;
  end if;
  create extension if not exists pg_cron;
  create extension if not exists pg_net with schema extensions;

  perform cron.schedule('tch-meta-worker', '* * * * *', $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/meta-worker',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000)
    where exists (select 1 from vault.decrypted_secrets where name = 'project_url')
  $job$);
  perform cron.schedule('tch-task-reminders', '*/5 * * * *', 'select public.svc_task_reminders()');
  perform cron.schedule('tch-retention', '17 6 * * *', 'select public.svc_run_retention()');
  perform cron.schedule('tch-stuck-outbound', '*/2 * * * *', 'select public.svc_release_stuck_outbound()');
end $$;
