-- =============================================================================
-- TCH CRM · 0002 · Equipe, cadastros, contatos, negócios e tarefas
-- =============================================================================

-- ---------------------------------------------------------------- equipe
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  email       text not null,
  role        public.app_role not null default 'vendedor',
  title       text not null default '' check (char_length(title) <= 120),
  avatar      public.tag_color not null default 'neutro',
  photo_url   text check (photo_url is null or char_length(photo_url) <= 2048),
  active      boolean not null default true,
  notify      jsonb not null default '{"mensagens": true, "tarefas": true, "resumo": false}'
              check (jsonb_typeof(notify) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));
create trigger profiles_updated_at before update on public.profiles for each row execute function private.set_updated_at();

/**
 * Cria o perfil quando o Auth cria o usuário (convite feito pela função admin-users).
 * O papel vem de app_metadata, que só o service_role consegue gravar.
 */
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.app_role;
begin
  begin
    r := coalesce(nullif(new.raw_app_meta_data ->> 'role', ''), 'vendedor')::public.app_role;
  exception when invalid_text_representation then
    r := 'vendedor';
  end;
  insert into public.profiles (id, name, email, role, title)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    r,
    coalesce(new.raw_user_meta_data ->> 'title', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function private.sync_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();
create trigger on_auth_user_email after update of email on auth.users for each row execute function private.sync_user_email();

-- ---------------------------------------------------------------- cadastros
create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  color      public.tag_color not null default 'neutro',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index tags_name_key on public.tags (lower(btrim(name)));

create table public.products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  category   text not null default '' check (char_length(category) <= 60),
  price      numeric(14, 2) not null default 0 check (price >= 0),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_name_key on public.products (lower(btrim(name)));
create trigger products_updated_at before update on public.products for each row execute function private.set_updated_at();

/** Funil: a etapa de maior posição é sempre a de ganho (mantido por save_stages). */
create table public.pipeline_stages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  position   smallint not null check (position >= 0),
  chance     smallint not null default 0 check (chance between 0 and 100),
  created_at timestamptz not null default now(),
  constraint pipeline_stages_position_key unique (position) deferrable initially deferred
);
create unique index pipeline_stages_name_key on public.pipeline_stages (lower(btrim(name)));

create table public.quick_replies (
  id         uuid primary key default gen_random_uuid(),
  shortcut   text not null check (shortcut ~ '^/[[:alnum:]_\-]{1,30}$'),
  text       text not null check (char_length(text) between 1 and 4096),
  audience   text not null default 'todos' check (audience in ('todos', 'gestor')),
  created_at timestamptz not null default now()
);
create unique index quick_replies_shortcut_key on public.quick_replies (lower(shortcut));

/** Preferências da empresa (linha única). */
create table public.app_settings (
  id                  boolean primary key default true check (id),
  timezone            text not null default 'America/Sao_Paulo',
  hours               jsonb not null default '{"open": "09:00", "close": "18:00", "days": "Segunda a sábado"}',
  off_message         text not null default '' check (char_length(off_message) <= 1024),
  limits              jsonb not null default '{"windowH": 24, "replyH": 1, "stalledD": 3, "firstReplyMin": 15}',
  goals_by_month      jsonb not null default '{}',
  priority_order      text[] not null default array['aguardando', 'tarefa_vencida', 'fechamento_proximo', 'proposta_sem_retorno', 'sem_atividade'],
  costs               jsonb not null default '{"marketing": null, "utilidade": null, "aiMonthly": 0}',
  distribution        jsonb not null default '{"mode": "livre", "members": []}',
  distribution_cursor integer not null default 0,
  loss_reasons        text[] not null default array['Preço', 'Prazo', 'Sumiu', 'Concorrente', 'Outro'],
  opt_out_keywords    text[] not null default array['sair', 'parar', 'stop', 'cancelar', 'descadastrar'],
  retention_days      jsonb not null default '{"webhook_events": 30, "status_events": 90, "notifications": 90}',
  updated_by          uuid references public.profiles (id) on delete set null,
  updated_at          timestamptz not null default now()
);
create trigger app_settings_updated_at before update on public.app_settings for each row execute function private.set_updated_at();
insert into public.app_settings default values;

-- ---------------------------------------------------------------- canais Meta
/**
 * Contas conectadas. Somente identificadores públicos ficam aqui; o token de acesso
 * fica no Supabase Vault (token_secret_id) ou em secret da Edge Function.
 */
create table public.channels (
  id               uuid primary key default gen_random_uuid(),
  type             public.channel_type not null,
  name             text not null default 'TCH Experiência',
  handle           text not null default '',
  status           public.channel_status not null default 'pendente',
  quality          text not null default '',
  messaging_limit  text not null default '',
  -- WhatsApp Cloud API
  phone_number_id  text,
  waba_id          text,
  -- Instagram: id da conta profissional (recebido em entry.id) e, no login via Facebook, a página
  ig_user_id       text,
  page_id          text,
  ig_api           text not null default 'instagram_login' check (ig_api in ('instagram_login', 'facebook_login')),
  token_secret_id  uuid,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint channels_whatsapp_ids check (type <> 'whatsapp' or (phone_number_id ~ '^[0-9]+$' and waba_id ~ '^[0-9]+$')),
  constraint channels_instagram_ids check (type <> 'instagram' or ig_user_id ~ '^[0-9]+$')
);
create unique index channels_phone_number_key on public.channels (phone_number_id) where phone_number_id is not null;
create unique index channels_ig_user_key on public.channels (ig_user_id) where ig_user_id is not null;
create trigger channels_updated_at before update on public.channels for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- contatos
create table public.contacts (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(btrim(name)) between 1 and 160),
  phone              text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  wa_id              text check (wa_id ~ '^[0-9]{8,15}$'),
  instagram_username text check (instagram_username ~ '^[A-Za-z0-9._]{1,30}$'),
  instagram_id       text check (instagram_id ~ '^[0-9]{1,30}$'),
  email              text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  city               text not null default '' check (char_length(city) <= 80),
  owner_id           uuid references public.profiles (id) on delete set null,
  origin             text check (char_length(origin) <= 80),
  ad_ref             jsonb,
  last_contact_at    timestamptz not null default now(),
  consent_status     public.consent_status not null default 'sem',
  consent_at         timestamptz,
  consent_origin     text check (char_length(consent_origin) <= 200),
  channels           public.channel_type[] generated always as (array_remove(array[
                       case when phone is not null or wa_id is not null then 'whatsapp'::public.channel_type end,
                       case when instagram_id is not null or instagram_username is not null then 'instagram'::public.channel_type end
                     ], null)) stored,
  anonymized_at      timestamptz,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index contacts_phone_key on public.contacts (phone) where phone is not null;
