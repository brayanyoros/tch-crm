import type { Role, User } from "./data/types";

export type Action =
  | "lead.view" | "lead.reply" | "lead.transfer" | "lead.delete" | "insights.team" | "goals" | "automations" | "campaigns"
  | "quickReplies" | "stages" | "tag.create" | "users" | "channels" | "products" | "templates" | "distribution" | "hours" | "costs";

const ADMIN_ONLY: Action[] = ["lead.delete", "users", "channels"];
const LEVEL: Record<Role, number> = { vendedor: 0, gestor: 1, admin: 2 };
export const ROLE_LABEL: Record<Role, string> = { vendedor: "Vendedor", gestor: "Gestor", admin: "Administrador" };

/** `resource` só importa para ver e responder leads; todo o resto depende do papel. */
export function can(user: Pick<User, "id" | "role"> | null, action: Action, resource?: { ownerId: string | null }): boolean {
  if (!user) return false;
  const level = LEVEL[user.role];
  if (action === "tag.create") return true;
  if (action === "lead.view") return level > 0 || !resource || resource.ownerId === null || resource.ownerId === user.id;
  if (action === "lead.reply") return level > 0 || !resource || resource.ownerId === user.id;
  return ADMIN_ONLY.includes(action) ? level === 2 : level >= 1;
}
