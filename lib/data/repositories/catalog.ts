/* Cadastros: etapas, produtos, tags, respostas, modelos e preferências. */
import { changed, db, ensure, newId, wait } from "../db";
import type { Product, QuickReply, Settings, Stage, Tag, TagColor, Template } from "../types";
import type { Action } from "../../permissions";
import { REMOTE } from "../../supabase/client";
import * as R from "../remote";

const list = <T,>(get: () => T[]) => async () => { await wait(); return get().map((x) => ({ ...x })); };
export const listStages = list(() => db.stages);
export const listProducts = list(() => db.products);
export const listTags = list(() => db.tags);
export const listQuickReplies = list(() => db.quickReplies);
export const listTemplates = list(() => db.templates);
export async function listCities() { await wait(); return [...new Set(db.contacts.map((c) => c.city))].sort(); }

export async function getSettings(): Promise<Settings> { await wait(); return structuredClone(db.settings); }
const SECTION: Record<keyof Settings, Action> = { goalsByMonth: "goals", priorityOrder: "hours", costs: "costs", distribution: "distribution", hours: "hours", offMessage: "hours", limits: "hours", lossReasons: "stages", channels: "channels" };
export async function updateSettings(patch: Partial<Settings>) {
  await wait();
  for (const k of Object.keys(patch) as (keyof Settings)[]) ensure(SECTION[k]);
  if (REMOTE) return R.updateSettings(patch);
  Object.assign(db.settings, structuredClone(patch)); changed();
}

const nameTaken = (name: string, id?: string) => db.tags.some((t) => t.id !== id && t.name.toLowerCase() === name.trim().toLowerCase());
export async function createTag(name: string, color: TagColor) {
  await wait(); ensure("tag.create");
  if (nameTaken(name)) throw new Error("Já existe uma tag com este nome.");
  if (REMOTE) return R.createTag(name, color);
  const t: Tag = { id: newId("tag"), name: name.trim(), color };
  db.tags.push(t); changed();
  return t;
}
export async function updateTag(id: string, patch: Partial<Omit<Tag, "id">>) {
  await wait(); ensure("tag.create");
  if (patch.name && nameTaken(patch.name, id)) throw new Error("Já existe uma tag com este nome.");
  if (REMOTE) return R.updateTag(id, patch);
  Object.assign(db.tags.find((t) => t.id === id)!, patch); changed();
}
export async function tagUsage(): Promise<Record<string, number>> { await wait(); return Object.fromEntries(db.tags.map((t) => [t.id, db.contacts.filter((c) => c.tagIds.includes(t.id)).length])); }

function upsert<T extends { id: string }>(arr: T[], item: Omit<T, "id"> & { id?: string }, prefix: string) {
  const cur = arr.find((x) => x.id === item.id);
  if (cur) Object.assign(cur, item);
  else arr.push({ ...item, id: newId(prefix) } as unknown as T);
  changed();
}
export async function saveProduct(p: Omit<Product, "id"> & { id?: string }) { await wait(); ensure("products"); if (REMOTE) return R.saveProduct(p); upsert(db.products, p, "p"); }
export async function saveQuickReply(p: Omit<QuickReply, "id"> & { id?: string }) {
  await wait(); ensure("quickReplies");
  if (db.quickReplies.some((q) => q.shortcut === p.shortcut && q.id !== p.id)) throw new Error("Este atalho já existe.");
  if (REMOTE) return R.saveQuickReply(p);
  upsert(db.quickReplies, p, "q");
}
export async function deleteQuickReply(id: string) { await wait(); ensure("quickReplies"); if (REMOTE) return R.deleteQuickReply(id); const i = db.quickReplies.findIndex((x) => x.id === id); if (i >= 0) db.quickReplies.splice(i, 1); changed(); }
export async function saveTemplate(p: Pick<Template, "name" | "category" | "body">) { await wait(); ensure("templates"); if (REMOTE) return R.saveTemplate(p); upsert(db.templates, { ...p, status: "Em análise" as const, language: "pt_BR", channelId: "wa", buttons: [] }, "tp"); }
/** A última etapa é sempre a de ganho; as demais podem mudar de ordem. */
export async function saveStages(next: Stage[]) {
  await wait(); ensure("stages");
  if (REMOTE) return R.saveStages(next);
  const gone = db.stages.filter((s) => !next.some((x) => x.id === s.id));
  if (gone.some((s) => db.deals.some((d) => d.stageId === s.id && d.status === "aberto"))) throw new Error("Mova os negócios desta etapa antes de excluí-la.");
  db.stages.splice(0, db.stages.length, ...next.map((s) => ({ ...s, id: s.id || newId("st") })));
  for (const d of db.deals) if (d.status !== "perdido") d.reached = Math.max(0, db.stages.findIndex((s) => s.id === d.stageId));
  changed();
}

/* Canais reais (só com o backend ligado). */
export type { NewChannelInput } from "../remote";
export async function addChannel(p: R.NewChannelInput) { ensure("channels"); return R.addChannel(p); }
export async function setChannelToken(id: string, token: string) { ensure("channels"); return R.setChannelToken(id, token); }
export async function setChannelActive(id: string, active: boolean) { ensure("channels"); return R.setChannelActive(id, active); }
export async function deleteChannel(id: string) { ensure("channels"); return R.deleteChannel(id); }
