import { changed, db, dealView, ensure, me, newId, nowIso, wait } from "../db";
import { can } from "../../permissions";
import { HOUR, agoMs } from "../../format";
import { emit } from "../../automation/engine";
import type { ChannelType, DealView } from "../types";
import { createContact } from "./contacts";

export interface DealFilters { ownerId?: string; channel?: string; tagId?: string; productId?: string; origin?: string; from?: Date; to?: Date }
const find = (id: string) => { const d = db.deals.find((x) => x.id === id); if (!d) throw new Error("Negócio não encontrado."); return d; };
const editable = (id: string) => { const d = find(id); ensure("lead.reply", d); return d; };
const log = (id: string, text: string) => find(id).history.push({ id: newId("h"), at: nowIso(), text, authorId: me().id });
const matches = (d: DealView, f: DealFilters) =>
  (!f.ownerId || d.ownerId === f.ownerId) && (!f.channel || d.channel === f.channel) && (!f.tagId || d.contact.tagIds.includes(f.tagId)) && (!f.productId || d.productId === f.productId) && (!f.origin || d.origin === f.origin) &&
  (!f.from || new Date(d.createdAt) >= f.from) && (!f.to || new Date(d.createdAt) <= f.to);

/** Todos os negócios visíveis (inclui perdidos). */
export async function listDeals(f: DealFilters = {}) { await wait(); const u = me(); return db.deals.filter((d) => can(u, "lead.view", d)).map(dealView).filter((d) => matches(d, f)); }
/** Quadro: abertos e ganhos, sem perdidos. */
export async function listPipeline(f: DealFilters = {}) { return (await listDeals(f)).filter((d) => d.status !== "perdido").sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)); }
export async function moveDeal(id: string, stageId: string, finalValue?: number) {
  await wait();
  const d = editable(id), from = db.stages.find((s) => s.id === d.stageId), to = db.stages.findIndex((s) => s.id === stageId);
  if (to < 0) throw new Error("Etapa não encontrada.");
  const won = to === db.stages.length - 1;
  Object.assign(d, { stageId, reached: Math.max(d.reached, to), status: won ? "ganho" : "aberto", closedAt: won ? nowIso() : undefined, lostReason: undefined });
  if (finalValue !== undefined) d.value = finalValue;
  log(id, `Etapa: ${from?.name ?? "?"} → ${db.stages[to].name}`);
  emit({ type: "etapa", contactId: d.contactId, dealId: id, value: db.stages[to].name });
  changed();
}
export async function loseDeal(id: string, reason: string) { await wait(); Object.assign(editable(id), { status: "perdido", lostReason: reason, closedAt: nowIso() }); log(id, `Marcado como perdido: ${reason}`); changed(); }
/** Data prevista de fechamento ("AAAA-MM-DD") ou null para remover. */
export async function setExpectedClose(id: string, date: string | null) {
  await wait();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Data inválida.");
  const d = editable(id); d.expectedCloseAt = date ?? undefined;
  log(id, date ? `Previsão de fechamento: ${date.split("-").reverse().join("/")}` : "Previsão de fechamento removida"); changed();
}
export async function addNote(id: string, text: string) { await wait(); const d = find(id); ensure("lead.view", d); d.notes.unshift({ id: newId("n"), authorId: me().id, text, at: nowIso() }); changed(); }
export async function deleteDeal(id: string) { await wait(); ensure("lead.delete"); db.deals.splice(db.deals.indexOf(find(id)), 1); db.tasks.forEach((t) => { if (t.dealId === id) t.dealId = undefined; }); changed(); }

export interface NewDeal { contactId?: string; newContact?: { name: string; channel: ChannelType; handle: string; city: string }; productId: string; value: number; ownerId: string; stageId: string; tagId?: string }
export async function createDeal(p: NewDeal) {
  const ownerId = can(me(), "lead.transfer") ? p.ownerId : me().id;
  const contact = p.contactId ? db.contacts.find((c) => c.id === p.contactId) : await createContact({ ...p.newContact!, ownerId });
  if (!contact) throw new Error("Contato não encontrado.");
  ensure("lead.view", contact);
  await wait();
  const newTag = p.tagId && !contact.tagIds.includes(p.tagId) ? db.tags.find((t) => t.id === p.tagId) : undefined;
  if (newTag) contact.tagIds = [...contact.tagIds, newTag.id];
  contact.ownerId ??= ownerId;
  const st = db.stages.findIndex((s) => s.id === p.stageId), at = nowIso(), won = st === db.stages.length - 1, id = newId("d");
  db.deals.push({
    id, contactId: contact.id, productId: p.productId, title: db.products.find((x) => x.id === p.productId)!.name, channel: contact.channels[0], value: p.value, ownerId, stageId: p.stageId, status: won ? "ganho" : "aberto", closedAt: won ? at : undefined,
    reached: st, origin: "Showroom", createdAt: at, lastMessageAt: at, firstReplyMin: 0, avgReplyMin: 0, notes: [], history: [{ id: newId("h"), at, text: "Negócio criado", authorId: me().id }],
  });
  emit({ type: "lead", contactId: contact.id, dealId: id });
  if (newTag) emit({ type: "tag", contactId: contact.id, dealId: id, value: newTag.name });
  changed();
  return id;
}
/** Negócio aberto com a última mensagem há mais de 24 h. */
export const isStale = (d: DealView) => d.status === "aberto" && agoMs(d.lastMessageAt) > 24 * HOUR;
