/**
 * Gestão da equipe (admin): convidar pessoa e alterar papel/acesso.
 * O papel fica em profiles (fonte da verdade da RLS) e em app_metadata (só o service_role grava).
 * Desativar: corta o acesso aos dados na hora (RLS) e bloqueia novos logins (ban no Auth).
 */
import { z } from "npm:zod@3.24.1";
import { adminClient, requireCaller, rpc } from "../_shared/db.ts";
import { HttpError, json, optionalEnv, readJson, serve } from "../_shared/runtime.ts";

const Role = z.enum(["vendedor", "gestor", "admin"]);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), email: z.string().trim().toLowerCase().email().max(254), role: Role, name: z.string().trim().min(1).max(120).optional(), title: z.string().max(120).optional() }),
  z.object({ action: z.literal("update"), user_id: z.string().uuid(), role: Role.optional(), active: z.boolean().optional() }),
]);

serve("admin-users", async (req, log) => {
  const caller = await requireCaller(req, ["admin"]);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "invalido", "Dados inválidos.");
  const b = parsed.data, admin = adminClient();

  if (b.action === "invite") {
    const { data: exists } = await admin.from("profiles").select("id").ilike("email", b.email).maybeSingle();
    if (exists) throw new HttpError(409, "duplicado", "Este e-mail já faz parte da equipe.");
    const site = optionalEnv("SITE_URL");
    const { data, error } = await admin.auth.admin.inviteUserByEmail(b.email, {
      data: { name: b.name ?? b.email.split("@")[0], title: b.title ?? "" },
      ...(site ? { redirectTo: `${site.replace(/\/$/, "")}/login` } : {}),
    });
    if (error || !data.user) {
      log.warn("convite recusado pelo Auth", { status: error?.status });
      throw new HttpError(error?.status === 422 ? 409 : 502, "convite", error?.status === 422 ? "Este e-mail já tem conta." : "Não foi possível enviar o convite.");
    }
    await admin.auth.admin.updateUserById(data.user.id, { app_metadata: { role: b.role } });
    const { error: e2 } = await admin.from("profiles").update({ role: b.role, title: b.title ?? "Convite enviado" }).eq("id", data.user.id);
    if (e2) throw new HttpError(500, "perfil", "Convite enviado, mas o papel não foi gravado. Ajuste em Equipe.");
    await admin.from("audit_log").insert({ actor_id: caller.id, action: "invite", entity: "profile", entity_id: data.user.id, data: { role: b.role } });
    return json(req, 200, { user_id: data.user.id });
  }

  // update: a regra (admin, não pode alterar a si mesmo) é aplicada no banco
  await rpc(caller.client, "admin_update_user", { p_user_id: b.user_id, p_role: b.role ?? null, p_active: b.active ?? null });
  const attrs: Record<string, unknown> = {};
  if (b.role) attrs.app_metadata = { role: b.role };
  if (b.active !== undefined) attrs.ban_duration = b.active ? "none" : "876000h";
  if (Object.keys(attrs).length) {
    const { error } = await admin.auth.admin.updateUserById(b.user_id, attrs);
    if (error) log.warn("Auth não atualizou (o acesso a dados já foi alterado)", { status: error.status });
  }
  return json(req, 200, { ok: true });
});
