-- =============================================================================
-- TCH CRM · 0005 · Permissões: funções de apoio, RLS e GRANTs
-- =============================================================================
-- Regras (espelham lib/permissions.ts do frontend):
--   vendedor: vê leads próprios e sem responsável; responde só os próprios; vê só as próprias tarefas.
--   gestor:   vê e responde todos; gerencia funil, cadastros, automações, campanhas e preferências.
--   admin:    tudo do gestor + equipe, canais, exclusão de leads e LGPD.
-- Usuário desativado (profiles.active = false) perde todo acesso imediatamente.
-- Escritas sensíveis passam por funções (RPC) que validam e registram histórico;
-- o papel authenticated só escreve direto onde a RLS basta.

-- ---------------------------------------------------------------- funções de apoio
create or replace function private.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active;
$$;

create or replace function private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.my_role() is not null;
$$;

create or replace function private.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() in ('gestor', 'admin'), false);
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() = 'admin', false);
$$;

/** Ver um lead: gestor/admin, o responsável, ou lead ainda sem responsável. */
create or replace function private.can_view_owner(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_member() and (private.is_manager() or owner is null or owner = auth.uid());
$$;

/** Responder/editar um lead: gestor/admin ou o responsável. */
create or replace function private.can_reply_owner(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_member() and (private.is_manager() or owner = auth.uid());
$$;

create or replace function private.can_view_contact(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.contacts c where c.id = cid and private.can_view_owner(c.owner_id));
$$;

create or replace function private.can_view_conversation(conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversations v join public.contacts c on c.id = v.contact_id
                 where v.id = conv and private.can_view_owner(c.owner_id));
$$;

create or replace function private.can_view_deal(did uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.deals d where d.id = did and private.can_view_owner(d.owner_id));
$$;

create or replace function private.require_member() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member() then perform private.fail('Sessão encerrada.', '42501'); end if;
  return auth.uid();
end $$;

create or replace function private.require_manager() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_manager() then perform private.fail('Você não tem permissão para esta ação.', '42501'); end if;
  return auth.uid();
end $$;

create or replace function private.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then perform private.fail('Você não tem permissão para esta ação.', '42501'); end if;
  return auth.uid();
end $$;

create or replace function private.audit(p_action text, p_entity text, p_entity_id text, p_data jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, data) values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_data, '{}'));
$$;

grant execute on function
  private.my_role(), private.is_member(), private.is_manager(), private.is_admin(),
  private.can_view_owner(uuid), private.can_reply_owner(uuid), private.can_view_contact(uuid),
  private.can_view_conversation(uuid), private.can_view_deal(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------- RLS ligada em tudo
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'tags', 'products', 'pipeline_stages', 'quick_replies', 'app_settings', 'channels',
    'contacts', 'contact_tags', 'contact_lists', 'contact_list_members', 'consent_events',
    'deals', 'deal_notes', 'deal_history', 'tasks', 'notifications',
    'templates', 'conversations', 'messages', 'message_media', 'message_status_events', 'webhook_events',
    'automations', 'automation_runs', 'saved_audiences', 'campaigns', 'campaign_recipients',
    'audit_log', 'data_requests'
  ] loop
    -- sem FORCE: funções SECURITY DEFINER (dono = postgres) aplicam as próprias regras.
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- equipe
grant select on public.profiles to authenticated;
grant update (name, title, photo_url, notify) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated using (private.is_member());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() and private.is_member()) with check (id = auth.uid());

-- ---------------------------------------------------------------- cadastros
grant select, insert (name, color), update (name, color), delete on public.tags to authenticated;
create policy tags_select on public.tags for select to authenticated using (private.is_member());
create policy tags_insert on public.tags for insert to authenticated with check (private.is_member());
create policy tags_update on public.tags for update to authenticated using (private.is_member()) with check (private.is_member());
create policy tags_delete on public.tags for delete to authenticated using (private.is_manager());

