import { changed, conversationView, db, ensure, me, newId, nowIso, wait, windowEndsAt } from "../db";
import { can } from "../../permissions";
import { now } from "../../format";
import { channelName, emit } from "../../automation/engine";
import type { Attachment } from "../types";
import { REMOTE } from "../../supabase/client";
import * as R from "../remote";

const find = (id: string) => {
  const v = db.conversations.find((x) => x.id === id);
  const c = v && db.contacts.find((x) => x.id === v.contactId);
  if (!v || !c) throw new Error("Conversa não encontrada.");
  ensure("lead.view", c);
  return { v, c };
};
const openDeals = (contactId: string) => db.deals.filter((d) => d.contactId === contactId && d.status === "aberto");

export async function listConversations() {
  await wait();
  const u = me();
  return db.conversations.map(conversationView).filter((v) => can(u, "lead.view", v.contact)).sort((a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? ""));
}
export interface Payload { kind: "equipe" | "nota"; text: string; attachment?: Attachment; templateId?: string }
export async function sendMessage(id: string, p: Payload) {
  if (REMOTE) return R.sendMessage(id, p);
  await wait();
  const { v, c } = find(id);
  if (p.kind === "equipe") {
    ensure("lead.reply", c);
    const end = windowEndsAt(v);
    if (!p.templateId && (!end || new Date(end) < now())) throw new Error("A janela de 24h encerrou. Use um modelo aprovado.");
  }
  const mid = newId("m"), at = nowIso();
  v.messages.push({ id: mid, kind: p.kind, authorId: me().id, text: p.text, at, attachment: p.attachment, ...(p.kind === "equipe" ? { status: "enviada" as const } : {}) });
  if (p.kind === "equipe") {
    v.unread = 0; v.closed = false; c.lastContactAt = at;
    for (const d of openDeals(c.id)) d.lastMessageAt = at;
    const later = (status: "entregue" | "lida", ms: number) => setTimeout(() => { const m = v.messages.find((x) => x.id === mid); if (m) { m.status = status; changed(); } }, ms);
    later("entregue", 1500); later("lida", 6000);
  }
  changed();
}
export async function markRead(id: string) { if (REMOTE) { if (find(id).v.unread) await R.markRead(id); return; } const { v } = find(id); if (v.unread) { v.unread = 0; changed(); } }
export async function markUnread(id: string) { if (REMOTE) return R.markUnread(id); await wait(); find(id).v.unread = 1; changed(); }
export async function setClosed(id: string, closed: boolean) { if (REMOTE) return R.setClosed(id, closed); await wait(); const { v, c } = find(id); ensure("lead.reply", c); v.closed = closed; v.unread = 0; changed(); }
export async function deleteConversation(id: string) { if (REMOTE) { ensure("lead.delete"); return R.deleteConversation(id); } await wait(); ensure("lead.delete"); db.conversations.splice(db.conversations.indexOf(find(id).v), 1); changed(); }

/** Tempo real simulado: mensagem nova de um cliente visível para quem está logado. */
const INCOMING = ["Obrigado pelo retorno! Vou ver com a minha família e já respondo.", "Consigo visitar o showroom no sábado de manhã?", "Tem foto desse modelo já instalado?", "O frete está incluso nesse valor?", "Podemos fechar em 6 vezes?"];
let turn = 0;
export function simulateIncoming() {
  if (REMOTE) return null; // mensagens reais chegam pelo webhook + Realtime
  const u = me();
  const list = db.conversations.filter((v) => !v.closed && v.messages.at(-1)?.kind === "equipe" && openDeals(v.contactId).length && can(u, "lead.view", db.contacts.find((c) => c.id === v.contactId)));
  if (!list.length) return null;
  const v = list[(turn * 7 + 3) % list.length], c = db.contacts.find((x) => x.id === v.contactId)!, at = nowIso(), text = INCOMING[turn++ % INCOMING.length];
  v.messages.push({ id: newId("m"), kind: "cliente", text, at });
  v.unread++; c.lastContactAt = at;
  for (const d of openDeals(c.id)) d.lastMessageAt = at;
  emit({ type: "mensagem", contactId: c.id, value: text, channel: channelName(v, c) });
  changed();
  return { conversationId: v.id, name: c.name, text };
}
