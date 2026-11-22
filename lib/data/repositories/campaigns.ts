import { changed, db, ensure, newId, nowIso, wait } from "../db";
import { DAY, agoMs } from "../../format";
import type { AudienceFilter, Campaign, CampaignDraft, CampaignRecipient, Contact } from "../types";

export interface CampaignStats { total: number; sent: number; delivered: number; read: number; replied: number; left: number; failed: number; deals: number; revenue: number; cost: number }
export type CampaignView = Campaign & { stats: CampaignStats };
const STEP: Record<CampaignRecipient["status"], number> = { "Na fila": 0, Falhou: 1, Enviada: 1, Entregue: 2, Lida: 3, Saiu: 3, Respondeu: 4 };
function statsOf(c: Campaign): CampaignStats {
  const n = (k: number) => c.recipients.filter((r) => STEP[r.status] >= k).length;
  const ds = db.deals.filter((d) => d.campaignId === c.id);
  return { total: c.recipients.length, sent: n(1), delivered: n(2), read: n(3), replied: n(4), left: c.recipients.filter((r) => r.status === "Saiu").length, failed: c.recipients.filter((r) => r.status === "Falhou").length, deals: ds.length, revenue: ds.filter((d) => d.status === "ganho").reduce((a, d) => a + d.value, 0), cost: n(2) * db.settings.costs.marketing };
}
const view = (c: Campaign): CampaignView => ({ ...structuredClone(c), stats: statsOf(c) });
const find = (id: string) => { const c = db.campaigns.find((x) => x.id === id); if (!c) throw new Error("Campanha não encontrada."); return c; };
export async function listCampaigns() { await wait(); ensure("campaigns"); return db.campaigns.map(view); }
export async function getCampaign(id: string) { await wait(); ensure("campaigns"); return view(find(id)); }

const match = (c: Contact, f: AudienceFilter) => {
  const ds = db.deals.filter((d) => d.contactId === c.id);
  return (!f.stageId || ds.some((d) => d.stageId === f.stageId && d.status !== "perdido")) && (!f.tagId || c.tagIds.includes(f.tagId)) && (!f.productId || ds.some((d) => d.productId === f.productId)) && (!f.city || c.city === f.city) && (!f.ownerId || c.ownerId === f.ownerId) && (!f.lastDays || agoMs(c.lastContactAt) <= Number(f.lastDays) * DAY);
};
/** Só entra quem tem WhatsApp e autorização registrada. */
const audienceOf = (f: AudienceFilter) => { const all = db.contacts.filter((c) => match(c, f)); return { all, ok: all.filter((c) => c.phone && c.consent.status === "autorizado") }; };
export async function previewAudience(f: AudienceFilter) {
  await wait(); ensure("campaigns");
  const { all, ok } = audienceOf(f);
  const withPhone = all.filter((c) => c.phone);
  return { total: all.length, ok: ok.length, noConsent: withPhone.filter((c) => c.consent.status === "sem").length, left: withPhone.filter((c) => c.consent.status === "saiu").length, noPhone: all.length - withPhone.length, sample: ok.slice(0, 5).map((c) => ({ id: c.id, name: c.name, city: c.city, product: db.deals.find((d) => d.contactId === c.id)?.title ?? "nossa linha outdoor" })) };
}
/** Segunda a sábado, das 8h às 20h. */
export const inSendWindow = (d: Date) => d.getDay() !== 0 && d.getHours() >= 8 && d.getHours() * 60 + d.getMinutes() <= 1200;
export function nextWindow(d: Date) {
  const x = new Date(d);
  while (!inSendWindow(x)) { if (x.getHours() >= 20 || x.getDay() === 0) x.setDate(x.getDate() + 1); x.setHours(8, 0, 0, 0); }
  return x;
}
export async function saveCampaign(p: CampaignDraft, mode: "rascunho" | "enviar") {
  await wait(); ensure("campaigns");
  const { ok } = audienceOf(p.filter);
  const start = p.when === "agora" ? new Date(nowIso()) : new Date(p.scheduledAt);
  if (mode === "enviar") {
    if (!ok.length) throw new Error("Nenhum contato autorizado neste público.");
    if (p.when === "agendar" && !inSendWindow(start)) throw new Error("Escolha um horário entre 8h e 20h, de segunda a sábado.");
  }
  const sending = mode === "enviar" && p.when === "agora" && inSendWindow(start);
  const id = p.id ?? newId("camp");
  const c: Campaign = {
    ...p, id, status: mode === "rascunho" ? "Rascunho" : sending ? "Enviando" : "Agendada", scheduledAt: mode === "enviar" && p.when === "agora" ? nextWindow(start).toISOString() : p.scheduledAt, audience: p.listName || "Público filtrado",
    recipients: mode === "rascunho" ? [] : ok.map((x) => ({ contactId: x.id, name: x.name, phone: x.phone!, status: "Na fila" })),
  };
  if (p.listName) for (const x of ok) if (!x.lists.includes(p.listName)) x.lists.push(p.listName);
  const i = db.campaigns.findIndex((x) => x.id === id);
  if (i >= 0) db.campaigns[i] = c; else db.campaigns.unshift(c);
  changed();
  if (sending) setTimeout(() => tick(id), 1500);
  return id;
}
/* progresso simulado do envio em lotes */
function tick(id: string) {
  const c = db.campaigns.find((x) => x.id === id);
  if (!c || c.status !== "Enviando") return;
  const batch = c.recipients.filter((r) => r.status === "Na fila").slice(0, Math.max(3, Math.ceil(c.recipients.length / 12)));
  if (!batch.length) c.status = "Concluída";
  batch.forEach((r, i) => { r.status = i % 5 === 4 ? "Respondeu" : i % 3 === 2 ? "Entregue" : "Lida"; });
  changed();
  if (c.status === "Enviando") setTimeout(() => tick(id), 1500);
}
export async function setCampaignStatus(id: string, status: "Pausada" | "Cancelada" | "retomar") {
  await wait(); ensure("campaigns");
  const c = find(id);
  c.status = status === "retomar" ? (c.recipients.some((r) => r.status !== "Na fila") ? "Enviando" : "Agendada") : status;
  changed();
  if (c.status === "Enviando") setTimeout(() => tick(id), 800);
}
export async function sendTest() { await wait(); ensure("campaigns"); }