grant select, insert (name, category, price, active), update (name, category, price, active), delete on public.products to authenticated;
create policy products_select on public.products for select to authenticated using (private.is_member());
create policy products_write on public.products for insert to authenticated with check (private.is_manager());
create policy products_update on public.products for update to authenticated using (private.is_manager()) with check (private.is_manager());
create policy products_delete on public.products for delete to authenticated using (private.is_manager());

grant select on public.pipeline_stages to authenticated;
create policy stages_select on public.pipeline_stages for select to authenticated using (private.is_member());

grant select, insert (shortcut, text, audience), update (shortcut, text, audience), delete on public.quick_replies to authenticated;
create policy quick_replies_select on public.quick_replies for select to authenticated
  using (private.is_member() and (audience = 'todos' or private.is_manager()));
create policy quick_replies_insert on public.quick_replies for insert to authenticated with check (private.is_manager());
create policy quick_replies_update on public.quick_replies for update to authenticated using (private.is_manager()) with check (private.is_manager());
create policy quick_replies_delete on public.quick_replies for delete to authenticated using (private.is_manager());

grant select on public.app_settings to authenticated;
create policy settings_select on public.app_settings for select to authenticated using (private.is_member());

-- Canais: o id do segredo nunca sai para o cliente.
grant select (id, type, name, handle, status, quality, messaging_limit, phone_number_id, waba_id, ig_user_id, page_id, ig_api, last_error, created_at, updated_at)
  on public.channels to authenticated;
grant insert (type, name, handle, status, phone_number_id, waba_id, ig_user_id, page_id, ig_api),
      update (name, handle, status, phone_number_id, waba_id, ig_user_id, page_id, ig_api), delete
  on public.channels to authenticated;
create policy channels_select on public.channels for select to authenticated using (private.is_member());
create policy channels_insert on public.channels for insert to authenticated with check (private.is_admin());
create policy channels_update on public.channels for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy channels_delete on public.channels for delete to authenticated using (private.is_admin());

grant select on public.templates to authenticated;
create policy templates_select on public.templates for select to authenticated using (private.is_member());

-- ---------------------------------------------------------------- contatos (escrita só por RPC)
grant select on public.contacts, public.contact_tags, public.contact_lists, public.contact_list_members, public.consent_events to authenticated;
create policy contacts_select on public.contacts for select to authenticated using (private.can_view_owner(owner_id));
create policy contact_tags_select on public.contact_tags for select to authenticated using (private.can_view_contact(contact_id));
create policy contact_lists_select on public.contact_lists for select to authenticated using (private.is_member());
create policy contact_list_members_select on public.contact_list_members for select to authenticated using (private.can_view_contact(contact_id));
create policy consent_events_select on public.consent_events for select to authenticated using (private.can_view_contact(contact_id));

-- ---------------------------------------------------------------- negócios (escrita só por RPC)
grant select on public.deals, public.deal_notes, public.deal_history to authenticated;
create policy deals_select on public.deals for select to authenticated using (private.can_view_owner(owner_id));
create policy deal_notes_select on public.deal_notes for select to authenticated using (private.can_view_deal(deal_id));
create policy deal_history_select on public.deal_history for select to authenticated using (private.can_view_deal(deal_id));

-- ---------------------------------------------------------------- tarefas
grant select, insert (title, type, deal_id, contact_id, due_at, owner_id, done_at),
      update (title, type, deal_id, contact_id, due_at, owner_id, done_at), delete
  on public.tasks to authenticated;
create policy tasks_select on public.tasks for select to authenticated
  using (private.is_member() and (private.is_manager() or owner_id = auth.uid()));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (private.is_member() and (private.is_manager() or owner_id = auth.uid()));
create policy tasks_update on public.tasks for update to authenticated
  using (private.is_member() and (private.is_manager() or owner_id = auth.uid()))
  with check (private.is_manager() or owner_id = auth.uid());
create policy tasks_delete on public.tasks for delete to authenticated
  using (private.is_member() and (private.is_manager() or owner_id = auth.uid()));

