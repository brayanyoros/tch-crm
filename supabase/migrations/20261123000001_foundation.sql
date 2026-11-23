-- =============================================================================
-- TCH CRM · 0001 · Fundação: schemas, extensões, tipos e utilitários
-- =============================================================================
-- Modelo: um projeto Supabase por empresa (single-tenant). O isolamento de dados
-- entre pessoas da equipe é feito por papel (vendedor/gestor/admin) e por
-- responsável do lead, via RLS. Nada de negócio fica exposto ao papel `anon`.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create extension if not exists pg_trgm with schema extensions;

-- Nada é executável por padrão: cada função recebe GRANT explícito.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;
-- Tabelas novas não ficam acessíveis ao anon nem ao authenticated sem GRANT explícito.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ---------------------------------------------------------------- tipos
create type public.app_role          as enum ('vendedor', 'gestor', 'admin');
create type public.channel_type      as enum ('whatsapp', 'instagram');
create type public.tag_color         as enum ('neutro', 'areia', 'champanhe', 'oliva', 'floresta', 'lago', 'vinho', 'grafite');
create type public.consent_status    as enum ('autorizado', 'sem', 'saiu');
create type public.deal_status       as enum ('aberto', 'ganho', 'perdido');
create type public.message_kind      as enum ('cliente', 'equipe', 'nota');
create type public.message_status    as enum ('received', 'pending', 'sending', 'sent', 'delivered', 'read', 'failed');
create type public.message_type      as enum ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contacts',
                                              'template', 'interactive', 'button', 'reaction', 'story_mention', 'share', 'unsupported');
create type public.channel_status    as enum ('conectado', 'pendente', 'erro', 'desativado');
create type public.template_status   as enum ('aprovado', 'em_analise', 'rejeitado', 'pausado', 'desativado');
create type public.template_category as enum ('marketing', 'utilidade', 'autenticacao');
create type public.webhook_status    as enum ('pending', 'processing', 'processed', 'failed', 'ignored');
create type public.media_status      as enum ('pending', 'stored', 'failed');

-- ---------------------------------------------------------------- utilitários
create or replace function private.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

/** Erro de negócio com mensagem pronta para a tela (SQLSTATE P0001). */
create or replace function private.fail(msg text, code text default 'P0001') returns void
language plpgsql as $$
begin
  raise exception using message = msg, errcode = code;
end $$;

/**
 * Normaliza telefone para E.164. Sem DDI, assume Brasil (+55).
 * Devolve null quando não há dígitos suficientes para um número válido.
 */
create or replace function private.normalize_phone(raw text) returns text
language plpgsql immutable as $$
declare d text;
begin
  if raw is null then return null; end if;
  d := regexp_replace(raw, '\D', '', 'g');
  if left(btrim(raw), 1) <> '+' then
    if d like '00%' then d := substr(d, 3);                          -- 00 + DDI
    elsif d like '0%' and length(d) in (11, 12) then d := substr(d, 2); -- 0 + DDD (discagem nacional)
    end if;
    if length(d) in (10, 11) then d := '55' || d; end if;           -- DDD + número, sem DDI
  end if;
  if length(d) < 8 or length(d) > 15 or left(d, 1) = '0' then return null; end if;
  return '+' || d;
end $$;

/**
 * Variantes de um celular brasileiro com e sem o nono dígito.
 * O WhatsApp ainda entrega `wa_id` de 12 dígitos (sem o 9) para linhas antigas.
 */
create or replace function private.phone_variants(e164 text) returns text[]
language plpgsql immutable as $$
declare d text := ltrim(coalesce(e164, ''), '+');
begin
  if d = '' then return array[]::text[]; end if;
  if d like '55%' and length(d) = 13 and substr(d, 5, 1) = '9' then
    return array['+' || d, '+' || left(d, 4) || substr(d, 6)];
  elsif d like '55%' and length(d) = 12 and substr(d, 5, 1) in ('6', '7', '8', '9') then
    return array['+' || d, '+' || left(d, 4) || '9' || substr(d, 5)];
  end if;
  return array['+' || d];
end $$;

create or replace function private.normalize_text(t text) returns text
language sql immutable as $$
  select lower(btrim(regexp_replace(translate(coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), '\s+', ' ', 'g')));
$$;
