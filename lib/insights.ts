/*
 * Definições das métricas comerciais. Resumo, Vendas, Equipe, exportações e listas detalhadas
 * usam só estas funções, para os números baterem entre si.
 *
 * Datas: período e calendário comercial em Horário de Brasília (America/Sao_Paulo).
 * "Agora" dos relatórios é o relógio dos dados (na demonstração, 22/11/2026 14:32).
 */
import type { DealView, Settings, Stage } from "./data/types";
import { DAY, now } from "./format";
import { fromSp, sp } from "./campaign/schedule";

export interface Range { from: Date; to: Date }
export type Period = "7" | "30" | "mes" | "custom";
const two = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dayStart = (d: Date) => { const p = sp(d); return fromSp(p.y, p.m, p.d, 0, 0); };
export const dateLabel = (d: Date) => { const p = sp(d); return `${two(p.d)}/${two(p.m)}/${p.y}`; };
export const rangeLabel = (r: Range) => { const a = sp(r.from), b = sp(r.to); return a.y === b.y ? `${two(a.d)}/${two(a.m)} a ${two(b.d)}/${two(b.m)}/${b.y}` : `${dateLabel(r.from)} a ${dateLabel(r.to)}`; };

/** Período atual e o intervalo anterior equivalente (mesmo número de dias, ou o mesmo trecho do mês anterior). */
export function ranges(p: { period: Period; from: string; to: string }, ref = now()): { cur: Range; prev: Range } {
  const r = sp(ref);
  if (p.period === "mes") {
    const py = r.m === 1 ? r.y - 1 : r.y, pm = r.m === 1 ? 12 : r.m - 1, last = daysIn(py, pm);
    const prevTo = r.d > last ? fromSp(py, pm, last, 23, 59) : fromSp(py, pm, r.d, r.h, r.min);
    return { cur: { from: fromSp(r.y, r.m, 1, 0, 0), to: ref }, prev: { from: fromSp(py, pm, 1, 0, 0), to: prevTo } };
  }
  let cur: Range;
  if (p.period === "custom") {
    const [a, b] = [p.from, p.to].map((s) => s.split("-").map(Number));
    cur = { from: fromSp(a[0], a[1], a[2], 0, 0), to: new Date(Math.min(fromSp(b[0], b[1], b[2] + 1, 0, 0).getTime() - 1, ref.getTime())) };
  } else cur = { from: dayStart(new Date(ref.getTime() - (Number(p.period) - 1) * DAY)), to: ref };
  const len = cur.to.getTime() - cur.from.getTime();
  return { cur, prev: { from: new Date(cur.from.getTime() - len - 1), to: new Date(cur.from.getTime() - 1) } };
}
const inR = (iso: string | undefined, r: Range) => { if (!iso) return false; const t = new Date(iso); return t >= r.from && t <= r.to; };

