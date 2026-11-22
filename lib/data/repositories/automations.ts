import { changed, conversationView, db, ensure, me, newId, wait } from "../db";
import { can } from "../../permissions";
import { HOUR, agoMs, now } from "../../format";
import type { Automation, ConversationView } from "../types";

export async function listAutomations() { await wait(); ensure("automations"); return db.automations.map((a) => ({ ...a })); }
export async function getAutomation(id: string) { await wait(); ensure("automations"); const a = db.automations.find((x) => x.id === id); if (!a) throw new Error("Automação não encontrada."); return structuredClone(a); }
export async function saveAutomation(a: Omit<Automation, "id" | "runs"> & { id?: string }) {
  await wait(); ensure("automations");
  const cur = db.automations.find((x) => x.id === a.id), id = cur?.id ?? newId("a");
  if (cur) Object.assign(cur, a, { id }); else db.automations.unshift({ ...a, id, runs: [] });
  changed();
  return id;
}
export async function setAutomationActive(id: string, active: boolean) { ensure("automations"); db.automations.find((x) => x.id === id)!.active = active; changed(); await wait(); }
export async function deleteAutomation(id: string) { await wait(); ensure("automations"); const i = db.automations.findIndex((x) => x.id === id); if (i >= 0) db.automations.splice(i, 1); changed(); }

function holds(v: ConversationView, type: string, value: string): boolean {
  const d = v.deal;
  switch (type) {
    case "canal": return (v.channel === "whatsapp" ? "WhatsApp" : "Instagram") === value;
    case "etapa": return d?.stage.name === value;
    case "tag": return v.tags.some((t) => t.name === value);
    case "responsavel": return v.owner?.name === value;
    case "valor": return (d?.value ?? 0) >= Number(value);
    case "produto": return d?.title === value;
    case "origem": return d?.origin === value;
    case "horario": { const t = now().toTimeString().slice(0, 5), open = now().getDay() !== 0 && t >= db.settings.hours.open && t < db.settings.hours.close; return open === (value === "Dentro do horário"); }
    default: return true;
  }
}
/** Avalia a regra em um lead, sem enviar nada. */
export async function testAutomation(a: Pick<Automation, "conditions">, conversationId: string) {
  await wait();
  const raw = db.conversations.find((x) => x.id === conversationId);
  const v = raw && conversationView(raw);
  if (!v || !can(me(), "lead.view", v.contact)) throw new Error("Escolha um lead.");
  return { name: v.contact.name, conditions: a.conditions.map((c) => ({ ...c, ok: holds(v, c.type, c.value) })), inWindow: !!v.windowEndsAt && new Date(v.windowEndsAt) > now(), autoRecent: v.messages.some((m) => m.kind === "equipe" && !m.authorId && agoMs(m.at) < 24 * HOUR) };
}
