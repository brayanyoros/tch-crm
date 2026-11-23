-- =============================================================================
-- TCH CRM · 0007 · Motor de mensagens: janelas da Meta, fila de envio, webhooks
-- =============================================================================
-- Fluxo de saída:  tela → Edge send-message → enqueue_outbound_message (regras) →
--                  svc_claim_outbound → Graph API → svc_complete_outbound
-- Fluxo de entrada: Meta → Edge meta-webhook (assinatura) → webhook_events →
--                  svc_ingest_message / svc_record_status (idempotentes)
-- Funções svc_* só podem ser chamadas pelo service_role (Edge Functions).

-- ---------------------------------------------------------------- janela de atendimento
/**
 * Estado da janela para responder sem modelo.
 *   WhatsApp: 24 h desde a última mensagem do cliente (fora disso, só modelo aprovado).
 *   Instagram: 24 h; com HUMAN_AGENT aprovado, até 7 dias. Instagram não tem modelos.
 */
create or replace function private.window_state(p_conversation uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v public.conversations; s public.app_settings; v_hours int; v_ends timestamptz; v_agent timestamptz;
begin
  select * into v from public.conversations where id = p_conversation;
  select * into s from public.app_settings where id;
  v_hours := least(coalesce((s.limits ->> 'windowH')::int, 24), 24);
  v_ends := v.last_inbound_at + make_interval(hours => v_hours);
  if v.channel = 'instagram' and s.instagram_human_agent then v_agent := v.last_inbound_at + interval '7 days'; end if;
  return jsonb_build_object(
    'channel', v.channel,
    'open', v_ends is not null and now() < v_ends,
    'ends_at', v_ends,
    'human_agent_until', v_agent,
    'human_agent', v_agent is not null and now() >= v_ends and now() < v_agent
  );
end $$;

create or replace function public.conversation_window(p_conversation_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_member();
  if not private.can_view_conversation(p_conversation_id) then perform private.fail('Conversa não encontrada.'); end if;
  return private.window_state(p_conversation_id);
end $$;

-- ---------------------------------------------------------------- distribuição de leads novos
create or replace function private.next_round_robin_owner() returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.app_settings; v_members uuid[]; v_cursor int;
begin
  select * into s from public.app_settings where id for update;
  if coalesce(s.distribution ->> 'mode', 'livre') <> 'rodizio' then return null; end if;
  select coalesce(array_agg(p.id order by m.ord), '{}') into v_members
  from jsonb_array_elements_text(coalesce(s.distribution -> 'members', '[]')) with ordinality m(id, ord)
  join public.profiles p on p.id = m.id::uuid and p.active;
  if cardinality(v_members) = 0 then return null; end if;
  update public.app_settings set distribution_cursor = distribution_cursor + 1 where id returning distribution_cursor into v_cursor;
  return v_members[((v_cursor - 1) % cardinality(v_members)) + 1];
end $$;

-- ---------------------------------------------------------------- efeitos de cada mensagem nova
create or replace function private.message_preview(m public.messages) returns text
language sql immutable as $$
  select left(coalesce(nullif(m.body, ''), case m.type
    when 'image' then '📷 Foto' when 'audio' then '🎤 Áudio' when 'video' then '🎬 Vídeo' when 'document' then '📄 Documento'
    when 'sticker' then 'Figurinha' when 'location' then '📍 Localização' when 'contacts' then '👤 Contato'
    when 'story_mention' then 'Mencionou você no story' else 'Mensagem' end), 160);
$$;

create or replace function private.on_message_inserted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v public.conversations; c public.contacts; v_reply int; d record; s public.app_settings;
begin
  if new.kind = 'nota' then return new; end if;
  select * into v from public.conversations where id = new.conversation_id for update;
  select * into c from public.contacts where id = v.contact_id;

  if new.kind = 'cliente' then
    update public.conversations set
      unread = unread + 1, closed = false,
      last_inbound_at = greatest(coalesce(last_inbound_at, new.created_at), new.created_at),
      awaiting_since = coalesce(awaiting_since, new.created_at),
      last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at),
      last_message_preview = case when new.created_at >= coalesce(last_message_at, new.created_at) then private.message_preview(new) else last_message_preview end
    where id = v.id;
    -- resposta a campanha
    update public.campaign_recipients r set status = 'Respondeu', updated_at = now()
    from public.messages m
    where r.message_id = m.id and m.conversation_id = v.id and r.status in ('Enviada', 'Entregue', 'Lida')
      and m.created_at > now() - interval '30 days';
    -- avisa o responsável (uma notificação por conversa até ser lida)
    if c.owner_id is not null and exists (select 1 from public.profiles p where p.id = c.owner_id and p.active and coalesce((p.notify ->> 'mensagens')::boolean, true)) then
      insert into public.notifications (user_id, text, href, dedupe_key)
      values (c.owner_id, c.name || ' enviou uma mensagem', '/conversas/' || v.id, 'conv:' || v.id)
      on conflict (user_id, dedupe_key) where dedupe_key is not null
      do update set text = excluded.text, created_at = now(), read_at = null;
    end if;
  else -- equipe
    update public.conversations set
      closed = false,
      unread = case when new.author_id is not null then 0 else unread end,
      awaiting_since = case when new.author_id is not null then null else awaiting_since end,
      last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at),
      last_message_preview = private.message_preview(new)
    where id = v.id;
    -- tempo de resposta (só resposta humana a cliente aguardando)
    if new.author_id is not null and v.awaiting_since is not null then
      v_reply := greatest(0, floor(extract(epoch from (new.created_at - v.awaiting_since)) / 60))::int;
      update public.deals set
        first_reply_min = coalesce(first_reply_min, v_reply),
        avg_reply_min = ((coalesce(avg_reply_min, 0) * reply_count) + v_reply) / (reply_count + 1),
        reply_count = reply_count + 1
      where contact_id = c.id and status = 'aberto';
    end if;
  end if;

  update public.contacts set last_contact_at = greatest(last_contact_at, new.created_at) where id = c.id;
  update public.deals set last_message_at = greatest(last_message_at, new.created_at) where contact_id = c.id and status = 'aberto';
  return new;