/** Tarefa só aponta para negócio/contato que a pessoa enxerga; contato herda do negócio. */
create or replace function private.tasks_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if; -- service_role / jobs internos
  if new.deal_id is not null then
    if not private.can_view_deal(new.deal_id) then perform private.fail('Negócio não encontrado.'); end if;
    if new.contact_id is null then select d.contact_id into new.contact_id from public.deals d where d.id = new.deal_id; end if;
  end if;
  if new.contact_id is not null and not private.can_view_contact(new.contact_id) then perform private.fail('Contato não encontrado.'); end if;
  if not exists (select 1 from public.profiles p where p.id = new.owner_id and p.active) then perform private.fail('Responsável inválido.'); end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif new.due_at is distinct from old.due_at then
    new.reminded_at := null; new.overdue_notified_at := null; -- novo prazo, novo lembrete
  end if;
  return new;
end $$;
create trigger tasks_guard before insert or update on public.tasks for each row execute function private.tasks_guard();

-- ---------------------------------------------------------------- notificações
grant select, update (read_at), delete on public.notifications to authenticated;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- conversas e mensagens (escrita por RPC / Edge Function)
grant select on public.conversations, public.messages, public.message_media to authenticated;
create policy conversations_select on public.conversations for select to authenticated using (private.can_view_contact(contact_id));
create policy messages_select on public.messages for select to authenticated using (private.can_view_conversation(conversation_id));
create policy message_media_select on public.message_media for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and private.can_view_conversation(m.conversation_id)));

-- webhook_events e message_status_events: só service_role (nenhuma policy para authenticated),
-- exceto leitura de diagnóstico para admin.
grant select on public.webhook_events to authenticated;
create policy webhook_events_admin on public.webhook_events for select to authenticated using (private.is_admin());

-- ---------------------------------------------------------------- automações e campanhas (gestor+)
grant select, insert (name, status, draft, published, version, activated_at, saved_at),
      update (name, status, draft, published, version, activated_at, saved_at), delete
  on public.automations to authenticated;
create policy automations_all on public.automations for all to authenticated using (private.is_manager()) with check (private.is_manager());

grant select, insert (automation_id, contact_id, contact_name, actions, failure, version) on public.automation_runs to authenticated;
create policy automation_runs_select on public.automation_runs for select to authenticated using (private.is_manager());
create policy automation_runs_insert on public.automation_runs for insert to authenticated with check (private.is_manager());

grant select, insert (name, audience), update (name, audience, updated_at), delete on public.saved_audiences to authenticated;
create policy saved_audiences_all on public.saved_audiences for all to authenticated using (private.is_manager()) with check (private.is_manager());

-- Rascunhos são editados direto; confirmar/pausar/cancelar só por RPC.
grant select, insert (name, sender_channel_id, audience, audience_label, template_id, vars, replies, send_mode, scheduled_at, saved_at),
      update (name, sender_channel_id, audience, audience_label, template_id, vars, replies, send_mode, scheduled_at, saved_at), delete
  on public.campaigns to authenticated;
create policy campaigns_select on public.campaigns for select to authenticated using (private.is_manager());
create policy campaigns_insert on public.campaigns for insert to authenticated with check (private.is_manager() and status = 'Rascunho');
create policy campaigns_update on public.campaigns for update to authenticated
  using (private.is_manager() and status = 'Rascunho') with check (status = 'Rascunho');
create policy campaigns_delete on public.campaigns for delete to authenticated using (private.is_manager() and status = 'Rascunho');

grant select on public.campaign_recipients to authenticated;
create policy campaign_recipients_select on public.campaign_recipients for select to authenticated using (private.is_manager());

-- ---------------------------------------------------------------- auditoria e LGPD (admin)
grant select on public.audit_log, public.data_requests to authenticated;
create policy audit_log_admin on public.audit_log for select to authenticated using (private.is_admin());
create policy data_requests_admin on public.data_requests for select to authenticated using (private.is_admin());

-- service_role ignora RLS (BYPASSRLS), mas precisa dos GRANTs de tabela.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated;
