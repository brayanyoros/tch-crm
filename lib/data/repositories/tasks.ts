import { changed, db, ensure, me, newId, nowIso, userOf, wait } from "../db";
import { can } from "../../permissions";
import type { Task, TaskView } from "../types";
import { REMOTE } from "../../supabase/client";
import * as R from "../remote";

const visible = (t: Task) => can(me(), "insights.team") || t.ownerId === me().id;
const find = (id: string) => { const t = db.tasks.find((x) => x.id === id); if (!t || !visible(t)) throw new Error("Tarefa não encontrada."); return t; };
const view = (t: Task): TaskView => ({ ...t, owner: userOf(t.ownerId)!, contact: db.contacts.find((c) => c.id === t.contactId), deal: db.deals.find((d) => d.id === t.dealId) });
export type TaskInput = Omit<Task, "id" | "doneAt">;
const clean = (p: TaskInput): TaskInput => {
  const d = db.deals.find((x) => x.id === p.dealId);
  if (d) ensure("lead.view", d);
  return { ...p, ownerId: can(me(), "insights.team") ? p.ownerId : me().id, contactId: p.contactId ?? d?.contactId };
};
export async function listTasks() { await wait(); return db.tasks.filter(visible).map(view).sort((a, b) => a.dueAt.localeCompare(b.dueAt)); }
export async function createTask(p: TaskInput) { if (REMOTE) return R.createTask(clean(p)); await wait(); const t = { ...clean(p), id: newId("t") }; db.tasks.push(t); changed(); return t.id; }
export async function updateTask(id: string, p: TaskInput) { if (REMOTE) { find(id); return R.updateTask(id, clean(p)); } await wait(); Object.assign(find(id), clean(p)); changed(); }
export async function setTaskDone(id: string, done: boolean) { if (REMOTE) { find(id); return R.setTaskDone(id, done); } find(id).doneAt = done ? nowIso() : undefined; changed(); await wait(); }
export async function deleteTask(id: string) { if (REMOTE) { find(id); return R.deleteTask(id); } await wait(); db.tasks.splice(db.tasks.indexOf(find(id)), 1); changed(); }
