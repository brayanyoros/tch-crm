/**
 * Infra comum das Edge Functions: configuração, logs estruturados (sem dados pessoais),
 * respostas HTTP, CORS, HMAC e trabalho em segundo plano.
 */

// ---------------------------------------------------------------- configuração
export function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name) ?? fallback;
  if (v === undefined || v === "") throw new HttpError(500, "config", `Configuração ausente: ${name}`);
  return v;
}
export const optionalEnv = (name: string) => Deno.env.get(name) || undefined;

// ---------------------------------------------------------------- logs
const SECRET_KEYS = /token|secret|authorization|password|apikey|api_key|signature/i;
const PII_KEYS = /^(phone|wa_id|from|from_id|to|recipient|recipient_id|email|name|profile_name|username|body|text|caption|address|latitude|longitude)$/i;

/** Remove segredos e dados pessoais antes de logar (LGPD: logs não guardam conteúdo de conversa). */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[…]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEYS.test(k) ? "[segredo]" : PII_KEYS.test(k) && v !== null && v !== undefined ? "[dado pessoal]" : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 300) return value.slice(0, 300) + "…";
  return value;
}

export function logger(fn: string, requestId: string = crypto.randomUUID()) {
  const write = (level: "debug" | "info" | "warn" | "error", msg: string, data?: Record<string, unknown>) => {
    const line = JSON.stringify({ level, fn, request_id: requestId, msg, ...(data ? (redact(data) as Record<string, unknown>) : {}), at: new Date().toISOString() });
    if (level === "error") console.error(line); else if (level === "warn") console.warn(line); else console.log(line);
  };
  return {
    requestId,
    debug: (m: string, d?: Record<string, unknown>) => optionalEnv("LOG_LEVEL") === "debug" && write("debug", m, d),
    info: (m: string, d?: Record<string, unknown>) => write("info", m, d),
    warn: (m: string, d?: Record<string, unknown>) => write("warn", m, d),
    error: (m: string, d?: Record<string, unknown>) => write("error", m, d),
  };
}
export type Logger = ReturnType<typeof logger>;

export const errorInfo = (e: unknown) => e instanceof Error ? { error: e.message, name: e.name, code: (e as { code?: string }).code } : { error: String(e) };

// ---------------------------------------------------------------- HTTP
export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

function corsHeaders(req: Request): Record<string, string> {
  const allowed = (optionalEnv("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("origin") ?? "";
  const allow = allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : "";
  return allow ? {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  } : {};
}

export function json(req: Request, status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(req), ...extra } });
}

/** Erro do Postgres/PostgREST → resposta. P0001 (private.fail) traz mensagem pronta para a tela. */
export function fromDbError(e: { code?: string; message?: string } | null | undefined): HttpError {
  const code = e?.code ?? "";
  if (code === "P0001") return new HttpError(422, "regra", e?.message ?? "Operação não permitida.");
  if (code === "42501") return new HttpError(403, "permissao", e?.message ?? "Você não tem permissão para esta ação.");
  if (code === "23505") return new HttpError(409, "duplicado", "Registro duplicado.");
  if (code === "22P02" || code === "23514") return new HttpError(400, "invalido", "Dados inválidos.");
  return new HttpError(500, "banco", "Erro interno. Tente de novo.");
}

/** Envolve o handler: CORS, request id, log e erro padronizado (sem vazar detalhes internos). */
export function serve(fn: string, handler: (req: Request, log: Logger) => Promise<Response>) {
  Deno.serve(async (req) => {
    const log = logger(fn, req.headers.get("x-request-id") ?? crypto.randomUUID());
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
    const started = Date.now();
    try {
      const res = await handler(req, log);
      log.info("ok", { status: res.status, ms: Date.now() - started });
      return res;
    } catch (e) {
      if (e instanceof HttpError) {
        (e.status >= 500 ? log.error : log.warn)("falha", { status: e.status, code: e.code, message: e.message });
        return json(req, e.status, { error: e.message, code: e.code, request_id: log.requestId });
      }
      log.error("erro inesperado", errorInfo(e));
      return json(req, 500, { error: "Erro interno. Tente de novo.", code: "interno", request_id: log.requestId });
    }
  });
}

export async function readJson<T = unknown>(req: Request, maxBytes = 256 * 1024): Promise<T> {
  if (req.method !== "POST") throw new HttpError(405, "metodo", "Use POST.");
  const raw = await req.text();
  if (raw.length > maxBytes) throw new HttpError(413, "tamanho", "Requisição grande demais.");
  try { return JSON.parse(raw) as T; } catch { throw new HttpError(400, "json", "JSON inválido."); }
}

// ---------------------------------------------------------------- cripto
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(data: string | Uint8Array) {
  return hex(await crypto.subtle.digest("SHA-256", (typeof data === "string" ? enc.encode(data) : data) as BufferSource));
}

export async function hmacSha256Hex(secret: string, data: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, data as BufferSource));
}

export function timingSafeEqual(a: string, b: string) {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Confere X-Hub-Signature-256 ("sha256=<hex>") sobre o corpo cru, contra qualquer um dos segredos. */
export async function verifyMetaSignature(raw: Uint8Array, header: string | null, secrets: string[]) {
  if (!header?.startsWith("sha256=")) return false;
  const got = header.slice(7).toLowerCase();
  for (const s of secrets) if (s && timingSafeEqual(await hmacSha256Hex(s, raw), got)) return true;
  return false;
}

// ---------------------------------------------------------------- segundo plano
/** Continua o trabalho após a resposta (Supabase Edge Runtime); fora dele, só aguarda. */
export function background(p: Promise<unknown>) {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
  else p.catch(() => {});
}

/** Executa tarefas com concorrência limitada. */
export async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let it = queue.shift(); it !== undefined; it = queue.shift()) await fn(it);
  }));
}
