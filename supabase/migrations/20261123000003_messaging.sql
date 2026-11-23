-- =============================================================================
-- TCH CRM · 0003 · Conversas, mensagens, mídia, modelos e webhooks da Meta
-- =============================================================================

/** Modelos de mensagem do WhatsApp (sincronizados com a WABA). */
create table public.templates (
  id               uuid primary key default gen_random_uuid(),
  channel_id       uuid not null references public.channels (id) on delete cascade,
  name             text not null check (name ~ '^[a-z0-9_]+$' and char_length(name) <= 512),
  label            text,
  language         text not null default 'pt_BR',
  category         public.template_category not null,
  status           public.template_status not null default 'em_analise',
  body             text not null default '',
  header           jsonb,
  buttons          jsonb not null default '[]' check (jsonb_typeof(buttons) = 'array'),
  components       jsonb not null default '[]' check (jsonb_typeof(components) = 'array'),
  external_id      text,
  rejection_reason text,
  synced_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (channel_id, name, language)
);
create trigger templates_updated_at before update on public.templates for each row execute function private.set_updated_at();

/** Uma conversa por contato e canal. A janela de atendimento conta de last_inbound_at. */
create table public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  contact_id           uuid not null references public.contacts (id) on delete cascade,
  channel_id           uuid not null references public.channels (id) on delete restrict,
  channel              public.channel_type not null,
  unread               integer not null default 0 check (unread >= 0),
  closed               boolean not null default false,
  last_inbound_at      timestamptz,
  last_message_at      timestamptz,
  last_message_preview text,
  awaiting_since       timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (contact_id, channel_id)
);
create index conversations_last_message_idx on public.conversations (last_message_at desc nulls last);
create trigger conversations_updated_at before update on public.conversations for each row execute function private.set_updated_at();

create table public.messages (
  id                   uuid primary key default gen_random_uuid(),
  conversation_id      uuid not null references public.conversations (id) on delete cascade,
  channel_id           uuid not null references public.channels (id) on delete restrict,
  kind                 public.message_kind not null,
  author_id            uuid references public.profiles (id) on delete set null,
  type                 public.message_type not null default 'text',
  body                 text check (char_length(body) <= 4096),
  status               public.message_status,
  external_id          text,
  client_id            uuid,
  reply_to_id          uuid references public.messages (id) on delete set null,
  reply_to_external_id text,
  template_id          uuid references public.templates (id) on delete set null,
  template_params      jsonb,
  campaign_id          uuid,
  metadata             jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  error_code           text,
  error_message        text,
  attempts             smallint not null default 0,
  next_attempt_at      timestamptz,
  locked_at            timestamptz,
  created_at           timestamptz not null default now(),
  sent_at              timestamptz,
  delivered_at         timestamptz,
  read_at              timestamptz,
  failed_at            timestamptz,
  updated_at           timestamptz not null default now(),
  constraint messages_status_by_kind check (
    (kind = 'cliente' and status = 'received') or
    (kind = 'nota' and status is null) or
    (kind = 'equipe' and status is not null and status <> 'received')
  )
);
-- Idempotência: o mesmo id da Meta nunca entra duas vezes; o mesmo envio da tela também não.
create unique index messages_external_key on public.messages (channel_id, external_id) where external_id is not null;
create unique index messages_client_key on public.messages (client_id) where client_id is not null;
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_outbox_idx on public.messages (next_attempt_at) where status = 'pending';
create index messages_sending_idx on public.messages (locked_at) where status = 'sending';
create index messages_campaign_idx on public.messages (campaign_id) where campaign_id is not null;
create trigger messages_updated_at before update on public.messages for each row execute function private.set_updated_at();

/** Anexos. O arquivo fica no bucket privado chat-media; external_media_id é o id na Meta. */
create table public.message_media (
  id                uuid primary key default gen_random_uuid(),
  message_id        uuid not null references public.messages (id) on delete cascade,
  kind              text not null check (kind in ('image', 'audio', 'video', 'document', 'sticker')),
  mime_type         text,
  file_name         text check (char_length(file_name) <= 255),
  size_bytes        bigint check (size_bytes >= 0),
  sha256            text,
  storage_path      text,
  external_media_id text,
  source_url        text,
  duration_s        integer,
  pages             integer,
  status            public.media_status not null default 'pending',
  attempts          smallint not null default 0,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index message_media_message_idx on public.message_media (message_id);
create index message_media_pending_idx on public.message_media (created_at) where status = 'pending';
create trigger message_media_updated_at before update on public.message_media for each row execute function private.set_updated_at();

/**
 * Status recebidos da Meta (sent/delivered/read/failed). Ficam aqui mesmo que a
 * mensagem ainda não tenha o external_id gravado (corrida entre resposta da API e webhook);
 * são aplicados assim que o id aparecer.
 */
create table public.message_status_events (
  id          bigint generated always as identity primary key,
  channel_id  uuid not null references public.channels (id) on delete cascade,
  external_id text not null,
  status      public.message_status not null check (status in ('sent', 'delivered', 'read', 'failed')),
  occurred_at timestamptz not null,
  error       jsonb,
  pricing     jsonb,
  applied_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (channel_id, external_id, status)
);
create index message_status_events_pending_idx on public.message_status_events (channel_id, external_id) where applied_at is null;

/** Caixa de entrada bruta dos webhooks: grava antes de processar, reprocessa se falhar. */
create table public.webhook_events (
  id              bigint generated always as identity primary key,
  provider        text not null check (provider in ('whatsapp', 'instagram')),
  payload         jsonb not null,
  payload_hash    text not null unique,
  status          public.webhook_status not null default 'pending',
  attempts        smallint not null default 0,
  last_error      text,
  next_attempt_at timestamptz not null default now(),
  received_at     timestamptz not null default now(),
  processed_at    timestamptz
);
create index webhook_events_queue_idx on public.webhook_events (next_attempt_at) where status in ('pending', 'failed', 'processing');
