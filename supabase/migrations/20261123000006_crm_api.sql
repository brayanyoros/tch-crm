-- =============================================================================
-- TCH CRM · 0006 · API do CRM (RPCs chamadas pelo frontend com o JWT do usuário)
-- =============================================================================
-- Todas: SECURITY DEFINER + search_path vazio + checagem explícita de permissão.
-- Mensagens de erro em português, prontas para o toast da tela.

-- ---------------------------------------------------------------- apoio
create or replace function private.active_owner(p_owner uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_owner is not null and not exists (select 1 from public.profiles where id = p_owner and active) then
    perform private.fail('Responsável inválido ou desativado.');
  end if;
  return p_owner;
end $$;

/** Lê o contato travando a linha e confere a permissão pedida ('view' ou 'reply'). */
create or replace function private.contact_for(p_id uuid, p_need text default 'view') returns public.contacts
language plpgsql security definer set search_path = '' as $$
declare c public.contacts;
begin
  select * into c from public.contacts where id = p_id for update;
  if not found or not private.can_view_owner(c.owner_id) then perform private.fail('Contato não encontrado.'); end if;
  if p_need = 'reply' and not private.can_reply_owner(c.owner_id) then
    perform private.fail('Você não tem permissão para esta ação.', '42501');
  end if;
  return c;
end $$;

create or replace function private.deal_for(p_id uuid, p_need text default 'reply') returns public.deals
language plpgsql security definer set search_path = '' as $$
declare d public.deals;
begin
  select * into d from public.deals where id = p_id for update;
  if not found or not private.can_view_owner(d.owner_id) then perform private.fail('Negócio não encontrado.'); end if;
  if p_need = 'reply' and not private.can_reply_owner(d.owner_id) then
    perform private.fail('Você não tem permissão para esta ação.', '42501');
  end if;
  return d;
end $$;

create or replace function private.deal_log(p_deal uuid, p_text text, p_data jsonb default '{}') returns void
language sql security definer set search_path = '' as $$
  insert into public.deal_history (deal_id, author_id, text, data) values (p_deal, auth.uid(), p_text, coalesce(p_data, '{}'));
$$;

/** Valida e normaliza o identificador do canal. Devolve (phone, instagram_username). */
create or replace function private.parse_handle(p_channel public.channel_type, p_handle text, out phone text, out username text)
language plpgsql immutable as $$
begin
  if p_channel = 'whatsapp' then
    phone := private.normalize_phone(p_handle);
    if phone is null then perform private.fail('Telefone inválido. Use DDD e número, ex.: (21) 99999-0000.'); end if;
  else
    username := lower(ltrim(btrim(coalesce(p_handle, '')), '@'));
    if username !~ '^[a-z0-9._]{1,30}$' then perform private.fail('Usuário do Instagram inválido.'); end if;
  end if;
end $$;

create or replace function private.find_contact_by_phone(p_phone text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.contacts
  where phone = any (private.phone_variants(p_phone)) or wa_id = any (select ltrim(v, '+') from unnest(private.phone_variants(p_phone)) v)
  limit 1;
$$;

-- ---------------------------------------------------------------- contatos
create or replace function public.create_contact(
  p_name text, p_channel public.channel_type, p_handle text, p_city text default '', p_email text default null, p_owner_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_member(); h record; v_owner uuid; v_id uuid;
begin
  h := private.parse_handle(p_channel, p_handle);
  v_owner := case when private.is_manager() then private.active_owner(p_owner_id) else uid end;
  if h.phone is not null and private.find_contact_by_phone(h.phone) is not null then
    perform private.fail('Já existe um contato com este telefone.');
  end if;
  if h.username is not null and exists (select 1 from public.contacts where lower(instagram_username) = h.username) then
    perform private.fail('Já existe um contato com este Instagram.');
  end if;
  insert into public.contacts (name, phone, instagram_username, email, city, owner_id, origin, created_by)
  values (btrim(p_name), h.phone, h.username, nullif(lower(btrim(p_email)), ''), coalesce(btrim(p_city), ''), v_owner, 'Showroom', uid)
  returning id into v_id;
  return v_id;
exception when check_violation then
  perform private.fail('Dados do contato inválidos. Confira nome, e-mail e cidade.');
end $$;

/** Importação em lote; ignora duplicados (mesmo telefone/Instagram) e linhas inválidas. */
create or replace function public.import_contacts(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_member(); r jsonb; added int := 0; skipped int := 0; invalid int := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then perform private.fail('Arquivo inválido.'); end if;
  if jsonb_array_length(p_rows) > 5000 then perform private.fail('Importe no máximo 5.000 contatos por vez.'); end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      perform public.create_contact(r ->> 'name', (r ->> 'channel')::public.channel_type, r ->> 'handle', coalesce(r ->> 'city', ''), r ->> 'email',
                                    case when private.is_manager() then null else uid end);
      added := added + 1;
    exception
      when raise_exception then
        if sqlerrm like 'Já existe%' then skipped := skipped + 1; else invalid := invalid + 1; end if;
      when others then invalid := invalid + 1;
    end;
  end loop;
  return jsonb_build_object('added', added, 'skipped', skipped + invalid, 'invalid', invalid);
end $$;

create or replace function public.update_contact(p_id uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.contacts; v_phone text; v_user text;
begin
  perform private.require_member();
  c := private.contact_for(p_id, 'view');
  if p_patch ? 'phone' then
    v_phone := case when nullif(btrim(p_patch ->> 'phone'), '') is null then null else (private.parse_handle('whatsapp', p_patch ->> 'phone')).phone end;
    if v_phone is not null and exists (select 1 from public.contacts where id <> p_id and phone = any (private.phone_variants(v_phone))) then
      perform private.fail('Já existe um contato com este telefone.');
    end if;
  end if;
  if p_patch ? 'instagram' then
    v_user := case when nullif(btrim(p_patch ->> 'instagram'), '') is null then null else (private.parse_handle('instagram', p_patch ->> 'instagram')).username end;
  end if;
  update public.contacts set
    name  = case when p_patch ? 'name' then btrim(p_patch ->> 'name') else name end,
    city  = case when p_patch ? 'city' then coalesce(btrim(p_patch ->> 'city'), '') else city end,
    email = case when p_patch ? 'email' then nullif(lower(btrim(p_patch ->> 'email')), '') else email end,
    phone = case when p_patch ? 'phone' then v_phone else phone end,
    instagram_username = case when p_patch ? 'instagram' then v_user else instagram_username end
  where id = p_id;
exception
  when unique_violation then perform private.fail('Já existe um contato com este telefone ou Instagram.');
  when check_violation then perform private.fail('Dados do contato inválidos.');
end $$;

/** Define as tags do contato; devolve as que foram adicionadas (gatilho de automação). */
create or replace function public.set_contact_tags(p_id uuid, p_tag_ids uuid[]) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_member(); added uuid[];
begin
  perform private.contact_for(p_id, 'view');
  delete from public.contact_tags where contact_id = p_id and tag_id <> all (coalesce(p_tag_ids, '{}'));
  with ins as (
    insert into public.contact_tags (contact_id, tag_id, created_by)
    select p_id, t.id, uid from public.tags t where t.id = any (coalesce(p_tag_ids, '{}'))
    on conflict do nothing returning tag_id
  ) select coalesce(array_agg(tag_id), '{}') into added from ins;
  return added;
end $$;

create or replace function public.add_tag_to_contacts(p_ids uuid[], p_tag_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_member(); cid uuid; n int := 0;
begin
  if not exists (select 1 from public.tags where id = p_tag_id) then perform private.fail('Tag não encontrada.'); end if;
  foreach cid in array coalesce(p_ids, '{}') loop
    perform private.contact_for(cid, 'view');
    insert into public.contact_tags (contact_id, tag_id, created_by) values (cid, p_tag_id, uid) on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function public.add_to_list(p_ids uuid[], p_list text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_member(); v_list uuid; cid uuid;
begin
  if char_length(btrim(coalesce(p_list, ''))) not between 1 and 80 then perform private.fail('Dê um nome à lista.'); end if;
  select id into v_list from public.contact_lists where lower(btrim(name)) = lower(btrim(p_list));
  if v_list is null then insert into public.contact_lists (name) values (btrim(p_list)) returning id into v_list; end if;
  foreach cid in array coalesce(p_ids, '{}') loop
    perform private.contact_for(cid, 'view');
    insert into public.contact_list_members (list_id, contact_id, added_by) values (v_list, cid, uid) on conflict do nothing;
  end loop;
end $$;

/** Transfere o lead inteiro: contato e negócios abertos (gestor/admin). */
create or replace function public.assign_contacts(p_ids uuid[], p_owner_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid; d record; v_name text;
begin
  perform private.require_manager();
  perform private.active_owner(p_owner_id);
  select name into v_name from public.profiles where id = p_owner_id;
  foreach cid in array coalesce(p_ids, '{}') loop
    perform private.contact_for(cid, 'view');
    update public.contacts set owner_id = p_owner_id where id = cid;
    for d in update public.deals set owner_id = p_owner_id where contact_id = cid and status = 'aberto' returning id loop
      perform private.deal_log(d.id, 'Transferido para ' || coalesce(v_name, 'sem responsável'), jsonb_build_object('owner_id', p_owner_id));
    end loop;
  end loop;
end $$;

/** Vendedor assume um lead sem responsável (com trava para dois cliques simultâneos). */
create or replace function public.claim_contact(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_member(); c public.contacts;
begin
  c := private.contact_for(p_id, 'view');
  if c.owner_id is not null then perform private.fail('Este lead já tem responsável.'); end if;
  update public.contacts set owner_id = uid where id = p_id;
  update public.deals set owner_id = uid where contact_id = p_id and owner_id is null;
end $$;

create or replace function public.set_consent(p_id uuid, p_status public.consent_status, p_origin text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_member();
begin
  perform private.contact_for(p_id, 'view');
  if char_length(btrim(coalesce(p_origin, ''))) = 0 then perform private.fail('Informe a origem do consentimento.'); end if;
  update public.contacts set consent_status = p_status, consent_at = now(), consent_origin = btrim(p_origin) where id = p_id;
  insert into public.consent_events (contact_id, status, origin, actor_id) values (p_id, p_status, btrim(p_origin), uid);
end $$;

/** Mantém p_keep e move tudo de p_other para ele. O pedido de saída sempre prevalece. */
create or replace function public.merge_contacts(p_keep uuid, p_other uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.contacts; b public.contacts; vb record; va uuid;
begin
  perform private.require_member();
  if p_keep = p_other then perform private.fail('Escolha dois contatos diferentes.'); end if;
  a := private.contact_for(p_keep, 'view');
  b := private.contact_for(p_other, 'view');

  update public.deals set contact_id = p_keep where contact_id = p_other;
  update public.tasks set contact_id = p_keep where contact_id = p_other;
  update public.consent_events set contact_id = p_keep where contact_id = p_other;
  update public.campaign_recipients r set contact_id = p_keep where contact_id = p_other
    and not exists (select 1 from public.campaign_recipients x where x.campaign_id = r.campaign_id and x.contact_id = p_keep);
  insert into public.contact_tags (contact_id, tag_id, created_by) select p_keep, tag_id, created_by from public.contact_tags where contact_id = p_other on conflict do nothing;
  insert into public.contact_list_members (list_id, contact_id, added_by) select list_id, p_keep, added_by from public.contact_list_members where contact_id = p_other on conflict do nothing;

  for vb in select * from public.conversations where contact_id = p_other loop
    select id into va from public.conversations where contact_id = p_keep and channel_id = vb.channel_id;
    if va is null then
      update public.conversations set contact_id = p_keep where id = vb.id;
    else
      update public.messages set conversation_id = va where conversation_id = vb.id;
      update public.conversations c set
        unread = c.unread + vb.unread,
        last_inbound_at = greatest(c.last_inbound_at, vb.last_inbound_at),
        awaiting_since = least(c.awaiting_since, vb.awaiting_since),
        last_message_at = greatest(c.last_message_at, vb.last_message_at),
        last_message_preview = case when vb.last_message_at > c.last_message_at then vb.last_message_preview else c.last_message_preview end,
        closed = c.closed and vb.closed
      where c.id = va;
      delete from public.conversations where id = vb.id;
    end if;
  end loop;

  -- libera os identificadores únicos antes de copiá-los
  update public.contacts set phone = null, wa_id = null, instagram_id = null, instagram_username = null where id = p_other;
  update public.contacts set
    phone = coalesce(a.phone, b.phone), wa_id = coalesce(a.wa_id, b.wa_id),
    instagram_id = coalesce(a.instagram_id, b.instagram_id), instagram_username = coalesce(a.instagram_username, b.instagram_username),
    email = coalesce(a.email, b.email), owner_id = coalesce(a.owner_id, b.owner_id), city = coalesce(nullif(a.city, ''), b.city),
    origin = coalesce(a.origin, b.origin), ad_ref = coalesce(a.ad_ref, b.ad_ref),
    last_contact_at = greatest(a.last_contact_at, b.last_contact_at),
    consent_status = case when b.consent_status = 'saiu' or (a.consent_status = 'sem' and b.consent_status = 'autorizado') then b.consent_status else a.consent_status end,
    consent_at = case when b.consent_status = 'saiu' or (a.consent_status = 'sem' and b.consent_status = 'autorizado') then b.consent_at else a.consent_at end,
    consent_origin = case when b.consent_status = 'saiu' or (a.consent_status = 'sem' and b.consent_status = 'autorizado') then b.consent_origin else a.consent_origin end
  where id = p_keep;
  delete from public.contacts where id = p_other;
  perform private.audit('merge', 'contact', p_keep::text, jsonb_build_object('merged', p_other));
end $$;

/** Arquivos de mídia ligados a um contato (para apagar do Storage junto). */
create or replace function private.contact_media_paths(p_contact uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(mm.storage_path), '{}') from public.message_media mm
  join public.messages m on m.id = mm.message_id join public.conversations v on v.id = m.conversation_id
  where v.contact_id = p_contact and mm.storage_path is not null;
$$;

/** Exclui o contato e tudo dele (admin). Devolve os caminhos de mídia a remover do Storage. */
create or replace function public.delete_contact(p_id uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare paths text[];
begin
  perform private.require_admin();
  perform private.contact_for(p_id, 'view');
  paths := private.contact_media_paths(p_id);
  delete from public.tasks where contact_id = p_id;
  delete from public.contacts where id = p_id;
  perform private.audit('delete', 'contact', p_id::text);
  return paths;
end $$;

-- ---------------------------------------------------------------- negócios
create or replace function private.stage_index(p_stage uuid) returns int
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.pipeline_stages s2 where s2.position < s.position)::int from public.pipeline_stages s where s.id = p_stage;
$$;

create or replace function private.won_stage() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.pipeline_stages order by position desc limit 1;
$$;

create or replace function public.create_deal(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_member(); v_owner uuid; v_contact uuid := nullif(p ->> 'contact_id', '')::uuid;
  c public.contacts; v_product public.products; v_stage uuid := (p ->> 'stage_id')::uuid; v_idx int; v_won boolean; v_id uuid;
  v_tag uuid := nullif(p ->> 'tag_id', '')::uuid; v_value numeric := coalesce((p ->> 'value')::numeric, 0);
begin
  v_owner := case when private.is_manager() then private.active_owner(nullif(p ->> 'owner_id', '')::uuid) else uid end;
  select * into v_product from public.products where id = (p ->> 'product_id')::uuid;
  if not found then perform private.fail('Escolha um produto.'); end if;
  v_idx := private.stage_index(v_stage);
  if v_idx is null then perform private.fail('Etapa não encontrada.'); end if;
  if v_value < 0 then perform private.fail('Valor inválido.'); end if;
  if v_contact is null then
    if p -> 'new_contact' is null then perform private.fail('Escolha ou cadastre o contato.'); end if;
    v_contact := public.create_contact(p -> 'new_contact' ->> 'name', (p -> 'new_contact' ->> 'channel')::public.channel_type,
                                       p -> 'new_contact' ->> 'handle', coalesce(p -> 'new_contact' ->> 'city', ''), null, v_owner);
  end if;
  c := private.contact_for(v_contact, 'view');
  if c.owner_id is null then update public.contacts set owner_id = v_owner where id = c.id; end if;
  if v_tag is not null then
    insert into public.contact_tags (contact_id, tag_id, created_by) select c.id, t.id, uid from public.tags t where t.id = v_tag on conflict do nothing;
  end if;
  v_won := v_stage = private.won_stage();
  insert into public.deals (contact_id, product_id, title, channel, value, owner_id, stage_id, status, reached, origin, ad_name, closed_at, created_by)
  values (c.id, v_product.id, v_product.name, coalesce(c.channels[1], 'whatsapp'), v_value, v_owner, v_stage,
          case when v_won then 'ganho'::public.deal_status else 'aberto' end, v_idx, coalesce(c.origin, 'Showroom'),
          c.ad_ref ->> 'headline', case when v_won then now() end, uid)
  returning id into v_id;
  perform private.deal_log(v_id, 'Negócio criado');
  return v_id;
end $$;

create or replace function public.move_deal(p_id uuid, p_stage_id uuid, p_final_value numeric default null) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.deals; v_from text; v_to text; v_idx int; v_won boolean;
begin
  perform private.require_member();
  d := private.deal_for(p_id, 'reply');
  v_idx := private.stage_index(p_stage_id);
  if v_idx is null then perform private.fail('Etapa não encontrada.'); end if;
  if p_final_value is not null and p_final_value < 0 then perform private.fail('Valor inválido.'); end if;
  v_won := p_stage_id = private.won_stage();
  select name into v_from from public.pipeline_stages where id = d.stage_id;
  select name into v_to from public.pipeline_stages where id = p_stage_id;
  update public.deals set stage_id = p_stage_id, reached = greatest(reached, v_idx),
    status = case when v_won then 'ganho'::public.deal_status else 'aberto' end,
    closed_at = case when v_won then now() end, lost_reason = null, value = coalesce(p_final_value, value)
  where id = p_id;
  perform private.deal_log(p_id, format('Etapa: %s → %s', coalesce(v_from, '?'), v_to), jsonb_build_object('from', d.stage_id, 'to', p_stage_id));
end $$;

create or replace function public.lose_deal(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member();
  perform private.deal_for(p_id, 'reply');
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then perform private.fail('Informe o motivo da perda.'); end if;
  update public.deals set status = 'perdido', lost_reason = btrim(p_reason), closed_at = now() where id = p_id;
  perform private.deal_log(p_id, 'Marcado como perdido: ' || btrim(p_reason));
end $$;

create or replace function public.set_expected_close(p_id uuid, p_date date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member();
  perform private.deal_for(p_id, 'reply');
  update public.deals set expected_close_at = p_date where id = p_id;
  perform private.deal_log(p_id, case when p_date is null then 'Previsão de fechamento removida'
                                       else 'Previsão de fechamento: ' || to_char(p_date, 'DD/MM/YYYY') end);
end $$;

create or replace function public.add_deal_note(p_id uuid, p_text text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_member(); v_id uuid;
begin
  perform private.deal_for(p_id, 'view');
  insert into public.deal_notes (deal_id, author_id, text) values (p_id, uid, btrim(p_text)) returning id into v_id;
  return v_id;
exception when check_violation then perform private.fail('Escreva a nota (até 5.000 caracteres).');
end $$;

create or replace function public.delete_deal(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  perform private.deal_for(p_id, 'view');
  delete from public.deals where id = p_id;
  perform private.audit('delete', 'deal', p_id::text);
end $$;

/** Reordena/renomeia as etapas. A última é sempre a de ganho. */
create or replace function public.save_stages(p_stages jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare r record; v_ids uuid[] := '{}'; v_id uuid; v_first uuid; v_last uuid; n int;
begin
  perform private.require_manager();
  n := jsonb_array_length(p_stages);
  if n < 2 then perform private.fail('O funil precisa de pelo menos duas etapas.'); end if;
  for r in select e.value as s, e.ordinality - 1 as pos from jsonb_array_elements(p_stages) with ordinality e loop
    if char_length(btrim(coalesce(r.s ->> 'name', ''))) = 0 then perform private.fail('Dê um nome a cada etapa.'); end if;
    v_id := nullif(r.s ->> 'id', '')::uuid;
    if v_id is not null and exists (select 1 from public.pipeline_stages where id = v_id) then
      update public.pipeline_stages set name = btrim(r.s ->> 'name'), position = r.pos + 1000, chance = coalesce((r.s ->> 'chance')::int, chance) where id = v_id;
    else
      insert into public.pipeline_stages (name, position, chance) values (btrim(r.s ->> 'name'), r.pos + 1000, coalesce((r.s ->> 'chance')::int, 0)) returning id into v_id;
    end if;
    v_ids := v_ids || v_id;
  end loop;
  if exists (select 1 from public.deals where status = 'aberto' and stage_id <> all (v_ids)) then
    perform private.fail('Mova os negócios desta etapa antes de excluí-la.');
  end if;
  v_first := v_ids[1]; v_last := v_ids[n];
  update public.deals set stage_id = v_last where status = 'ganho' and stage_id <> v_last;
  update public.deals set stage_id = v_first where status = 'perdido' and stage_id <> all (v_ids);
  delete from public.pipeline_stages where id <> all (v_ids);
  update public.pipeline_stages set position = position - 1000;
  update public.deals d set reached = least(greatest(d.reached, 0), n - 1);
  update public.deals d set reached = greatest(d.reached, private.stage_index(d.stage_id)) where d.status <> 'perdido';
exception when unique_violation then perform private.fail('Há duas etapas com o mesmo nome.');
end $$;

-- ---------------------------------------------------------------- preferências e equipe
create or replace function public.update_settings(p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_manager(); k text; v_members uuid[];
begin
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('hours', 'offMessage', 'limits', 'goalsByMonth', 'priorityOrder', 'costs', 'distribution', 'lossReasons', 'optOutKeywords') then
      perform private.fail('Preferência desconhecida: ' || k);
    end if;
  end loop;
  if p_patch ? 'limits' and coalesce((p_patch -> 'limits' ->> 'windowH')::int, 24) not between 1 and 24 then
    perform private.fail('A janela de atendimento da Meta é de no máximo 24 horas.');
  end if;
  if p_patch ? 'distribution' then
    select coalesce(array_agg(x::uuid), '{}') into v_members from jsonb_array_elements_text(coalesce(p_patch -> 'distribution' -> 'members', '[]')) x;
    if exists (select 1 from unnest(v_members) m where not exists (select 1 from public.profiles p where p.id = m and p.active)) then
      perform private.fail('O rodízio tem pessoas inválidas ou desativadas.');
    end if;
    if coalesce(p_patch -> 'distribution' ->> 'mode', '') not in ('rodizio', 'livre') then perform private.fail('Modo de distribuição inválido.'); end if;
  end if;
  update public.app_settings set
    hours          = coalesce(p_patch -> 'hours', hours),
    off_message    = coalesce(p_patch ->> 'offMessage', off_message),
    limits         = coalesce(p_patch -> 'limits', limits),
    goals_by_month = coalesce(p_patch -> 'goalsByMonth', goals_by_month),
    priority_order = coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch -> 'priorityOrder') x), priority_order),
    costs          = coalesce(p_patch -> 'costs', costs),
    distribution   = coalesce(p_patch -> 'distribution', distribution),
    loss_reasons   = coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch -> 'lossReasons') x), loss_reasons),
    opt_out_keywords = coalesce((select array_agg(private.normalize_text(x)) from jsonb_array_elements_text(p_patch -> 'optOutKeywords') x), opt_out_keywords),
    updated_by = uid
  where id;
  perform private.audit('update', 'settings', null, p_patch);
end $$;

/**
 * Instagram: responder entre 24 h e 7 dias exige a tag HUMAN_AGENT, que depende de
 * aprovação da permissão "Human Agent" no app da Meta. Só ligar depois de aprovada.
 */
alter table public.app_settings add column instagram_human_agent boolean not null default false;
create or replace function public.set_instagram_human_agent(p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.app_settings set instagram_human_agent = p_enabled, updated_by = auth.uid() where id;
  perform private.audit('update', 'settings', null, jsonb_build_object('instagram_human_agent', p_enabled));
end $$;

/** Papel e acesso de outra pessoa (admin). Desativar corta o acesso na hora (RLS). */
create or replace function public.admin_update_user(p_user_id uuid, p_role public.app_role default null, p_active boolean default null) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_admin();
begin
  if p_user_id = uid then perform private.fail('Você não pode alterar o próprio acesso.'); end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then perform private.fail('Pessoa não encontrada.'); end if;
  -- Os leads continuam com a pessoa desativada até um gestor transferi-los (assign_contacts).
  update public.profiles set role = coalesce(p_role, role), active = coalesce(p_active, active) where id = p_user_id;
  perform private.audit('update', 'profile', p_user_id::text, jsonb_build_object('role', p_role, 'active', p_active));
end $$;

create or replace function public.tag_usage() returns table (tag_id uuid, contacts bigint)
language sql stable security definer set search_path = '' as $$
  select t.id, count(ct.contact_id) from public.tags t left join public.contact_tags ct on ct.tag_id = t.id
  where private.is_member() group by t.id;
$$;

-- ---------------------------------------------------------------- conversas
create or replace function private.conversation_for(p_id uuid, p_need text default 'view') returns public.conversations
language plpgsql security definer set search_path = '' as $$
declare v public.conversations; c public.contacts;
begin
  select * into v from public.conversations where id = p_id for update;
  if not found then perform private.fail('Conversa não encontrada.'); end if;
  select * into c from public.contacts where id = v.contact_id;
  if not private.can_view_owner(c.owner_id) then perform private.fail('Conversa não encontrada.'); end if;
  if p_need = 'reply' and not private.can_reply_owner(c.owner_id) then
    perform private.fail('Você não tem permissão para responder este lead.', '42501');
  end if;
  return v;
end $$;

create or replace function public.mark_conversation_read(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member();
  perform private.conversation_for(p_id, 'view');
  update public.conversations set unread = 0 where id = p_id and unread <> 0;
end $$;

create or replace function public.mark_conversation_unread(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member();
  perform private.conversation_for(p_id, 'view');
  update public.conversations set unread = greatest(unread, 1) where id = p_id;
end $$;

create or replace function public.set_conversation_closed(p_id uuid, p_closed boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_member();
  perform private.conversation_for(p_id, 'reply');
  update public.conversations set closed = p_closed, unread = 0 where id = p_id;
end $$;

create or replace function public.delete_conversation(p_id uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare paths text[];
begin
  perform private.require_admin();
  perform private.conversation_for(p_id, 'view');
  select coalesce(array_agg(mm.storage_path), '{}') into paths from public.message_media mm join public.messages m on m.id = mm.message_id
  where m.conversation_id = p_id and mm.storage_path is not null;
  delete from public.conversations where id = p_id;
  perform private.audit('delete', 'conversation', p_id::text);
  return paths;
end $$;

create or replace function public.add_internal_note(p_conversation_id uuid, p_text text, p_client_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_member(); v public.conversations; v_id uuid;
begin
  if p_client_id is not null then
    select id into v_id from public.messages where client_id = p_client_id and author_id = uid;
    if v_id is not null then return v_id; end if;
  end if;
  v := private.conversation_for(p_conversation_id, 'view');
  if char_length(btrim(coalesce(p_text, ''))) not between 1 and 4096 then perform private.fail('Escreva a nota (até 4.096 caracteres).'); end if;
  insert into public.messages (conversation_id, channel_id, kind, author_id, type, body, status, client_id)
  values (v.id, v.channel_id, 'nota', uid, 'text', btrim(p_text), null, p_client_id) returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- grants
grant execute on function
  public.create_contact(text, public.channel_type, text, text, text, uuid), public.import_contacts(jsonb), public.update_contact(uuid, jsonb),
  public.set_contact_tags(uuid, uuid[]), public.add_tag_to_contacts(uuid[], uuid), public.add_to_list(uuid[], text),
  public.assign_contacts(uuid[], uuid), public.claim_contact(uuid), public.set_consent(uuid, public.consent_status, text),
  public.merge_contacts(uuid, uuid), public.delete_contact(uuid),
  public.create_deal(jsonb), public.move_deal(uuid, uuid, numeric), public.lose_deal(uuid, text), public.set_expected_close(uuid, date),
  public.add_deal_note(uuid, text), public.delete_deal(uuid), public.save_stages(jsonb),
  public.update_settings(jsonb), public.set_instagram_human_agent(boolean), public.admin_update_user(uuid, public.app_role, boolean), public.tag_usage(),
  public.mark_conversation_read(uuid), public.mark_conversation_unread(uuid), public.set_conversation_closed(uuid, boolean),
  public.delete_conversation(uuid), public.add_internal_note(uuid, text, uuid)
to authenticated;
