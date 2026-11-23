import { changed, db, ensure, newId, nowIso, wait } from "../db";
import { now } from "../../format";
import { simulate, type SimInput } from "../../automation/engine";
import { validate, type Names } from "../../automation/flow";
import { loadAutomations, persistAutomations } from "../../automation/storage";
import type { Automation, Flow } from "../types";

const find = (id: string) => { loadAutomations(); const a = db.automations.find((x) => x.id === id); if (!a) throw new Error("Automação não encontrada."); return a; };
/** Altera, persiste e só então avisa as telas. Se não persistir, desfaz. */
function commit<T>(change: () => T): T {
  const before = structuredClone(db.automations);
  try { const r = change(); persistAutomations(); changed(); return r; }
  catch (e) { db.automations.splice(0, db.automations.length, ...before); throw e; }
}
export async function listAutomations() { await wait(); ensure("automations"); loadAutomations(); return db.automations.map((a) => ({ ...a })); }
export async function getAutomation(id: string) { await wait(); ensure("automations"); return structuredClone(find(id)); }
export async function listRefs(): Promise<Names> {
  await wait();
  return { etapa: db.stages.map((s) => s.name), tag: db.tags.map((t) => t.name), produto: db.products.map((p) => p.name), vendedor: db.users.filter((u) => u.active && u.role === "vendedor").map((u) => u.name), modelo: db.templates.filter((t) => t.status === "Aprovado").map((t) => t.name) };
}
/** Salva o rascunho. Não muda a versão em execução. */
export async function saveDraft(id: string | undefined, name: string, draft: Flow): Promise<{ id: string; savedAt: string }> {
  await wait(); ensure("automations"); loadAutomations();
  if (!name.trim()) throw new Error("Dê um nome à automação.");
  const savedAt = nowIso();
  return commit(() => {
    if (id) { Object.assign(find(id), { name: name.trim(), draft: structuredClone(draft), savedAt }); return { id, savedAt }; }
    const a: Automation = { id: newId("a"), name: name.trim(), status: "rascunho", draft: structuredClone(draft), version: 0, savedAt, runs: [] };
    db.automations.unshift(a);
    return { id: a.id, savedAt };
  });
}
/** Coloca o rascunho salvo em execução, depois de validar. */
export async function publishAutomation(id: string) {
  ensure("automations");
  const names = await listRefs(), a = find(id), issues = validate(a.draft, names);
  if (issues.length) throw new Error(`Revise o fluxo antes de publicar: ${issues[0].text}`);
  commit(() => Object.assign(find(id), { published: structuredClone(a.draft), status: "ativa", version: a.version + 1, activatedAt: now().toISOString() }));
}
export async function setAutomationActive(id: string, active: boolean) {
  await wait(); ensure("automations");
  if (!find(id).published) throw new Error("Publique a automação antes de ativá-la.");
  commit(() => Object.assign(find(id), { status: active ? "ativa" : "pausada", ...(active ? { activatedAt: now().toISOString() } : {}) }));
}
export async function discardDraft(id: string) { await wait(); ensure("automations"); const p = find(id).published; if (p) commit(() => Object.assign(find(id), { draft: structuredClone(p), savedAt: nowIso() })); }
export async function deleteAutomation(id: string) { await wait(); ensure("automations"); commit(() => { const i = db.automations.indexOf(find(id)); if (i >= 0) db.automations.splice(i, 1); }); }
/** Percorre o fluxo com um lead, sem enviar nem alterar nada. */
export async function simulateAutomation(name: string, flow: Flow, input: SimInput) { await wait(); ensure("automations"); return simulate({ id: "simulacao", name }, flow, input); }
