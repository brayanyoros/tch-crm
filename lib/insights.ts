import { eachDayOfInterval, endOfDay, startOfDay, startOfMonth, subMonths } from "date-fns";
import type { DealView, Stage } from "./data/types";
import { DAY, fmt, now } from "./format";

export interface Range { from: Date; to: Date }
export function ranges(p: { period: "7" | "30" | "mes" | "custom"; from: string; to: string }): { cur: Range; prev: Range } {
  const n = now();
  if (p.period === "mes") return { cur: { from: startOfMonth(n), to: n }, prev: { from: startOfMonth(subMonths(n, 1)), to: subMonths(n, 1) } };
  const cur = p.period === "custom" ? { from: startOfDay(new Date(p.from + "T00:00")), to: endOfDay(new Date(p.to + "T00:00")) } : { from: startOfDay(new Date(n.getTime() - (Number(p.period) - 1) * DAY)), to: n };
  const len = cur.to.getTime() - cur.from.getTime();
  return { cur, prev: { from: new Date(cur.from.getTime() - len - 1), to: new Date(cur.from.getTime() - 1) } };
}
export const inRange = (d: DealView, r: Range) => { const t = new Date(d.createdAt); return t >= r.from && t <= r.to; };
export const sum = (ds: DealView[]) => ds.reduce((a, d) => a + d.value, 0);
export const avg = (ns: number[]) => (ns.length ? ns.reduce((a, n) => a + n, 0) / ns.length : 0);
export const won = (ds: DealView[]) => ds.filter((d) => d.status === "ganho");
export const proposals = (ds: DealView[]) => ds.filter((d) => d.reached >= 2);
export const open = (ds: DealView[]) => ds.filter((d) => d.status === "aberto");
/** Negociação = última etapa antes do ganho. */
export const negotiating = (ds: DealView[], stages: Stage[]) => open(ds).filter((d) => d.stageIndex === stages.length - 2);
/** Variação em relação ao período anterior; null sem base. */
export const delta = (a: number, b: number) => (b ? (a - b) / b : null);
export const reachedAt = (ds: DealView[], i: number) => ds.filter((d) => d.reached >= i);
export function groupBy(ds: DealView[], key: (d: DealView) => string): [string, DealView[]][] {
  const m = new Map<string, DealView[]>();
  for (const d of ds) m.set(key(d), [...(m.get(key(d)) ?? []), d]);
  return [...m];
}
export function byDay(ds: DealView[], r: Range) {
  return eachDayOfInterval({ start: r.from, end: r.to }).map((day) => {
    const k = fmt(day, "yyyy-MM-dd"), x = ds.filter((d) => fmt(d.createdAt, "yyyy-MM-dd") === k);
    return { key: k, day: fmt(day, "dd/MM"), whatsapp: x.filter((d) => d.channel === "whatsapp").length, instagram: x.filter((d) => d.channel === "instagram").length };
  });
}
