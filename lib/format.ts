import { differenceInCalendarDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Relógio do mock: parte de 22/11/2026 14:32 e anda em tempo real. */
const BASE = new Date(2026, 10, 22, 14, 32).getTime();
const LOADED = Date.now();
export const now = () => new Date(BASE + (Date.now() - LOADED));
export const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
export const agoMs = (iso: string) => now().getTime() - new Date(iso).getTime();

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlc = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const money = (v: number) => brl.format(v);
export const moneyCents = (v: number) => brlc.format(v);
export const int = (v: number) => new Intl.NumberFormat("pt-BR").format(v);
export const pct = (v: number) => `${Math.round(v * 100)}%`;

/** "há 12 min", "há 3 h", "há 2 dias" */
export function ago(iso: string) {
  const ms = agoMs(iso);
  if (ms < MIN) return "agora";
  if (ms < HOUR) return `há ${Math.floor(ms / MIN)} min`;
  if (ms < DAY) return `há ${Math.floor(ms / HOUR)} h`;
  const d = Math.floor(ms / DAY);
  return d === 1 ? "há 1 dia" : `há ${d} dias`;
}
/** "26 h 22 min" */
export function duration(ms: number) {
  const m = Math.max(0, Math.floor(ms / MIN));
  const h = Math.floor(m / 60);
  return h ? `${h} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
}
export const fmt = (iso: string | Date, f: string) => format(new Date(iso), f, { locale: ptBR });
export const time = (iso: string) => fmt(iso, "HH:mm");
export const dayDiff = (iso: string) => differenceInCalendarDays(new Date(iso), now());
export function dayLabel(iso: string) {
  const d = dayDiff(iso);
  return d === 0 ? "Hoje" : d === -1 ? "Ontem" : d === 1 ? "Amanhã" : fmt(iso, "dd 'de' MMMM");
}
export const dateTime = (iso: string) => `${dayLabel(iso)}, ${time(iso)}`;
export const listTime = (iso: string) => (dayDiff(iso) === 0 ? time(iso) : dayDiff(iso) === -1 ? "Ontem" : fmt(iso, "dd/MM"));
/** valor para <input type="datetime-local"> */
export const toLocalInput = (d: Date | string) => fmt(d, "yyyy-MM-dd'T'HH:mm");
export function initials(n: string) {
  const p = n.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}
export const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export const plural = (n: number, s: string, p = s + "s") => `${int(n)} ${n === 1 ? s : p}`;

export function toCsv(rows: (string | number)[][]) {
  return rows.map((r) => r.map((c) => {
    // apóstrofo impede o Excel de executar células como fórmula ("+55 21…" de telefone também é protegido)
    const s = typeof c === "string" && /^[=+\-@\t]/.test(c) ? "'" + c : String(c);
    return `"${s.replace(/"/g, '""')}"`;
  }).join(";")).join("\r\n");
}
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const first = clean.split("\n")[0];
  const sep = first.split(";").length >= first.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (q) {
      if (c !== '"') cell += c;
      else if (clean[i + 1] === '"') { cell += '"'; i++; }
      else q = false;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