create unique index contacts_wa_id_key on public.contacts (wa_id) where wa_id is not null;
create unique index contacts_instagram_id_key on public.contacts (instagram_id) where instagram_id is not null;
create unique index contacts_instagram_username_key on public.contacts (lower(instagram_username)) where instagram_username is not null;
create index contacts_owner_idx on public.contacts (owner_id);
create index contacts_last_contact_idx on public.contacts (last_contact_at desc);
create index contacts_name_trgm on public.contacts using gin (name extensions.gin_trgm_ops);
create trigger contacts_updated_at before update on public.contacts for each row execute function private.set_updated_at();

create table public.contact_tags (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag_id)
);
create index contact_tags_tag_idx on public.contact_tags (tag_id);

create table public.contact_lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create unique index contact_lists_name_key on public.contact_lists (lower(btrim(name)));

create table public.contact_list_members (
  list_id    uuid not null references public.contact_lists (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  added_by   uuid references public.profiles (id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (list_id, contact_id)
);
create index contact_list_members_contact_idx on public.contact_list_members (contact_id);

/** Trilha de consentimento (LGPD art. 8º): só cresce, nunca é editada. */
create table public.consent_events (
  id         bigint generated always as identity primary key,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  status     public.consent_status not null,
  origin     text not null check (char_length(origin) between 1 and 200),
  actor_id   uuid references public.profiles (id) on delete set null,
  evidence   jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index consent_events_contact_idx on public.consent_events (contact_id, created_at desc);

-- ---------------------------------------------------------------- negócios
create table public.deals (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null references public.contacts (id) on delete cascade,
  product_id        uuid not null references public.products (id) on delete restrict,
  title             text not null check (char_length(btrim(title)) between 1 and 160),
  channel           public.channel_type not null default 'whatsapp',
  value             numeric(14, 2) not null default 0 check (value >= 0),
  owner_id          uuid references public.profiles (id) on delete set null,
  stage_id          uuid not null references public.pipeline_stages (id) on delete restrict,
  status            public.deal_status not null default 'aberto',
  reached           smallint not null default 0 check (reached >= 0),
  origin            text not null default 'Showroom' check (char_length(origin) <= 80),
  ad_name           text check (char_length(ad_name) <= 200),
  campaign_id       uuid,
  created_at        timestamptz not null default now(),
  closed_at         timestamptz,
  lost_reason       text check (char_length(lost_reason) <= 200),
  last_message_at   timestamptz not null default now(),
  expected_close_at date,
  first_reply_min   integer check (first_reply_min >= 0),
  avg_reply_min     integer check (avg_reply_min >= 0),
  reply_count       integer not null default 0,
  created_by        uuid references public.profiles (id) on delete set null,
  updated_at        timestamptz not null default now(),
  constraint deals_lost_reason check (status <> 'perdido' or lost_reason is not null),
  constraint deals_closed_at check ((status = 'aberto') = (closed_at is null))
);
create index deals_contact_idx on public.deals (contact_id);
create index deals_owner_idx on public.deals (owner_id) where status = 'aberto';
create index deals_stage_idx on public.deals (stage_id) where status <> 'perdido';
create index deals_created_idx on public.deals (created_at desc);
create trigger deals_updated_at before update on public.deals for each row execute function private.set_updated_at();

create table public.deal_notes (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  text       text not null check (char_length(btrim(text)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index deal_notes_deal_idx on public.deal_notes (deal_id, created_at desc);

create table public.deal_history (
  id         bigint generated always as identity primary key,
  deal_id    uuid not null references public.deals (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  text       text not null,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index deal_history_deal_idx on public.deal_history (deal_id, created_at);

-- ---------------------------------------------------------------- tarefas e lembretes
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  type        text not null constraint tasks_type_check check (type in ('Retorno', 'Visita ao showroom', 'Visita técnica', 'Enviar orçamento')),
  deal_id     uuid references public.deals (id) on delete set null,
  contact_id  uuid references public.contacts (id) on delete cascade,
  due_at      timestamptz not null,
  owner_id    uuid not null references public.profiles (id) on delete restrict,
  done_at     timestamptz,
  reminded_at timestamptz,
  overdue_notified_at timestamptz,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tasks_owner_due_idx on public.tasks (owner_id, due_at) where done_at is null;
create index tasks_deal_idx on public.tasks (deal_id);
create index tasks_contact_idx on public.tasks (contact_id);
create trigger tasks_updated_at before update on public.tasks for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- notificações internas
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  text       text not null,
  href       text not null default '/',
  read_at    timestamptz,
  dedupe_key text,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create unique index notifications_dedupe_key on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
