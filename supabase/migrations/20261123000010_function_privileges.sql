-- =============================================================================
-- TCH CRM · 0010 · Privilégios de execução de funções (rodar por último)
-- =============================================================================
-- O Postgres concede EXECUTE a PUBLIC em toda função nova, e o Supabase ainda concede
-- a anon/authenticated por default privileges. Aqui zeramos tudo e concedemos só o necessário:
--   authenticated → RPCs públicas do CRM (todas as funções de public, exceto svc_*);
--   service_role  → tudo (Edge Functions);
--   anon          → nada.
-- Esta migration é idempotente: reaplicar depois de novas funções mantém a regra.

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema private to service_role;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname not like 'svc\_%'
      and p.prorettype <> 'trigger'::regtype
  loop
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

-- Funções usadas dentro de políticas RLS (avaliadas com o papel de quem consulta).
grant execute on function
  private.my_role(), private.is_member(), private.is_manager(), private.is_admin(),
  private.can_view_owner(uuid), private.can_reply_owner(uuid), private.can_view_contact(uuid),
  private.can_view_conversation(uuid), private.can_view_deal(uuid), private.try_uuid(text)
to authenticated;

-- Funções futuras também nascem sem EXECUTE para PUBLIC (default global, não por schema).
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
