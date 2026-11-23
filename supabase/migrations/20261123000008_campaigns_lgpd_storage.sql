-- =============================================================================
-- TCH CRM · 0008 · Campanhas, lembretes, LGPD, auditoria, Storage e Realtime
-- =============================================================================

-- ---------------------------------------------------------------- campanhas
/**
 * Confirma a campanha uma única vez: revalida modelo, número e consentimento de cada
 * destinatário no servidor e fixa a lista. A tela envia os ids que avaliou.
 */
create or replace function public.confirm_campaign(p_id uuid, p_contact_ids uuid[], p_send_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_manager(); cp public.campaigns; t public.templates; ch public.channels;
  v_added int; v_total int := cardinality(coalesce(p_contact_ids, '{}')); s public.app_settings;
begin
  select * into cp from public.campaigns where id = p_id for update;
  if not found then perform private.fail('Campanha não encontrada.'); end if;
  if cp.status <> 'Rascunho' then perform private.fail('Esta campanha já foi confirmada.'); end if;
  select * into ch from public.channels where id = cp.sender_channel_id and type = 'whatsapp';
  if not found then perform private.fail('Escolha o número remetente.'); end if;
  if ch.status <> 'conectado' then perform private.fail(format('O número %s não está conectado.', ch.handle)); end if;
  select * into t from public.templates where id = cp.template_id and channel_id = ch.id;
  if not found or t.status <> 'aprovado' then perform private.fail('Escolha um modelo aprovado.'); end if;
  if p_send_at is null or p_send_at < now() - interval '2 minutes' then perform private.fail('Revise o horário de envio.'); end if;
  if v_total > 50000 then perform private.fail('Limite de 50.000 destinatários por campanha.'); end if;

  insert into public.campaign_recipients (campaign_id, contact_id, name, phone)
  select cp.id, c.id, c.name, coalesce(c.phone, '+' || c.wa_id)
  from public.contacts c
  where c.id = any (p_contact_ids) and c.anonymized_at is null and (c.phone is not null or c.wa_id is not null)
    and case when t.category = 'marketing' then c.consent_status = 'autorizado' else c.consent_status <> 'saiu' end
  on conflict do nothing;
  get diagnostics v_added = row_count;
  if v_added = 0 then perform private.fail('Nenhum contato elegível neste público.'); end if;

  select * into s from public.app_settings where id;
  update public.campaigns set status = 'Agendada', scheduled_at = greatest(p_send_at, now()), confirmed_at = now(), confirmed_by = uid,
    cost_per_message = case when t.category = 'marketing' then (s.costs ->> 'marketing')::numeric else (s.costs ->> 'utilidade')::numeric end
  where id = cp.id;
  perform private.audit('confirm', 'campaign', cp.id::text, jsonb_build_object('recipients', v_added, 'skipped', v_total - v_added));
  return jsonb_build_object('recipients', v_added, 'skipped', v_total - v_added);
end $$;

create or replace function public.set_campaign_status(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare cp public.campaigns;
begin
  perform private.require_manager();
  select * into cp from public.campaigns where id = p_id for update;
  if not found then perform private.fail('Campanha não encontrada.'); end if;
  if cp.status in ('Concluída', 'Cancelada') then perform private.fail('Esta campanha já terminou.'); end if;
  if cp.status = 'Rascunho' then perform private.fail('Confirme a campanha antes.'); end if;
  if p_action = 'pausar' then
    update public.campaigns set status = 'Pausada' where id = p_id;
  elsif p_action = 'retomar' then
    if cp.status <> 'Pausada' then perform private.fail('A campanha não está pausada.'); end if;
    update public.campaigns set status = 'Agendada' where id = p_id;
  elsif p_action = 'cancelar' then
    update public.campaigns set status = 'Cancelada' where id = p_id;
    update public.messages set status = 'failed', failed_at = now(), next_attempt_at = null, error_code = 'cancelled', error_message = 'Campanha cancelada.'
    where campaign_id = p_id and status = 'pending';
  else
    perform private.fail('Ação inválida.');
  end if;
  perform private.audit(p_action, 'campaign', p_id::text);
end $$;

/** Valor de cada variável do modelo para um contato (VarMap da tela). */
create or replace function private.campaign_params(p_vars jsonb, c public.contacts) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare k text; spec jsonb; val text; out jsonb := '{}';
begin
  for k, spec in select key, value from jsonb_each(coalesce(p_vars, '{}')) loop
    val := case spec ->> 'source'
      when 'primeiro_nome' then split_part(btrim(c.name), ' ', 1)
      when 'nome' then c.name
      when 'cidade' then nullif(c.city, '')
      when 'produto' then (select lower(d.title) from public.deals d where d.contact_id = c.id and d.status <> 'perdido' order by d.created_at desc limit 1)
      when 'responsavel' then (select split_part(p.name, ' ', 1) from public.profiles p where p.id = c.owner_id)
      when 'fixo' then spec ->> 'fixed'
      else spec ->> 'fixed' end;
    out := out || jsonb_build_object(k, coalesce(nullif(btrim(val), ''), spec ->> 'fallback', ''));
  end loop;
  return out;
end $$;

/** Agendador: move campanhas vencidas para "Enviando" e coloca um lote de mensagens na fila. */
create or replace function public.svc_dispatch_campaigns(p_batch int default 200) returns integer
language plpgsql security definer set search_path = '' as $$
declare cp public.campaigns; t public.templates; ch public.channels; r record; c public.contacts; v_conv uuid; v_msg uuid; n int := 0; v_params jsonb;
begin
  for cp in select * from public.campaigns where status in ('Agendada', 'Enviando') and scheduled_at <= now() order by scheduled_at for update skip locked loop
    select * into t from public.templates where id = cp.template_id;
    select * into ch from public.channels where id = cp.sender_channel_id;
    if t.status <> 'aprovado' or ch.status <> 'conectado' then
      update public.campaigns set status = 'Pausada' where id = cp.id;
      if cp.confirmed_by is not null then
        insert into public.notifications (user_id, text, href) values (cp.confirmed_by,
          format('Campanha "%s" pausada: %s', cp.name, case when t.status <> 'aprovado' then 'o modelo deixou de estar aprovado' else 'o número não está conectado' end),
          '/campanhas/' || cp.id);
      end if;
      continue;
    end if;
    if cp.status = 'Agendada' then update public.campaigns set status = 'Enviando' where id = cp.id; end if;

    for r in select * from public.campaign_recipients where campaign_id = cp.id and status = 'Na fila' and message_id is null
             order by contact_id limit greatest(1, p_batch - n) for update skip locked loop
      select * into c from public.contacts where id = r.contact_id;
      if c.id is null or c.anonymized_at is not null or (c.phone is null and c.wa_id is null) then
        update public.campaign_recipients set status = 'Falhou', error = 'Contato sem WhatsApp.', updated_at = now() where campaign_id = cp.id and contact_id = r.contact_id;
        continue;
      end if;
      if (t.category = 'marketing' and c.consent_status <> 'autorizado') or c.consent_status = 'saiu' then
        update public.campaign_recipients set status = 'Saiu', updated_at = now() where campaign_id = cp.id and contact_id = r.contact_id;
        continue;
      end if;
      v_conv := private.open_conversation(c.id, ch.id);
      v_params := private.campaign_params(cp.vars, c);
      insert into public.messages (conversation_id, channel_id, kind, author_id, type, body, status, client_id, template_id, template_params,
                                   campaign_id, metadata, next_attempt_at)
      values (v_conv, ch.id, 'equipe', null, 'template', private.render_template(t.body, v_params), 'pending', gen_random_uuid(), t.id, v_params,
              cp.id, jsonb_build_object('campaign', cp.name), now())
      returning id into v_msg;
      update public.campaign_recipients set message_id = v_msg, updated_at = now() where campaign_id = cp.id and contact_id = r.contact_id;
      n := n + 1;
    end loop;

    if not exists (select 1 from public.campaign_recipients where campaign_id = cp.id and status = 'Na fila' and message_id is null)
       and not exists (select 1 from public.messages where campaign_id = cp.id and status in ('pending', 'sending')) then
      update public.campaigns set status = 'Concluída' where id = cp.id;
    end if;
    exit when n >= p_batch;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- lembretes de tarefas
create or replace function public.svc_task_reminders(p_ahead interval default interval '15 minutes') returns integer
language plpgsql security definer set search_path = '' as $$
declare t record; n int := 0;
begin
  for t in select tk.*, coalesce((p.notify ->> 'tarefas')::boolean, true) as wants from public.tasks tk join public.profiles p on p.id = tk.owner_id and p.active
           where tk.done_at is null and tk.reminded_at is null and tk.due_at <= now() + p_ahead and tk.due_at > now()
           for update of tk skip locked loop
    if t.wants then
      insert into public.notifications (user_id, text, href, dedupe_key)
      values (t.owner_id, 'Lembrete: ' || t.title || ' às ' || to_char(t.due_at at time zone 'America/Sao_Paulo', 'HH24:MI'), '/tarefas', 'task-soon:' || t.id || ':' || extract(epoch from t.due_at)::bigint)
      on conflict do nothing;
      n := n + 1;
    end if;
    update public.tasks set reminded_at = now() where id = t.id;
  end loop;
  for t in select tk.*, coalesce((p.notify ->> 'tarefas')::boolean, true) as wants from public.tasks tk join public.profiles p on p.id = tk.owner_id and p.active
           where tk.done_at is null and tk.overdue_notified_at is null and tk.due_at <= now()
           for update of tk skip locked loop
    if t.wants then
      insert into public.notifications (user_id, text, href, dedupe_key)
      values (t.owner_id, 'Tarefa em atraso: ' || t.title, '/tarefas', 'task-late:' || t.id || ':' || extract(epoch from t.due_at)::bigint)
      on conflict do nothing;
      n := n + 1;
    end if;
    update public.tasks set overdue_notified_at = now(), reminded_at = coalesce(reminded_at, now()) where id = t.id;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- LGPD
/** Relatório completo dos dados de um titular (art. 18, II). */
create or replace function public.lgpd_export_contact(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb;
begin
  perform private.require_admin();
  if not exists (select 1 from public.contacts where id = p_id) then perform private.fail('Contato não encontrado.'); end if;
  select jsonb_build_object(
    'gerado_em', now(),
    'contato', (select to_jsonb(c) - 'channels' from public.contacts c where c.id = p_id),
    'tags', (select coalesce(jsonb_agg(t.name), '[]') from public.contact_tags ct join public.tags t on t.id = ct.tag_id where ct.contact_id = p_id),
    'listas', (select coalesce(jsonb_agg(l.name), '[]') from public.contact_list_members m join public.contact_lists l on l.id = m.list_id where m.contact_id = p_id),
    'consentimentos', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]') from public.consent_events e where e.contact_id = p_id),
    'negocios', (select coalesce(jsonb_agg(to_jsonb(d) || jsonb_build_object(
                   'notas', (select coalesce(jsonb_agg(to_jsonb(n)), '[]') from public.deal_notes n where n.deal_id = d.id),
                   'historico', (select coalesce(jsonb_agg(to_jsonb(h)), '[]') from public.deal_history h where h.deal_id = d.id))), '[]')
                 from public.deals d where d.contact_id = p_id),
    'tarefas', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.tasks t where t.contact_id = p_id),
    'conversas', (select coalesce(jsonb_agg(jsonb_build_object('canal', v.channel, 'criada_em', v.created_at, 'mensagens',
                   (select coalesce(jsonb_agg(jsonb_build_object('em', m.created_at, 'tipo', m.kind, 'formato', m.type, 'texto', m.body, 'status', m.status,
                      'anexos', (select coalesce(jsonb_agg(jsonb_build_object('tipo', mm.kind, 'arquivo', mm.file_name, 'caminho', mm.storage_path)), '[]')
                                 from public.message_media mm where mm.message_id = m.id)) order by m.created_at), '[]')
                    from public.messages m where m.conversation_id = v.id and m.kind <> 'nota'))), '[]')
                  from public.conversations v where v.contact_id = p_id),
    'campanhas', (select coalesce(jsonb_agg(jsonb_build_object('campanha', cp.name, 'status', r.status, 'atualizado_em', r.updated_at)), '[]')
                  from public.campaign_recipients r join public.campaigns cp on cp.id = r.campaign_id where r.contact_id = p_id)
  ) into out;
  insert into public.data_requests (contact_id, kind, status, requested_by, completed_at) values (p_id, 'acesso', 'concluida', auth.uid(), now());
  perform private.audit('export', 'contact', p_id::text);
  return out;
end $$;

/**
 * Anonimiza o titular (art. 18, IV): remove identificadores e conteúdo das conversas,
 * mantém números agregados (negócios, valores) para estatística. Devolve os arquivos a apagar.
 */
create or replace function public.lgpd_anonymize_contact(p_id uuid, p_reason text) returns text[]
language plpgsql security definer set search_path = '' as $$
declare paths text[];
begin
  perform private.require_admin();
  if not exists (select 1 from public.contacts where id = p_id) then perform private.fail('Contato não encontrado.'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then perform private.fail('Informe o motivo (ex.: pedido do titular).'); end if;
  paths := private.contact_media_paths(p_id);
  delete from public.message_media where message_id in (select m.id from public.messages m join public.conversations v on v.id = m.conversation_id where v.contact_id = p_id);
  update public.messages set body = null, metadata = '{}', template_params = null, error_message = null
  where conversation_id in (select id from public.conversations where contact_id = p_id);
  update public.conversations set last_message_preview = null where contact_id = p_id;
  update public.deal_notes set text = '[removido por anonimização]' where deal_id in (select id from public.deals where contact_id = p_id);
  update public.deals set ad_name = null where contact_id = p_id;
  update public.campaign_recipients set name = 'Anonimizado', phone = '' where contact_id = p_id;
  delete from public.contact_tags where contact_id = p_id;
  delete from public.contact_list_members where contact_id = p_id;
  update public.contacts set name = 'Contato anonimizado', phone = null, wa_id = null, instagram_id = null, instagram_username = null,
    email = null, city = '', ad_ref = null, consent_status = 'saiu', consent_at = now(), consent_origin = 'Anonimização LGPD',
    anonymized_at = now() where id = p_id;
  insert into public.consent_events (contact_id, status, origin, actor_id, evidence)
  values (p_id, 'saiu', 'Anonimização LGPD', auth.uid(), jsonb_build_object('motivo', btrim(p_reason)));
  insert into public.data_requests (contact_id, kind, status, notes, requested_by, completed_at)
  values (p_id, 'anonimizacao', 'concluida', btrim(p_reason), auth.uid(), now());
  perform private.audit('anonymize', 'contact', p_id::text, jsonb_build_object('motivo', btrim(p_reason)));
  return paths;
end $$;

/** Minimização (art. 15/16): descarta dados operacionais que já cumpriram a finalidade. */
create or replace function public.svc_run_retention() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.app_settings; a int; b int; c int;
begin
  select * into s from public.app_settings where id;
  delete from public.webhook_events where status in ('processed', 'ignored', 'failed')
    and received_at < now() - make_interval(days => coalesce((s.retention_days ->> 'webhook_events')::int, 30));
  get diagnostics a = row_count;
  delete from public.message_status_events where created_at < now() - make_interval(days => coalesce((s.retention_days ->> 'status_events')::int, 90));
  get diagnostics b = row_count;
  delete from public.notifications where created_at < now() - make_interval(days => coalesce((s.retention_days ->> 'notifications')::int, 90));
  get diagnostics c = row_count;
  return jsonb_build_object('webhook_events', a, 'status_events', b, 'notifications', c);
end $$;

-- ---------------------------------------------------------------- auditoria automática
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'profiles' then
    if new.role is distinct from old.role or new.active is distinct from old.active then
      perform private.audit('update', 'profile', new.id::text, jsonb_build_object('role', jsonb_build_array(old.role, new.role), 'active', jsonb_build_array(old.active, new.active)));
    end if;
    return new;
  end if;
  perform private.audit(lower(tg_op), tg_table_name, coalesce(new.id, old.id)::text,
                        case when tg_op = 'DELETE' then to_jsonb(old) - 'token_secret_id' else to_jsonb(new) - 'token_secret_id' end);
  return coalesce(new, old);
end $$;
create trigger profiles_audit after update on public.profiles for each row execute function private.audit_row();
create trigger channels_audit after insert or update or delete on public.channels for each row execute function private.audit_row();

-- ---------------------------------------------------------------- Storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 104857600, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg', 'audio/wav', 'audio/webm',
  'video/mp4', 'video/3gpp', 'video/quicktime', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain',
  'application/octet-stream'])
