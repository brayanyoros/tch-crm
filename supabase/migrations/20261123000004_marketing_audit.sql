-- =============================================================================
-- TCH CRM · 0004 · Automações, campanhas, auditoria e solicitações LGPD
-- =============================================================================

create table public.automations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  status       text not null default 'rascunho' check (status in ('rascunho', 'ativa', 'pausada')),
  draft        jsonb not null check (jsonb_typeof(draft -> 'nodes') = 'array' and jsonb_typeof(draft -> 'edges') = 'array'),
  published    jsonb,
  version      integer not null default 0,
  activated_at timestamptz,
  saved_at     timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint automations_published check (status = 'rascunho' or published is not null)
);

create table public.automation_runs (
  id            uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations (id) on delete cascade,
  contact_id    uuid references public.contacts (id) on delete set null,
  contact_name  text not null default '',
  actions       text[] not null default '{}',
  failure       text,
  version       integer,
  created_at    timestamptz not null default now()
);
create index automation_runs_automation_idx on public.automation_runs (automation_id, created_at desc);

create table public.saved_audiences (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 3 and 80),
  audience   jsonb not null,
  updated_at timestamptz not null default now()
);
create unique index saved_audiences_name_key on public.saved_audiences (lower(btrim(name)));

create table public.campaigns (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(btrim(name)) between 1 and 120),
  sender_channel_id uuid references public.channels (id) on delete restrict,
  audience          jsonb not null default '{}',
  audience_label    text not null default 'Público personalizado',
  template_id       uuid references public.templates (id) on delete restrict,
  vars              jsonb not null default '{}',
  replies           jsonb not null default '{}',
  send_mode         text not null default 'agora' check (send_mode in ('agora', 'agendar')),
  scheduled_at      timestamptz,
  status            text not null default 'Rascunho'
                    check (status in ('Rascunho', 'Agendada', 'Enviando', 'Concluída', 'Pausada', 'Cancelada')),
  saved_at          timestamptz not null default now(),
  confirmed_at      timestamptz,
  confirmed_by      uuid references public.profiles (id) on delete set null,
  cost_per_message  numeric(10, 4),
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint campaigns_confirmed check (status = 'Rascunho' or (confirmed_at is not null and template_id is not null and sender_channel_id is not null and scheduled_at is not null))
);
create index campaigns_due_idx on public.campaigns (scheduled_at) where status in ('Agendada', 'Enviando');

create table public.campaign_recipients (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  name        text not null,
  phone       text not null,
  status      text not null default 'Na fila'
              check (status in ('Na fila', 'Enviada', 'Entregue', 'Lida', 'Respondeu', 'Saiu', 'Falhou')),
  message_id  uuid references public.messages (id) on delete set null,
  error       text,
  updated_at  timestamptz not null default now(),
  primary key (campaign_id, contact_id)
);
create index campaign_recipients_message_idx on public.campaign_recipients (message_id) where message_id is not null;
create index campaign_recipients_queue_idx on public.campaign_recipients (campaign_id) where status = 'Na fila';

alter table public.deals add constraint deals_campaign_fk foreign key (campaign_id) references public.campaigns (id) on delete set null;
alter table public.messages add constraint messages_campaign_fk foreign key (campaign_id) references public.campaigns (id) on delete set null;

-- ---------------------------------------------------------------- auditoria
create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  action     text not null,
  entity     text not null,
  entity_id  text,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_created_idx on public.audit_log (created_at desc);

/** Pedidos do titular (LGPD art. 18): acesso, correção, anonimização, eliminação. */
create table public.data_requests (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid references public.contacts (id) on delete set null,
  kind         text not null check (kind in ('acesso', 'correcao', 'anonimizacao', 'eliminacao', 'revogacao')),
  status       text not null default 'aberta' check (status in ('aberta', 'concluida', 'recusada')),
  notes        text,
  requested_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
