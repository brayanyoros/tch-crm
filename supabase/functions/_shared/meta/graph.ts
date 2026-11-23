/**
 * Cliente mínimo da Graph API (graph.facebook.com / graph.instagram.com) com timeout
 * e classificação de erro. Sem dependências: roda em Deno e Node.
 *
 *   retryable  → a Meta não processou (limite, indisponibilidade): pode tentar de novo.
 *   ambiguous  → não sabemos se processou (timeout/conexão caída): NÃO reenviar sozinho.
 *   definitivo → requisição inválida, fora da janela, número inexistente etc.
 */

export const GRAPH_VERSION = "v23.0";

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
    readonly ambiguous = false,
    readonly authProblem = false,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
  toJSON() { return { code: this.code, message: this.message, status: this.status }; }
}

/** Códigos documentados como temporários (Graph API e WhatsApp Cloud API). */
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 80007, 130429, 131000, 131016, 131048, 131056, 133004]);
const AUTH_CODES = new Set([10, 102, 190, 200, 3, 33]);

/** Mensagens em português para os erros mais comuns (vão para a conversa como motivo da falha). */
const FRIENDLY: Record<number, string> = {
  131047: "Mais de 24 h desde a última mensagem do cliente. Envie um modelo aprovado.",
  131026: "Mensagem não entregue: o número pode não ter WhatsApp ou não aceitou os Termos atualizados.",
  131049: "A Meta não entregou esta mensagem de marketing para preservar a experiência do cliente.",
  131050: "O cliente pediu para não receber mensagens de marketing deste número.",
  131051: "Tipo de mensagem não suportado.",
  131052: "Não foi possível baixar a mídia enviada pelo cliente.",
  131053: "Não foi possível enviar a mídia (formato ou tamanho inválido).",
  131021: "Remetente e destinatário são o mesmo número.",
  131031: "Conta do WhatsApp Business bloqueada pela Meta.",
  131042: "Problema no método de pagamento da conta do WhatsApp Business.",
  131045: "Número de telefone não registrado na Cloud API.",
  130472: "O número do cliente faz parte de um experimento da Meta e não recebeu a mensagem.",
  132000: "A quantidade de variáveis não confere com o modelo.",
  132001: "Modelo inexistente ou não aprovado neste idioma.",
  132005: "O texto do modelo ficou longo demais com as variáveis.",
  132007: "O conteúdo viola a política de modelos da Meta.",
  132012: "Formato das variáveis do modelo inválido.",
  132015: "Modelo pausado pela Meta por baixa qualidade.",
  132016: "Modelo desativado pela Meta.",
  130429: "Limite de envio por segundo atingido. Tentando de novo.",
  131048: "Limite de envio por qualidade (spam) atingido. Tentando mais tarde.",
  131056: "Muitas mensagens para o mesmo número em pouco tempo. Tentando de novo.",
  190: "Token de acesso da Meta inválido ou expirado.",
  10: "O app não tem permissão para esta operação na Meta.",
  200: "O app não tem permissão para esta operação na Meta.",
  551: "Esta pessoa não está disponível no momento (Instagram).",
  100: "Parâmetro inválido na chamada à Meta.",
};

export interface GraphRequest {
  url: string;
  token: string;
  method?: "GET" | "POST" | "DELETE";
  json?: unknown;
  form?: FormData;
  timeoutMs?: number;
  /** GET e operações idempotentes podem ser repetidas mesmo após timeout. */
  idempotent?: boolean;
  fetchImpl?: typeof fetch;
}

export async function graphFetch<T = Record<string, unknown>>(r: GraphRequest): Promise<T> {
  const method = r.method ?? (r.json || r.form ? "POST" : "GET");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), r.timeoutMs ?? 20_000);
  let res: Response;
  try {
    res = await (r.fetchImpl ?? fetch)(r.url, {
      method,
      headers: { Authorization: `Bearer ${r.token}`, ...(r.json ? { "Content-Type": "application/json" } : {}) },
      body: r.json ? JSON.stringify(r.json) : r.form,
      signal: ctrl.signal,
    });
  } catch (e) {
    const timeout = (e as Error)?.name === "AbortError";
    const idem = r.idempotent ?? method === "GET";
    throw new MetaApiError(timeout ? "A Meta não respondeu a tempo." : "Falha de conexão com a Meta.", 0, timeout ? "timeout" : "network", idem, !idem);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 500) }; }
  if (res.ok && !(body as { error?: unknown }).error) return body as T;
  throw toMetaError(res.status, body);
}

export function toMetaError(status: number, body: Record<string, unknown>): MetaApiError {
  const err = (body?.error ?? {}) as { code?: number; error_subcode?: number; message?: string; error_data?: { details?: string }; is_transient?: boolean };
  const code = Number(err.code ?? 0);
  const retryable = err.is_transient === true || RETRYABLE_CODES.has(code) || status === 429 || (status >= 500 && !code);
  const auth = AUTH_CODES.has(code) || status === 401;
  const msg = FRIENDLY[code] ?? err.error_data?.details ?? err.message ?? `Erro ${status} da Meta.`;
  return new MetaApiError(msg, status, String(code || status), retryable, false, auth, { subcode: err.error_subcode, message: err.message });
}

/** Espera antes da próxima tentativa (exponencial com teto e jitter). */
export function backoffMs(attempt: number, base = 15_000, cap = 15 * 60_000) {
  const exp = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}