on conflict (id) do nothing;

create or replace function private.try_uuid(t text) returns uuid
language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;
grant execute on function private.try_uuid(text) to authenticated;

-- Caminhos: inbound/<conversa>/<arquivo> (gravado pelo backend) e outbound/<conversa>/<arquivo> (enviado pela tela).
create policy chat_media_read on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and private.can_view_conversation(private.try_uuid((storage.foldername(objects.name))[2])));
create policy chat_media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and (storage.foldername(objects.name))[1] = 'outbound'
              and exists (select 1 from public.conversations v join public.contacts c on c.id = v.contact_id
                          where v.id = private.try_uuid((storage.foldername(objects.name))[2]) and private.can_reply_owner(c.owner_id)));

-- ---------------------------------------------------------------- Realtime (respeita RLS)
alter publication supabase_realtime add table public.messages, public.conversations, public.contacts, public.deals,
  public.tasks, public.notifications, public.message_media, public.contact_tags;

-- ---------------------------------------------------------------- grants
grant execute on function public.confirm_campaign(uuid, uuid[], timestamptz), public.set_campaign_status(uuid, text),
  public.lgpd_export_contact(uuid), public.lgpd_anonymize_contact(uuid, text) to authenticated;
grant execute on function public.svc_dispatch_campaigns(int), public.svc_task_reminders(interval), public.svc_run_retention() to service_role;
