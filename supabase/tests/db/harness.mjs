// Sobe um Postgres em memória (PGlite), aplica o stub da plataforma + migrations + seed
// e oferece helpers para executar SQL como um usuário autenticado (RLS ativa).
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function createDb({ seed = true } = {}) {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(readFileSync(join(root, "tests", "db", "supabase_stub.sql"), "utf8"));
  const dir = join(root, "migrations");
  const files = readdirSync(dir).filter((x) => x.endsWith(".sql")).sort().map((f) => join(dir, f));
  if (seed) files.push(join(root, "seed.sql"));
  for (const f of files) {
    const sql = readFileSync(f, "utf8");
    try { await db.exec(sql); }
    catch (e) {
      const at = Number(e.internalPosition ? 0 : e.position) || 0;
      const line = at ? sql.slice(0, at).split("\n").length : "?";
      throw new Error(`${f.split(/[\\/]/).pop()}:${line}: ${e.message} [${e.code}]${e.where ? `\n  ${e.where}` : ""}`);
    }
  }
  return db;
}

/** Executa `fn` numa transação com o papel e o JWT do usuário; desfaz se lançar. */
export async function as(db, userId, fn, role = "authenticated") {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(userId ? { sub: userId, role } : { role })]);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}
export const asService = (db, fn) => as(db, null, fn, "service_role");

/** Cria um usuário no auth (dispara o trigger que cria o perfil). */
export async function createUser(db, email, role = "vendedor", name) {
  const r = await db.query(
    `insert into auth.users (email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3) returning id`,
    [email, JSON.stringify({ role }), JSON.stringify({ name: name ?? email.split("@")[0] })],
  );
  return r.rows[0].id;
}

/** Espera erro com SQLSTATE/trecho de mensagem. */
export async function rejects(promise, match) {
  try { await promise; } catch (e) {
    if (match && !String(e.message).includes(match) && e.code !== match) throw new Error(`Erro inesperado: ${e.message} (esperava ${match})`);
    return e;
  }
  throw new Error(`Esperava erro${match ? ` (${match})` : ""}, mas deu certo.`);
}