/* ---------- conjuntos ---------- */
/** Novos leads: negócios criados no período. */
export const createdIn = (ds: DealView[], r: Range) => ds.filter((d) => inR(d.createdAt, r));
/** Vendas ganhas: negócios marcados como ganhos com fechamento dentro do período. */
export const wonIn = (ds: DealView[], r: Range) => ds.filter((d) => d.status === "ganho" && inR(d.closedAt, r));
export const lostIn = (ds: DealView[], r: Range) => ds.filter((d) => d.status === "perdido" && inR(d.closedAt, r));
/** Oportunidades abertas agora, sem recorte de período. */
export const openNow = (ds: DealView[]) => ds.filter((d) => d.status === "aberto");
export const sum = (ds: DealView[]) => ds.reduce((a, d) => a + d.value, 0);
export const avg = (ns: number[]) => (ns.length ? ns.reduce((a, n) => a + n, 0) / ns.length : null);
export const median = (ns: number[]) => { if (!ns.length) return null; const s = [...ns].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/* ---------- indicadores ---------- */
/** Conversão de fechamento = ganhos ÷ (ganhos + perdidos), ambos encerrados no período. */
export function closeRate(ds: DealView[], r: Range) { const w = wonIn(ds, r), l = lostIn(ds, r), n = w.length + l.length; return { won: w, lost: l, rate: n ? w.length / n : null }; }
/** Ticket médio = valor das vendas ganhas ÷ quantidade, no mesmo recorte. Sem vendas: indisponível. */
export const ticket = (won: DealView[]) => (won.length ? sum(won) / won.length : null);
/** Ciclo de venda = dias entre a criação e o ganho. */
export const cycleDays = (won: DealView[]) => won.map((d) => (new Date(d.closedAt!).getTime() - new Date(d.createdAt).getTime()) / DAY);
/** Pipeline ponderado = Σ valor × chance configurada da etapa, nos negócios abertos. */
export const weighted = (open: DealView[]) => open.reduce((a, d) => a + (d.value * d.stage.chance) / 100, 0);
export type Change = { kind: "pct"; value: number } | { kind: "sem_base" } | { kind: "igual" };
/** Variação contra o período anterior. Anterior zero: "sem base comparável", nunca infinito. */
export function change(cur: number | null, prev: number | null): Change | null {
  if (cur === null || prev === null) return null;
  if (prev === 0) return cur === 0 ? { kind: "igual" } : { kind: "sem_base" };
  return { kind: "pct", value: (cur - prev) / prev };
}

/* ---------- funil ---------- */
export const MIN_COHORT = 20;
/** Conversão entre etapas da coorte: leads criados no período que chegaram a cada etapa (cada negócio uma vez; etapa pulada conta como passada). */
export function cohort(ds: DealView[], r: Range, stages: Stage[]) {
  const base = createdIn(ds, r);
  return { n: base.length, small: base.length < MIN_COHORT, steps: stages.map((s, i) => ({ stage: s, deals: base.filter((d) => d.reached >= i) })) };
}
/** Distribuição atual: negócios abertos agora em cada etapa. */
export const distribution = (open: DealView[], stages: Stage[]) => stages.filter((_, i) => i < stages.length - 1).map((s) => ({ stage: s, deals: open.filter((d) => d.stageId === s.id) }));

/* ---------- perdas ---------- */
const LOSS_LABEL: Record<string, string> = { Sumiu: "Sem retorno" };
export const lossLabel = (reason?: string) => (reason ? LOSS_LABEL[reason] ?? reason : "Sem motivo informado");

/* ---------- atendimento ---------- */
/** 1ª resposta humana, em minutos corridos, dos leads criados no período que já foram respondidos. */
export function firstReply(ds: DealView[], goalMin: number) {
  const done = ds.filter((d) => d.firstReplyMin > 0), mins = done.map((d) => d.firstReplyMin);
  return { n: done.length, avg: avg(mins), median: median(mins), within: done.length ? done.filter((d) => d.firstReplyMin <= goalMin).length / done.length : null, above: done.filter((d) => d.firstReplyMin > goalMin) };
}

/* ---------- calendário comercial e meta ---------- */
export const monthKey = (d: Date) => { const p = sp(d); return `${p.y}-${two(p.m)}`; };
export const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const monthName = (key: string) => { const [y, m] = key.split("-").map(Number); return `${MONTHS[m - 1]} de ${y}`; };
/** Dia comercial conforme Configurações › Horário e alertas ("Segunda a sábado" etc.). Feriados não estão cadastrados. */
export function businessDay(y: number, m: number, d: number, s: Settings) {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return s.hours.days === "Todos os dias" || (wd !== 0 && (s.hours.days !== "Segunda a sexta" || wd !== 6));
}
export interface GoalStatus { key: string; goal: number | null; superGoal: number | null; won: number; pct: number | null; remaining: number | null; daysLeft: number; todayCounts: boolean; pace: number | null; totalDays: number; elapsedDays: number; ended: boolean }
/** Atingimento = ganho ÷ meta. Restante = max(meta − ganho, 0). Ritmo = restante ÷ dias comerciais restantes. */
export function goalStatus(s: Settings, won: number, ref = now(), ownerId = ""): GoalStatus {
  const key = monthKey(ref), g = s.goalsByMonth[key], p = sp(ref), last = daysIn(p.y, p.m);
  const goal = ownerId ? g?.sellers[ownerId] ?? null : g?.team ?? null, superGoal = ownerId ? null : g?.superGoal ?? null;
  const days = Array.from({ length: last }, (_, i) => i + 1).filter((d) => businessDay(p.y, p.m, d, s));
  const todayCounts = businessDay(p.y, p.m, p.d, s) && `${two(p.h)}:${two(p.min)}` < s.hours.close;
  const daysLeft = days.filter((d) => d > p.d || (d === p.d && todayCounts)).length;
  const remaining = goal === null ? null : Math.max(goal - won, 0);
  return { key, goal, superGoal, won, pct: goal ? won / goal : null, remaining, daysLeft, todayCounts, pace: remaining !== null && daysLeft ? remaining / daysLeft : null, totalDays: days.length, elapsedDays: days.length - daysLeft, ended: daysLeft === 0 };
}
/** Vendas acumuladas por dia do mês × meta distribuída pelos dias comerciais. Dias futuros não têm realizado. */
export function monthSeries(ds: DealView[], s: Settings, goal: number | null, ref = now()) {
  const p = sp(ref), last = daysIn(p.y, p.m), bd = Array.from({ length: last }, (_, i) => businessDay(p.y, p.m, i + 1, s)), total = bd.filter(Boolean).length;
  const month = wonIn(ds, { from: fromSp(p.y, p.m, 1, 0, 0), to: ref });
  let acc = 0, done = 0;
  return Array.from({ length: last }, (_, i) => {
    const d = i + 1;
    if (bd[i]) done++;
    acc += sum(month.filter((x) => sp(new Date(x.closedAt!)).d === d));
    return { day: `${two(d)}/${two(p.m)}`, d, realizado: d <= p.d ? acc : null, meta: goal && total ? Math.round((goal * done) / total) : null };
  });
}

/* ---------- previsão do mês ---------- */
/** Realizado: ganho no mês. Estimado: abertos com fechamento previsto até o fim do mês × chance. Potencial: o mesmo sem ponderar. */
export function monthForecast(ds: DealView[], ref = now()) {
  const p = sp(ref), today = `${p.y}-${two(p.m)}-${two(p.d)}`, end = `${p.y}-${two(p.m)}-${two(daysIn(p.y, p.m))}`, open = openNow(ds);
  const inMonth = open.filter((d) => d.expectedCloseAt && d.expectedCloseAt >= today && d.expectedCloseAt <= end);
  return { realized: wonIn(ds, { from: fromSp(p.y, p.m, 1, 0, 0), to: ref }), inMonth, estimated: weighted(inMonth), potential: sum(inMonth), overdue: open.filter((d) => d.expectedCloseAt && d.expectedCloseAt < today), noDate: open.filter((d) => !d.expectedCloseAt) };
}
export function groupBy(ds: DealView[], key: (d: DealView) => string): [string, DealView[]][] {
  const m = new Map<string, DealView[]>();
  for (const d of ds) m.set(key(d), [...(m.get(key(d)) ?? []), d]);
  return [...m];
}
export function byDay(ds: DealView[], r: Range) {
  const out: { key: string; day: string; whatsapp: number; instagram: number }[] = [];
  for (let t = dayStart(r.from).getTime(); t <= r.to.getTime(); t += DAY) {
    const p = sp(new Date(t + 6 * 3_600_000)), k = `${p.y}-${two(p.m)}-${two(p.d)}`, x = ds.filter((d) => { const q = sp(new Date(d.createdAt)); return q.y === p.y && q.m === p.m && q.d === p.d; });
    if (!out.some((o) => o.key === k)) out.push({ key: k, day: `${two(p.d)}/${two(p.m)}`, whatsapp: x.filter((d) => d.channel === "whatsapp").length, instagram: x.filter((d) => d.channel === "instagram").length });
  }
  return out;
}
