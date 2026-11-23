/** Clientes Supabase: admin (service_role, só no servidor) e do usuário (RLS + RPCs com o JWT dele). */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";
import { env, fromDbError, HttpError } from "./runtime.ts";

export type Db = SupabaseClient;

let admin: Db | null = null;
export function adminClient(): Db {
  admin ??= createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-client-info": "tch-crm-edge" } },
  });
  return admin;
}

export function userClient(req: Request): Db {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new HttpError(401, "sessao", "Sessão encerrada. Entre de novo.");
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

export type Role = "vendedor" | "gestor" | "admin";
export interface Caller { id: string; role: Role; client: Db }

/** Valida o JWT e exige perfil ativo com um dos papéis. */
export async function requireCaller(req: Request, roles: Role[] = ["vendedor", "gestor", "admin"]): Promise<Caller> {
  const client = userClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "sessao", "Sessão encerrada. Entre de novo.");
  const { data: p, error: e2 } = await adminClient().from("profiles").select("role, active").eq("id", data.user.id).maybeSingle();
  if (e2) throw fromDbError(e2);
  if (!p?.active) throw new HttpError(403, "inativo", "Seu acesso está desativado.");
  if (!roles.includes(p.role as Role)) throw new HttpError(403, "permissao", "Você não tem permissão para esta ação.");
  return { id: data.user.id, role: p.role as Role, client };
}

/** Chama uma RPC e converte erro do banco em HttpError. */
export async function rpc<T = unknown>(client: Db, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw fromDbError(error);
  return data as T;
}
