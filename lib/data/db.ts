/*
 * Estado em memória lido pelas telas. Sem Supabase, vem do seed de demonstração;
 * com Supabase (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY), é preenchido por lib/data/remote.ts
 * a partir do banco (respeitando a RLS) e mantido pelo Realtime.
 */
import * as seed from "./seed";
import type { Contact, Conversation, ConversationView, Deal, DealView, User } from "./types";
import { can, type Action } from "../permissions";
import { HOUR, now } from "../format";
import { REMOTE } from "../supabase/client";

const empty = (): typeof seed => ({
  ...seed, users: [], tags: [], products: [], stages: [], contacts: [], deals: [], conversations: [], tasks: [], quickReplies: [], templates: [],
  automations: [], audiences: [], campaigns: [], settings: structuredClone(seed.settings),
});
export const db = REMOTE ? empty() : { ...seed };
/** true quando os dados vêm do seed de demonstração (sem Supabase). */
export const DEMO_DATA = !REMOTE;
let n = 0;
export const newId = (p: string) => `${p}_${Date.now().toString(36)}${++n}`;
export const nowIso = () => now().toISOString();

/* sessão */
let sessionId: string | null = null;
export const setSession = (id: string | null) => { sessionId = id; };
export const me = (): User => {
  const u = db.users.find((x) => x.id === sessionId);
  if (!u) throw new Error("Sessão encerrada.");
  return u;
};
export function ensure(action: Action, resource?: { ownerId: string | null }) {
  if (!can(me(), action, resource)) throw new Error("Você não tem permissão para esta ação.");
}

/* atraso de rede; ?erro na URL simula falha de conexão */
export const wait = () => REMOTE ? Promise.resolve() : new Promise<void>((ok, fail) => setTimeout(() => {
  if (typeof location !== "undefined" && new URLSearchParams(location.search).has("erro")) fail(new Error("Falha de conexão."));
  else ok();
}, 200 + Math.random() * 200));

/* assinatura de mudanças (no Supabase: realtime) */
const subs = new Set<() => void>();
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const changed = () => subs.forEach((f) => f());

/* joins */
export const userOf = (id: string | null) => db.users.find((u) => u.id === id) ?? null;
export const tagsOf = (c: Contact) => c.tagIds.flatMap((t) => db.tags.find((x) => x.id === t) ?? []);
const talk = (v: Conversation) => v.messages.filter((m) => m.kind !== "nota");
export function waitingSince(v?: Conversation) {
  if (!v || v.closed) return undefined;
  /* mensagem automática (sem autor) não conta como resposta da equipe */
  const l = talk(v).filter((m) => m.kind === "cliente" || m.authorId).at(-1);
  return l?.kind === "cliente" ? l.at : undefined;
}
export function windowEndsAt(v: Conversation) {
  const l = [...v.messages].reverse().find((m) => m.kind === "cliente");
  return l ? new Date(new Date(l.at).getTime() + db.settings.limits.windowH * HOUR).toISOString() : undefined;
}
export function dealView(d: Deal): DealView {
  const contact = db.contacts.find((c) => c.id === d.contactId)!;
  const v = db.conversations.find((x) => x.contactId === d.contactId);
  const stageIndex = Math.max(0, db.stages.findIndex((s) => s.id === d.stageId));
  const end = v && windowEndsAt(v);
  return {
    ...d, contact, owner: userOf(d.ownerId), tags: tagsOf(contact), product: db.products.find((p) => p.id === d.productId)!, stage: db.stages[stageIndex], stageIndex,
    conversationId: v?.id, waitingSince: waitingSince(v), outOfWindow: !!end && new Date(end) < now(),
    nextTask: db.tasks.filter((t) => t.dealId === d.id && !t.doneAt).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0],
  };
}
export function conversationView(v: Conversation): ConversationView {
  const contact = db.contacts.find((c) => c.id === v.contactId)!;
  const d = db.deals.filter((x) => x.contactId === v.contactId && x.status !== "perdido").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return { ...v, messages: [...v.messages], contact, owner: userOf(contact.ownerId), tags: tagsOf(contact), deal: d && dealView(d), last: talk(v).at(-1), waitingSince: waitingSince(v), windowEndsAt: windowEndsAt(v) };
}
