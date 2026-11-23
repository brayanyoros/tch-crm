"use client";
/**
 * Cliente Supabase do navegador. Só usa a chave pública (anon); tokens da Meta e a
 * service_role nunca chegam aqui. Sem as variáveis, o CRM roda no modo demonstração.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** true quando o CRM está ligado ao backend Supabase. */
export const REMOTE = !!(url && anon);

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!REMOTE) throw new Error("Supabase não configurado.");
  client ??= createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

/** Erro do PostgREST/Edge → mensagem para o toast (as RPCs já devolvem texto pronto em português). */
export function friendly(e: unknown, fallback = "Não foi possível concluir. Tente de novo."): Error {
  const err = e as { message?: string; code?: string; context?: Response } | null;
  if (err?.code === "P0001" || err?.code === "42501") return new Error(err.message ?? fallback);
  if (err?.code === "23505") return new Error("Já existe um registro com estes dados.");
  if (err?.code === "PGRST301" || err?.message?.includes("JWT")) return new Error("Sessão encerrada. Entre de novo.");
  return new Error(fallback);
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw friendly(error);
  return data as T;
}

/** Chama uma Edge Function com o JWT da sessão; erros de regra vêm em { error }. */
export async function edge<T = unknown>(name: string, body: unknown): Promise<T> {
  const { data, error } = await sb().functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    let msg: string | undefined;
    try { msg = (await (error as { context?: Response }).context?.json())?.error; } catch { /* corpo não JSON */ }
    throw new Error(msg ?? "Não foi possível concluir. Tente de novo.");
  }
  return data as T;
}
