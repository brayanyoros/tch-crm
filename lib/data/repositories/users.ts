import { changed, db, ensure, me, newId, wait } from "../db";
import { can } from "../../permissions";
import type { Role, User } from "../types";

export async function listUsers() { await wait(); return db.users.map((u) => ({ ...u })); }
export async function login(email: string, password: string): Promise<User> {
  await wait();
  const u = db.users.find((x) => x.email === email.trim().toLowerCase() && x.active);
  if (!u || password.length < 4) throw new Error("E-mail ou senha não conferem.");
  return { ...u };
}
/** Sempre responde igual, exista ou não a conta. */
export async function requestPasswordLink(email: string) { void email; await wait(); }
export const getUserSync = (id: string) => db.users.find((u) => u.id === id && u.active) ?? null;
export async function updateProfile(patch: Partial<Pick<User, "name" | "photo" | "notify">>) { await wait(); Object.assign(me(), patch); changed(); }
export async function inviteUser(email: string, role: Role) {
  await wait(); ensure("users");
  if (db.users.some((u) => u.email === email)) throw new Error("Este e-mail já faz parte da equipe.");
  db.users.push({ id: newId("u"), name: email.split("@")[0], email, role, title: "Convite enviado", avatar: "neutro", active: true, notify: { mensagens: true, tarefas: true, resumo: false } });
  changed();
}
export async function updateUser(id: string, patch: Partial<Pick<User, "role" | "active">>) {
  await wait(); ensure("users");
  if (id === me().id) throw new Error("Você não pode alterar o próprio acesso.");
  Object.assign(db.users.find((u) => u.id === id)!, patch); changed();
}
/** Vendedores visíveis para quem está logado. */
export async function listSellers() { await wait(); const u = me(); return db.users.filter((x) => x.role === "vendedor" && x.active && (can(u, "insights.team") || x.id === u.id)).map((x) => ({ ...x })); }