end $$;
create trigger messages_after_insert after insert on public.messages for each row execute function private.on_message_inserted();

-- ---------------------------------------------------------------- status (sent → delivered → read; failed)
create or replace function private.status_rank(s public.message_status) returns int
language sql immutable as $$
  select case s when 'pending' then 0 when 'sending' then 1 when 'sent' then 2 when 'delivered' then 3 when 'read' then 4 else -1 end;
$$;

/** Aplica um status respeitando a ordem: webhooks chegam fora de ordem e repetidos. */
create or replace function private.apply_status(p_message uuid, p_status public.message_status, p_at timestamptz, p_error jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_message for update;
  if not found or m.kind <> 'equipe' then return false; end if;
  if p_status = 'failed' then
    if private.status_rank(m.status) >= 3 or m.status = 'failed' then return false; end if;
    update public.messages set status = 'failed', failed_at = p_at, error_code = coalesce(p_error ->> 'code', error_code),
      error_message = coalesce(p_error ->> 'message', p_error ->> 'title', error_message) where id = m.id;
    return true;
  end if;
  if m.status = 'failed' and p_status in ('delivered', 'read') then
    null; -- entregue depois de falha reportada: a entrega prevalece
  elsif private.status_rank(p_status) <= private.status_rank(m.status) then
    return false;
  end if;
  update public.messages set status = p_status,
    sent_at = coalesce(sent_at, p_at),
    delivered_at = case when p_status in ('delivered', 'read') then coalesce(delivered_at, p_at) else delivered_at end,
    read_at = case when p_status = 'read' then coalesce(read_at, p_at) else read_at end
  where id = m.id;
  return true;
end $$;

/** Quando o id da Meta é gravado, aplica os status que chegaram antes dele. */
create or replace function private.on_message_external_id() returns trigger
language plpgsql security definer set search_path = '' as $$
declare e record;
begin
  for e in select * from public.message_status_events
           where channel_id = new.channel_id and external_id = new.external_id and applied_at is null
           order by private.status_rank(status), occurred_at loop
    perform private.apply_status(new.id, e.status, e.occurred_at, e.error);
    update public.message_status_events set applied_at = now() where id = e.id;
  end loop;
  return new;
end $$;
create trigger messages_external_id after update of external_id on public.messages
  for each row when (new.external_id is not null and old.external_id is distinct from new.external_id)
  execute function private.on_message_external_id();

create or replace function private.recipient_rank(s text) returns int
language sql immutable as $$
  select case s when 'Na fila' then 0 when 'Enviada' then 1 when 'Falhou' then 1 when 'Entregue' then 2 when 'Lida' then 3 else 4 end;
$$;

/** Reflete o status da mensagem no destinatário da campanha (sem regredir; Respondeu/Saiu prevalecem). */
create or replace function private.on_message_status_campaign() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  v_status := case new.status when 'sent' then 'Enviada' when 'delivered' then 'Entregue' when 'read' then 'Lida' when 'failed' then 'Falhou' end;
  if v_status is null then return new; end if;
  update public.campaign_recipients set status = v_status, error = case when new.status = 'failed' then new.error_message end, updated_at = now()
  where message_id = new.id and status not in ('Respondeu', 'Saiu')
    and case when v_status = 'Falhou' then status in ('Na fila', 'Enviada')
             else private.recipient_rank(status) < private.recipient_rank(v_status) end;
  return new;
end $$;
create trigger messages_status_campaign after update of status on public.messages
  for each row when (new.campaign_id is not null and old.status is distinct from new.status)
  execute function private.on_message_status_campaign();

-- ---------------------------------------------------------------- abrir conversa / enfileirar envio
create or replace function private.open_conversation(p_contact uuid, p_channel uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_type public.channel_type;
begin
  select type into v_type from public.channels where id = p_channel;
  insert into public.conversations (contact_id, channel_id, channel) values (p_contact, p_channel, v_type)
  on conflict (contact_id, channel_id) do update set updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

/** Abre (ou reaproveita) a conversa de um contato no canal conectado do tipo pedido. */
create or replace function public.start_conversation(p_contact_id uuid, p_channel public.channel_type default 'whatsapp') returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.contacts; v_channel uuid;
begin
  perform private.require_member();
  c := private.contact_for(p_contact_id, 'reply');
  if not (p_channel = any (c.channels)) then perform private.fail('Este contato não tem ' || case when p_channel = 'whatsapp' then 'WhatsApp.' else 'Instagram.' end); end if;
  if p_channel = 'instagram' and c.instagram_id is null then
    perform private.fail('No Instagram, só é possível responder quem escreveu primeiro.');
  end if;
  select id into v_channel from public.channels where type = p_channel and status = 'conectado' order by created_at limit 1;
  if v_channel is null then perform private.fail('Nenhum canal conectado para este tipo.'); end if;
  return private.open_conversation(c.id, v_channel);
end $$;

/** Texto do modelo com as variáveis preenchidas ({{1}}, {{2}}… ou {{nome}}), para exibir na conversa. */
create or replace function private.render_template(p_body text, p_params jsonb) returns text
language plpgsql immutable as $$
declare out text := coalesce(p_body, ''); i int := 0; v text; k text;
begin
  if jsonb_typeof(p_params) = 'array' then
    for v in select jsonb_array_elements_text(p_params) loop
      i := i + 1;
      out := replace(out, '{{' || i || '}}', v);
    end loop;
  elsif jsonb_typeof(p_params) = 'object' then
    for k, v in select key, value from jsonb_each_text(p_params) loop
      out := replace(out, '{{' || k || '}}', v);
    end loop;
  end if;
  return out;
end $$;

/**
 * Regras de envio + gravação na fila (status pending). Idempotente por client_id.
 * p: { conversation_id, client_id, text?, template?: {id, params}, media?: {storage_path, kind, mime_type, file_name, size_bytes}, reply_to_id? }
 */
create or replace function public.enqueue_outbound_message(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_member(); v public.conversations; c public.contacts; ch public.channels; w jsonb;
  t public.templates; v_client uuid := nullif(p ->> 'client_id', '')::uuid; v_text text := nullif(btrim(p ->> 'text'), '');
  v_media jsonb := p -> 'media'; v_type public.message_type := 'text'; v_meta jsonb := '{}'; v_id uuid; m public.messages;
  v_reply uuid := nullif(p ->> 'reply_to_id', '')::uuid; v_reply_ext text; v_max int; v_size bigint;
begin
  if v_client is null then perform private.fail('Envio sem identificador (client_id).'); end if;
  select * into m from public.messages where client_id = v_client;
  if found then
    if m.author_id is distinct from uid then perform private.fail('Identificador de envio já usado.'); end if;
    return to_jsonb(m); -- reenvio do mesmo clique: devolve o que já existe
  end if;

  v := private.conversation_for((p ->> 'conversation_id')::uuid, 'reply');
  select * into c from public.contacts where id = v.contact_id;
  select * into ch from public.channels where id = v.channel_id;
  if ch.status = 'desativado' then perform private.fail('Este canal está desativado.'); end if;
  if c.anonymized_at is not null then perform private.fail('Contato anonimizado: não é possível enviar mensagens.'); end if;
  w := private.window_state(v.id);

  if p ? 'template' and p -> 'template' is not null and jsonb_typeof(p -> 'template') = 'object' then
    if v.channel <> 'whatsapp' then perform private.fail('Modelos existem apenas no WhatsApp.'); end if;
    select * into t from public.templates where id = (p -> 'template' ->> 'id')::uuid and channel_id = v.channel_id;
    if not found then perform private.fail('Modelo não encontrado para este número.'); end if;
    if t.status <> 'aprovado' then perform private.fail('Este modelo não está aprovado pela Meta.'); end if;
    if t.category = 'marketing' and c.consent_status <> 'autorizado' then
      perform private.fail('Este contato não autorizou mensagens de marketing.');
    end if;
    v_type := 'template';
    v_text := private.render_template(t.body, p -> 'template' -> 'params');
    if v_text ~ '[{][{][^}]+[}][}]' then perform private.fail('Preencha todas as variáveis do modelo.'); end if;
  else
    if not (w ->> 'open')::boolean and not coalesce((w ->> 'human_agent')::boolean, false) then
      perform private.fail(case when v.channel = 'whatsapp' then 'A janela de 24h encerrou. Use um modelo aprovado.'
                                else 'A janela de atendimento do Instagram encerrou. Aguarde o cliente escrever.' end);
    end if;
    if coalesce((w ->> 'human_agent')::boolean, false) then v_meta := jsonb_build_object('tag', 'HUMAN_AGENT'); end if;
    if v_media is not null and jsonb_typeof(v_media) = 'object' then
      if coalesce(v_media ->> 'kind', '') not in ('image', 'audio', 'video', 'document') then perform private.fail('Tipo de anexo não suportado.'); end if;
      if coalesce(v_media ->> 'storage_path', '') not like 'outbound/' || v.id || '/%' or (v_media ->> 'storage_path') like '%..%' then
        perform private.fail('Anexo inválido.');
      end if;
      v_size := coalesce((v_media ->> 'size_bytes')::bigint, 0);
      v_max := case v_media ->> 'kind' when 'image' then 5 when 'document' then 100 else 16 end * 1024 * 1024;
      if v.channel = 'instagram' then v_max := least(v_max, 25 * 1024 * 1024); end if;
      if v_size > v_max then perform private.fail('O arquivo passa do limite da Meta para este tipo.'); end if;
      v_type := (v_media ->> 'kind')::public.message_type;
      if v.channel = 'instagram' and v_text is not null then
        perform private.fail('No Instagram, envie o texto e o anexo em mensagens separadas.');
      end if;
    elsif v_text is null then
      perform private.fail('Escreva a mensagem.');
    end if;
    if v_text is not null and char_length(v_text) > (case when v.channel = 'instagram' then 1000 else 4096 end) then
      perform private.fail('A mensagem passa do limite de caracteres do canal.');
    end if;
  end if;

  if v_reply is not null then
    select external_id into v_reply_ext from public.messages where id = v_reply and conversation_id = v.id;
  end if;

  insert into public.messages (conversation_id, channel_id, kind, author_id, type, body, status, client_id, template_id, template_params,
                               reply_to_id, reply_to_external_id, metadata, next_attempt_at)
  values (v.id, v.channel_id, 'equipe', uid, v_type, v_text, 'pending', v_client, t.id, p -> 'template' -> 'params',
          case when v_reply_ext is not null then v_reply end, v_reply_ext, v_meta, now())
  returning id into v_id;

  if v_type in ('image', 'audio', 'video', 'document') then
    insert into public.message_media (message_id, kind, mime_type, file_name, size_bytes, storage_path, status)
    values (v_id, v_media ->> 'kind', v_media ->> 'mime_type', left(v_media ->> 'file_name', 255), v_size, v_media ->> 'storage_path', 'stored');
  end if;

  select * into m from public.messages where id = v_id;
  return to_jsonb(m);
end $$;

-- ---------------------------------------------------------------- svc: canais e segredos
create or replace function public.svc_channel_lookup(p_type public.channel_type, p_external_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(ch) - 'token_secret_id' from public.channels ch
  where ch.type = p_type and (case when p_type = 'whatsapp' then ch.phone_number_id else ch.ig_user_id end) = p_external_id
    and ch.status <> 'desativado';
$$;

create or replace function public.svc_channel_token(p_channel_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select ds.decrypted_secret from public.channels ch join vault.decrypted_secrets ds on ds.id = ch.token_secret_id where ch.id = p_channel_id;
$$;

/** Grava/atualiza o token de acesso do canal no Vault (admin). O valor nunca volta ao cliente. */
create or replace function public.admin_set_channel_token(p_channel_id uuid, p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_secret uuid;
begin
  perform private.require_admin();
  if char_length(coalesce(p_token, '')) < 20 then perform private.fail('Token inválido.'); end if;
  select token_secret_id into v_secret from public.channels where id = p_channel_id;
  if not found then perform private.fail('Canal não encontrado.'); end if;
  if v_secret is null then
    v_secret := vault.create_secret(p_token, 'channel_token_' || p_channel_id, 'Token de acesso Meta do canal ' || p_channel_id);
    update public.channels set token_secret_id = v_secret where id = p_channel_id;
  else
    perform vault.update_secret(v_secret, p_token);
  end if;
  perform private.audit('update', 'channel_token', p_channel_id::text);
end $$;

create or replace function public.svc_channel_health(p_channel_id uuid, p_status public.channel_status default null, p_quality text default null,
                                                     p_limit text default null, p_error text default null) returns void
language sql security definer set search_path = '' as $$
  update public.channels set status = coalesce(p_status, status), quality = coalesce(p_quality, quality),
    messaging_limit = coalesce(p_limit, messaging_limit), last_error = p_error where id = p_channel_id;
$$;

-- ---------------------------------------------------------------- svc: entrada
/**
 * Grava uma mensagem recebida (ou eco de mensagem enviada fora do CRM). Idempotente por (canal, external_id).
 * p: { external_id, from_id, profile_name?, username?, timestamp (epoch s), type, body?, media?, reply_to_external_id?,
 *      referral?, metadata?, is_echo?, recipient_id? }
 */
create or replace function public.svc_ingest_message(p_channel_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ch public.channels; v_customer text; v_contact uuid; v_conv uuid; v_msg uuid; v_new_contact boolean := false;
  v_at timestamptz; v_phone text; v_echo boolean := coalesce((p ->> 'is_echo')::boolean, false); v_type public.message_type;
  v_name text := nullif(btrim(p ->> 'profile_name'), ''); v_media uuid; v_body text := left(p ->> 'body', 4096);
  s public.app_settings; v_origin text; v_kw text;
begin
  select * into ch from public.channels where id = p_channel_id;
  if not found then raise exception 'canal % inexistente', p_channel_id; end if;
  if coalesce(p ->> 'external_id', '') = '' then raise exception 'external_id obrigatório'; end if;

  -- já existe? (reentrega do webhook)
  select id into v_msg from public.messages where channel_id = p_channel_id and external_id = p ->> 'external_id';
  if v_msg is not null then
    return jsonb_build_object('duplicate', true, 'message_id', v_msg);
  end if;

  v_customer := case when v_echo then p ->> 'recipient_id' else p ->> 'from_id' end;
  if coalesce(v_customer, '') = '' then raise exception 'remetente obrigatório'; end if;
  v_at := least(coalesce(to_timestamp((p ->> 'timestamp')::double precision), now()), now());
  begin v_type := coalesce(p ->> 'type', 'text')::public.message_type;
  exception when invalid_text_representation then v_type := 'unsupported'; end;
  v_origin := case when p -> 'referral' ->> 'source_type' = 'ad' or p -> 'referral' ->> 'source' = 'ADS' then 'Anúncio do Meta'
                   when ch.type = 'instagram' then 'Instagram' else 'WhatsApp' end;

  -- contato
  if ch.type = 'whatsapp' then
    select id into v_contact from public.contacts where wa_id = v_customer for update;
    if v_contact is null then
      v_phone := private.normalize_phone('+' || v_customer);
      select id into v_contact from public.contacts where phone = any (private.phone_variants(v_phone)) and wa_id is null limit 1 for update;
      if v_contact is not null then update public.contacts set wa_id = v_customer where id = v_contact; end if;
    end if;
    if v_contact is null then
      begin
        insert into public.contacts (name, phone, wa_id, origin, ad_ref, owner_id)
        values (coalesce(v_name, v_phone, '+' || v_customer), v_phone, v_customer, v_origin, p -> 'referral', private.next_round_robin_owner())
        returning id into v_contact;
        v_new_contact := true;
      exception when unique_violation then
        select id into v_contact from public.contacts where wa_id = v_customer or phone = v_phone limit 1;
        update public.contacts set wa_id = v_customer where id = v_contact and wa_id is null;
      end;
    end if;
  else
    select id into v_contact from public.contacts where instagram_id = v_customer for update;
    if v_contact is null and nullif(p ->> 'username', '') is not null then
      select id into v_contact from public.contacts where lower(instagram_username) = lower(p ->> 'username') and instagram_id is null limit 1 for update;
      if v_contact is not null then update public.contacts set instagram_id = v_customer where id = v_contact; end if;
    end if;
    if v_contact is null then
      begin
        insert into public.contacts (name, instagram_id, instagram_username, origin, ad_ref, owner_id)
        values (coalesce(v_name, nullif(p ->> 'username', ''), 'Instagram ' || right(v_customer, 4)), v_customer,
                nullif(lower(p ->> 'username'), ''), v_origin, p -> 'referral', private.next_round_robin_owner())
        returning id into v_contact;
        v_new_contact := true;
      exception when unique_violation then
        select id into v_contact from public.contacts where instagram_id = v_customer;
      end;
    end if;
  end if;
  if not v_new_contact and p -> 'referral' is not null and jsonb_typeof(p -> 'referral') = 'object' then
    update public.contacts set ad_ref = p -> 'referral', origin = coalesce(origin, v_origin) where id = v_contact;
  end if;

  v_conv := private.open_conversation(v_contact, p_channel_id);

  insert into public.messages (conversation_id, channel_id, kind, type, body, status, external_id, reply_to_external_id, metadata, created_at, sent_at)
  values (v_conv, p_channel_id, case when v_echo then 'equipe'::public.message_kind else 'cliente' end, v_type, v_body,
          case when v_echo then 'sent'::public.message_status else 'received' end, p ->> 'external_id', p ->> 'reply_to_external_id',
          coalesce(p -> 'metadata', '{}') || case when p -> 'referral' is not null then jsonb_build_object('referral', p -> 'referral') else '{}' end
                                         || case when v_echo then jsonb_build_object('echo', true) else '{}' end,
          v_at, case when v_echo then v_at end)
  on conflict (channel_id, external_id) where external_id is not null do nothing
  returning id into v_msg;
  if v_msg is null then -- corrida entre duas entregas do mesmo evento
    select id into v_msg from public.messages where channel_id = p_channel_id and external_id = p ->> 'external_id';
    return jsonb_build_object('duplicate', true, 'message_id', v_msg);
  end if;
  update public.messages m set reply_to_id = r.id from public.messages r
  where m.id = v_msg and m.reply_to_external_id is not null and r.channel_id = p_channel_id and r.external_id = m.reply_to_external_id;

  if p -> 'media' is not null and jsonb_typeof(p -> 'media') = 'object' then
    insert into public.message_media (message_id, kind, mime_type, file_name, sha256, external_media_id, source_url, status)
    values (v_msg, p -> 'media' ->> 'kind', p -> 'media' ->> 'mime_type', left(p -> 'media' ->> 'file_name', 255), p -> 'media' ->> 'sha256',
            p -> 'media' ->> 'external_media_id', p -> 'media' ->> 'source_url', 'pending')
    returning id into v_media;
  end if;

  -- pedido de saída (opt-out) por palavra-chave
  if not v_echo and v_type in ('text', 'button', 'interactive') and v_body is not null then
    select * into s from public.app_settings where id;
    v_kw := private.normalize_text(v_body);
    if v_kw = any (s.opt_out_keywords) then
      update public.contacts set consent_status = 'saiu', consent_at = now(), consent_origin = 'Pedido do cliente por mensagem' where id = v_contact and consent_status <> 'saiu';
      if found then
        insert into public.consent_events (contact_id, status, origin, evidence)
        values (v_contact, 'saiu', 'Pedido do cliente por mensagem', jsonb_build_object('message_id', v_msg, 'text', v_kw));
        update public.campaign_recipients set status = 'Saiu', updated_at = now() where contact_id = v_contact and status <> 'Saiu'
          and campaign_id in (select id from public.campaigns where status in ('Agendada', 'Enviando', 'Concluída'));
      end if;
    end if;
  end if;

  return jsonb_build_object('duplicate', false, 'message_id', v_msg, 'conversation_id', v_conv, 'contact_id', v_contact,
                            'new_contact', v_new_contact, 'media_id', v_media,
                            'needs_profile', ch.type = 'instagram' and v_new_contact and v_name is null);
end $$;

/** Mensagem apagada pelo cliente (Instagram) ou reação removida: limpa o conteúdo, mantém o registro. */
create or replace function public.svc_message_deleted(p_channel_id uuid, p_external_id text) returns boolean
language sql security definer set search_path = '' as $$
  with u as (
    update public.messages set body = null, metadata = metadata || '{"deleted": true}' where channel_id = p_channel_id and external_id = p_external_id returning 1
  ) select exists (select 1 from u);
$$;

create or replace function public.svc_set_contact_profile(p_contact_id uuid, p_name text, p_username text) returns void
language sql security definer set search_path = '' as $$
  update public.contacts set
    name = case when name like 'Instagram %' and nullif(btrim(p_name), '') is not null then left(btrim(p_name), 160) else name end,
    instagram_username = coalesce(instagram_username, nullif(lower(p_username), ''))
  where id = p_contact_id
    and (nullif(lower(p_username), '') is null or not exists (select 1 from public.contacts o where lower(o.instagram_username) = lower(p_username) and o.id <> p_contact_id));
$$;

/** Registra um status da Meta e aplica se a mensagem já tiver o id; senão fica pendente. */
create or replace function public.svc_record_status(p_channel_id uuid, p_external_id text, p_status public.message_status,
                                                    p_at timestamptz default now(), p_error jsonb default null, p_pricing jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_msg uuid; v_event bigint; v_applied boolean := false;
begin
  insert into public.message_status_events (channel_id, external_id, status, occurred_at, error, pricing)
  values (p_channel_id, p_external_id, p_status, coalesce(p_at, now()), p_error, p_pricing)
  on conflict (channel_id, external_id, status) do nothing
  returning id into v_event;
  if v_event is null then return jsonb_build_object('duplicate', true); end if;
  select id into v_msg from public.messages where channel_id = p_channel_id and external_id = p_external_id;
  if v_msg is not null then
    v_applied := private.apply_status(v_msg, p_status, coalesce(p_at, now()), p_error);
    update public.message_status_events set applied_at = now() where id = v_event;
  end if;
  return jsonb_build_object('duplicate', false, 'message_id', v_msg, 'applied', v_applied);
end $$;

/** Instagram "read": marca como lida a mensagem indicada e as anteriores da conversa. */
create or replace function public.svc_record_read(p_channel_id uuid, p_customer_id text, p_external_id text, p_at timestamptz) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_conv uuid; v_limit timestamptz; m record; n int := 0;
begin
  select v.id into v_conv from public.conversations v join public.contacts c on c.id = v.contact_id
  where v.channel_id = p_channel_id and c.instagram_id = p_customer_id;
  if v_conv is null then return 0; end if;
  select created_at into v_limit from public.messages where channel_id = p_channel_id and external_id = p_external_id;
  for m in select id from public.messages where conversation_id = v_conv and kind = 'equipe' and status in ('sent', 'delivered')
           and created_at <= coalesce(v_limit, p_at) loop
    if private.apply_status(m.id, 'read', p_at, null) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- svc: fila de saída
/**
 * Reserva mensagens pendentes para envio (SKIP LOCKED: vários workers sem duplicar).
 * Devolve tudo que a Edge Function precisa para chamar a Graph API.
 */
create or replace function public.svc_claim_outbound(p_limit int default 20, p_message_id uuid default null) returns setof jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with picked as (
    select m.id from public.messages m
    left join public.campaigns cp on cp.id = m.campaign_id
    where m.status = 'pending' and m.kind = 'equipe'
      and (p_message_id is null or m.id = p_message_id)
      and (p_message_id is not null or m.next_attempt_at <= now())
      and (cp.id is null or cp.status = 'Enviando')
    order by m.next_attempt_at nulls first
    limit greatest(1, least(p_limit, 200))
    for update of m skip locked
  ), upd as (
    update public.messages m set status = 'sending', locked_at = now(), attempts = attempts + 1
    from picked where m.id = picked.id returning m.*
  )
  select jsonb_build_object(
    'id', u.id, 'conversation_id', u.conversation_id, 'channel_id', u.channel_id, 'type', u.type, 'body', u.body,
    'attempts', u.attempts, 'reply_to_external_id', u.reply_to_external_id, 'metadata', u.metadata,
    'campaign_id', u.campaign_id, 'template_params', u.template_params,
    'channel', jsonb_build_object('type', ch.type, 'phone_number_id', ch.phone_number_id, 'waba_id', ch.waba_id,
                                  'ig_user_id', ch.ig_user_id, 'page_id', ch.page_id, 'ig_api', ch.ig_api, 'status', ch.status),
    'recipient', case when ch.type = 'whatsapp' then coalesce(c.wa_id, ltrim(c.phone, '+')) else c.instagram_id end,
    'template', case when t.id is not null then jsonb_build_object('name', t.name, 'language', t.language, 'components', t.components, 'category', t.category, 'header', t.header) end,
    'media', (select jsonb_build_object('id', mm.id, 'kind', mm.kind, 'mime_type', mm.mime_type, 'file_name', mm.file_name, 'storage_path', mm.storage_path)
              from public.message_media mm where mm.message_id = u.id limit 1)
  )
  from upd u
  join public.conversations v on v.id = u.conversation_id
  join public.contacts c on c.id = v.contact_id
  join public.channels ch on ch.id = u.channel_id
  left join public.templates t on t.id = u.template_id;
end $$;

/**
 * Resultado do envio.
 *  - sucesso: grava external_id e status sent (absorvendo um eco do Instagram que tenha chegado antes);
 *  - erro com p_retry_at: volta para pending (até 5 tentativas);
 *  - erro definitivo: failed.
 */
create or replace function public.svc_complete_outbound(p_message_id uuid, p_external_id text default null, p_error jsonb default null,
                                                        p_retry_at timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_message_id for update;
  if not found then return; end if;
  if p_external_id is not null then
    delete from public.messages e where e.channel_id = m.channel_id and e.external_id = p_external_id and e.id <> m.id
      and e.kind = 'equipe' and e.author_id is null and coalesce((e.metadata ->> 'echo')::boolean, false);
    update public.messages set status = 'sent', external_id = p_external_id, sent_at = coalesce(sent_at, now()),
      locked_at = null, next_attempt_at = null, error_code = null, error_message = null
    where id = m.id and status in ('sending', 'pending');
  elsif p_retry_at is not null and m.attempts < 5 then
    update public.messages set status = 'pending', next_attempt_at = p_retry_at, locked_at = null,
      error_code = p_error ->> 'code', error_message = p_error ->> 'message' where id = m.id;
  else
    update public.messages set status = 'failed', failed_at = now(), locked_at = null, next_attempt_at = null,
      error_code = coalesce(p_error ->> 'code', 'unknown'), error_message = coalesce(p_error ->> 'message', 'Falha no envio.') where id = m.id;
  end if;
end $$;

/**
 * Mensagens presas em "sending" (worker caiu no meio da chamada): o resultado é incerto,
 * então NÃO reenviamos automaticamente (evita mensagem duplicada para o cliente).
 */
create or replace function public.svc_release_stuck_outbound(p_older_than interval default interval '3 minutes') returns integer
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.messages set status = 'failed', failed_at = now(), locked_at = null, error_code = 'ambiguous',
    error_message = 'Envio não confirmado pela Meta. Confira a conversa antes de reenviar.'
  where status = 'sending' and locked_at < now() - p_older_than and external_id is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- svc: fila de webhooks
create or replace function public.svc_store_webhook(p_provider text, p_payload jsonb, p_hash text) returns bigint
language sql security definer set search_path = '' as $$
  with ins as (
    insert into public.webhook_events (provider, payload, payload_hash) values (p_provider, p_payload, p_hash)
    on conflict (payload_hash) do nothing returning id
  ) select id from ins;
$$;

create or replace function public.svc_claim_webhook_events(p_limit int default 20, p_id bigint default null) returns setof public.webhook_events
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with picked as (
    select e.id from public.webhook_events e
    where (p_id is null or e.id = p_id)
      and ((e.status in ('pending', 'failed') and e.next_attempt_at <= now() and e.attempts < 8)
           or (e.status = 'processing' and e.next_attempt_at < now() - interval '5 minutes'))
    order by e.id limit greatest(1, least(p_limit, 200))
    for update skip locked
  )
  update public.webhook_events e set status = 'processing', attempts = e.attempts + 1, next_attempt_at = now()
  from picked where e.id = picked.id returning e.*;
end $$;

create or replace function public.svc_finish_webhook_event(p_id bigint, p_ok boolean, p_error text default null) returns void
language sql security definer set search_path = '' as $$
  update public.webhook_events set
    status = case when p_ok then 'processed'::public.webhook_status else 'failed' end,
    processed_at = case when p_ok then now() end,
    last_error = case when p_ok then null else left(p_error, 2000) end,
    next_attempt_at = case when p_ok then next_attempt_at else now() + make_interval(mins => least(power(2, attempts)::int, 240)) end
  where id = p_id;
$$;

-- ---------------------------------------------------------------- svc: mídia recebida
create or replace function public.svc_claim_media(p_limit int default 10, p_id uuid default null) returns setof jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with picked as (
    select mm.id from public.message_media mm
    where mm.status = 'pending' and mm.attempts < 5 and (p_id is null or mm.id = p_id)
      and (mm.external_media_id is not null or mm.source_url is not null)
      and (p_id is not null or mm.attempts = 0 or mm.updated_at < now() - make_interval(mins => power(2, mm.attempts)::int))
    order by mm.created_at limit greatest(1, least(p_limit, 50))
    for update skip locked
  ), upd as (
    update public.message_media mm set attempts = mm.attempts + 1 from picked where mm.id = picked.id returning mm.*
  )
  select jsonb_build_object('id', u.id, 'kind', u.kind, 'mime_type', u.mime_type, 'file_name', u.file_name,
                            'external_media_id', u.external_media_id, 'source_url', u.source_url,
                            'message_id', u.message_id, 'conversation_id', m.conversation_id, 'channel_id', m.channel_id,
                            'channel_type', ch.type)
  from upd u join public.messages m on m.id = u.message_id join public.channels ch on ch.id = m.channel_id;
end $$;

create or replace function public.svc_media_result(p_media_id uuid, p_storage_path text default null, p_size bigint default null,
                                                   p_mime text default null, p_error text default null) returns void
language sql security definer set search_path = '' as $$
  update public.message_media set
    storage_path = coalesce(p_storage_path, storage_path), size_bytes = coalesce(p_size, size_bytes), mime_type = coalesce(p_mime, mime_type),
    status = case when p_storage_path is not null then 'stored'::public.media_status when attempts >= 5 then 'failed' else status end,
    last_error = p_error, source_url = case when p_storage_path is not null then null else source_url end
  where id = p_media_id;
$$;

-- ---------------------------------------------------------------- svc: modelos
create or replace function public.svc_upsert_template(p_channel_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.templates (channel_id, name, label, language, category, status, body, header, buttons, components, external_id, rejection_reason, synced_at)
  values (p_channel_id, p ->> 'name', coalesce(p ->> 'label', replace(initcap(replace(p ->> 'name', '_', ' ')), '_', ' ')),
          coalesce(p ->> 'language', 'pt_BR'), (p ->> 'category')::public.template_category, (p ->> 'status')::public.template_status,
          coalesce(p ->> 'body', ''), p -> 'header', coalesce(p -> 'buttons', '[]'), coalesce(p -> 'components', '[]'),
          p ->> 'external_id', p ->> 'rejection_reason', now())
  on conflict (channel_id, name, language) do update set
    category = excluded.category, status = excluded.status, body = excluded.body, buttons = excluded.buttons,
    -- o link da mídia do cabeçalho é configurado no CRM; a sincronização não o apaga
    header = case when public.templates.header ? 'link' then coalesce(excluded.header, '{}') || jsonb_build_object('link', public.templates.header -> 'link')
                  else excluded.header end,
    components = excluded.components, external_id = coalesce(excluded.external_id, public.templates.external_id),
    rejection_reason = excluded.rejection_reason, synced_at = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.svc_template_status(p_waba_id text, p_external_id text, p_name text, p_language text,
                                                      p_status public.template_status, p_reason text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.templates t set status = p_status, rejection_reason = p_reason, synced_at = now()
  from public.channels ch
  where ch.id = t.channel_id and ch.waba_id = p_waba_id
    and (t.external_id = p_external_id or (t.name = p_name and (p_language is null or t.language = p_language)));
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- grants
grant execute on function public.conversation_window(uuid), public.start_conversation(uuid, public.channel_type),
  public.enqueue_outbound_message(jsonb), public.admin_set_channel_token(uuid, text) to authenticated;

grant execute on function
  public.svc_channel_lookup(public.channel_type, text), public.svc_channel_token(uuid),
  public.svc_channel_health(uuid, public.channel_status, text, text, text),
  public.svc_ingest_message(uuid, jsonb), public.svc_message_deleted(uuid, text), public.svc_set_contact_profile(uuid, text, text),
  public.svc_record_status(uuid, text, public.message_status, timestamptz, jsonb, jsonb), public.svc_record_read(uuid, text, text, timestamptz),
  public.svc_claim_outbound(int, uuid), public.svc_complete_outbound(uuid, text, jsonb, timestamptz), public.svc_release_stuck_outbound(interval),
  public.svc_store_webhook(text, jsonb, text), public.svc_claim_webhook_events(int, bigint), public.svc_finish_webhook_event(bigint, boolean, text),
  public.svc_claim_media(int, uuid), public.svc_media_result(uuid, text, bigint, text, text),
  public.svc_upsert_template(uuid, jsonb), public.svc_template_status(text, text, text, text, public.template_status, text)
to service_role;
