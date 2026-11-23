import { changed, db, dealView, ensure, me, newId, nowIso, tagsOf, userOf, wait } from "../db";
import { can } from "../../permissions";
import { emit } from "../../automation/engine";
import type { ChannelType, Contact, ContactView } from "../types";

const view = (c: Contact): ContactView => {
  const ds = db.deals.filter((d) => d.contactId === c.id);
  return { ...c, owner: userOf(c.ownerId), tags: tagsOf(c), dealCount: ds.length, stageId: ds.find((d) => d.status !== "perdido")?.stageId, productIds: ds.map((d) => d.productId) };
};
const find = (id: string) => { const c = db.contacts.find((x) => x.id === id); if (!c) throw new Error("Contato não encontrado."); ensure("lead.view", c); return c; };

export async function listContacts() { await wait(); const u = me(); return db.contacts.filter((c) => can(u, "lead.view", c)).map(view).sort((a, b) => b.lastContactAt.localeCompare(a.lastContactAt)); }
export async function getContact(id: string) {
  await wait();
  const c = find(id);
  return { contact: view(c), deals: db.deals.filter((d) => d.contactId === id).map(dealView), conversation: db.conversations.find((v) => v.contactId === id), tasks: db.tasks.filter((t) => t.contactId === id) };
}
export interface NewContact { name: string; channel: ChannelType; handle: string; city: string; email?: string; ownerId: string | null }
const build = (p: NewContact): Contact => ({ id: newId("c"), name: p.name.trim(), channels: [p.channel], ...(p.channel === "whatsapp" ? { phone: p.handle } : { instagram: p.handle }), email: p.email || undefined, city: p.city, ownerId: p.ownerId, tagIds: [], lastContactAt: nowIso(), consent: { status: "sem" }, lists: [] });
export async function createContact(p: NewContact) { await wait(); const c = build(p); db.contacts.push(c); changed(); return c; }
export async function importContacts(rows: Omit<NewContact, "ownerId">[]) {
  await wait();
  const key = (s: string) => s.replace(/\W/g, "").toLowerCase();
  const known = new Set(db.contacts.flatMap((c) => [c.phone, c.instagram]).flatMap((s) => (s ? [key(s)] : [])));
  const fresh = rows.filter((r) => { const k = key(r.handle); if (known.has(k)) return false; known.add(k); return true; });
  db.contacts.push(...fresh.map((r) => build({ ...r, ownerId: can(me(), "lead.transfer") ? null : me().id })));
  changed();
  return { added: fresh.length, skipped: rows.length - fresh.length };
}
export async function updateContact(id: string, patch: Partial<Pick<Contact, "name" | "city" | "phone" | "instagram" | "email">>) { await wait(); Object.assign(find(id), patch); changed(); }
const tagged = (contactId: string, ids: string[]) => { for (const t of ids) { const value = db.tags.find((x) => x.id === t)?.name; if (value) emit({ type: "tag", contactId, value }); } };
export async function setContactTags(id: string, tagIds: string[]) { await wait(); const c = find(id), added = tagIds.filter((t) => !c.tagIds.includes(t)); c.tagIds = tagIds; tagged(id, added); changed(); }
/** Transfere o lead inteiro: contato e negócios abertos. */
export async function assignContacts(ids: string[], ownerId: string) {
  await wait(); ensure("lead.transfer");
  for (const id of ids) {
    find(id).ownerId = ownerId;
    for (const d of db.deals) if (d.contactId === id && d.status === "aberto") { d.ownerId = ownerId; d.history.push({ id: newId("h"), at: nowIso(), text: `Transferido para ${userOf(ownerId)?.name}`, authorId: me().id }); }
  }
  changed();
}
/** Vendedor assume um lead sem dono. */
export async function claimContact(id: string) {
  await wait();
  const c = find(id);
  if (c.ownerId) throw new Error("Este lead já tem responsável.");
  c.ownerId = me().id;
  for (const d of db.deals) if (d.contactId === id && !d.ownerId) d.ownerId = me().id;
  changed();
}
export async function addTagToContacts(ids: string[], tagId: string) { await wait(); for (const id of ids) { const c = find(id); if (!c.tagIds.includes(tagId)) { c.tagIds = [...c.tagIds, tagId]; tagged(id, [tagId]); } } changed(); }
export async function addToList(ids: string[], list: string) { await wait(); for (const id of ids) { const c = find(id); if (!c.lists.includes(list)) c.lists.push(list); } changed(); }
export async function setConsent(id: string, status: Contact["consent"]["status"], origin: string) { await wait(); find(id).consent = { status, date: nowIso(), origin }; changed(); }
/** Mantém `keepId` e move tudo de `otherId` para ele. O pedido de saída sempre prevalece. */
export async function mergeContacts(keepId: string, otherId: string) {
  await wait();
  const a = find(keepId), b = find(otherId);
  for (const r of [...db.deals, ...db.tasks]) if (r.contactId === otherId) r.contactId = keepId;
  const va = db.conversations.find((v) => v.contactId === keepId), vb = db.conversations.find((v) => v.contactId === otherId);
  if (vb && !va) vb.contactId = keepId;
  else if (va && vb) { va.messages = [...va.messages, ...vb.messages].sort((x, y) => x.at.localeCompare(y.at)); va.unread += vb.unread; db.conversations.splice(db.conversations.indexOf(vb), 1); }
  Object.assign(a, { channels: [...new Set([...a.channels, ...b.channels])], phone: a.phone ?? b.phone, instagram: a.instagram ?? b.instagram, email: a.email ?? b.email, ownerId: a.ownerId ?? b.ownerId, tagIds: [...new Set([...a.tagIds, ...b.tagIds])], lists: [...new Set([...a.lists, ...b.lists])], lastContactAt: a.lastContactAt > b.lastContactAt ? a.lastContactAt : b.lastContactAt });
  if (b.consent.status === "saiu" || (a.consent.status === "sem" && b.consent.status === "autorizado")) a.consent = b.consent;
  db.contacts.splice(db.contacts.indexOf(b), 1);
  changed();
}
export async function deleteContact(id: string) {
  await wait(); ensure("lead.delete");
  db.contacts.splice(db.contacts.indexOf(find(id)), 1);
  for (const list of [db.deals, db.conversations, db.tasks] as { contactId?: string }[][]) for (let i = list.length - 1; i >= 0; i--) if (list[i].contactId === id) list.splice(i, 1);
  changed();
}
