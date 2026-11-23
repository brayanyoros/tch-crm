/*
 * Agendamento de campanhas. Usa a hora REAL e o fuso de Brasília.
 * Antes, o agendamento usava o relógio de demonstração do CRM (fixo em 22/11/2026, um domingo)
 * e a hora local do navegador: "Agora" caía em horários já passados e datas passadas eram aceitas.
 */
export const TZ = "America/Sao_Paulo";
export const TZ_LABEL = "Horário de Brasília";
/** Regra da operação TCH: segunda a sábado, das 8h às 20h (o envio precisa começar antes das 20h). */
export const WINDOW = { first: 1, last: 6, start: 8 * 60, end: 20 * 60, text: "segunda a sábado, das 8h às 20h" };
/** Folga mínima para um agendamento ainda ser futuro quando confirmado. */
export const MIN_LEAD_MS = 5 * 60_000;
export const realNow = () => new Date();
/** Arredonda para cima, em múltiplos de 5 minutos. */
export const roundUp5 = (d: Date) => new Date(Math.ceil(d.getTime() / 300_000) * 300_000);
/** Primeiro horário sugerido: daqui a pelo menos 15 minutos, dentro da janela. */
export const suggestFrom = (now: Date) => nextWindow(roundUp5(new Date(now.getTime() + 15 * 60_000)));

const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function sp(d: Date) {
  const p = Object.fromEntries(parts.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, wd: WD.indexOf(p.weekday) };
}
/** Data e hora de parede em Brasília → instante. */
export function fromSp(y: number, m: number, d: number, h: number, min: number): Date {
  const guess = Date.UTC(y, m - 1, d, h, min), p = sp(new Date(guess));
  return new Date(guess - (Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - guess));
}
const two = (n: number) => String(n).padStart(2, "0");
/** Valor de <input type="datetime-local"> lido sempre como horário de Brasília. */
export const toInput = (d: Date) => { const p = sp(d); return `${p.y}-${two(p.m)}-${two(p.d)}T${two(p.h)}:${two(p.min)}`; };
export function fromInput(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  return m ? fromSp(+m[1], +m[2], +m[3], +m[4], +m[5]) : null;
}
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
/** "24/11 às 09h30" */
export const shortLabel = (d: Date) => { const p = sp(d); return `${two(p.d)}/${two(p.m)} às ${two(p.h)}h${two(p.min)}`; };
/** "14:32" em Brasília */
export const hhmm = (d: Date) => { const p = sp(d); return `${two(p.h)}:${two(p.min)}`; };
/** "segunda, 24/11/2026 às 09:30" */
export const longLabel = (d: Date) => { const p = sp(d); return `${DIAS[p.wd]}, ${two(p.d)}/${two(p.m)}/${p.y} às ${two(p.h)}:${two(p.min)}`; };

export function inWindow(d: Date) { const p = sp(d), t = p.h * 60 + p.min; return p.wd >= WINDOW.first && p.wd <= WINDOW.last && t >= WINDOW.start && t < WINDOW.end; }
/** Próximo instante permitido a partir de `d` (o próprio `d`, se já estiver na janela). */
export function nextWindow(d: Date): Date {
  if (inWindow(d)) return d;
  let p = sp(d);
  let day = p.h * 60 + p.min < WINDOW.start ? fromSp(p.y, p.m, p.d, 8, 0) : fromSp(p.y, p.m, p.d + 1, 8, 0);
  for (let i = 0; i < 8 && !inWindow(day); i++) { p = sp(day); day = fromSp(p.y, p.m, p.d + 1, 8, 0); }
  return day;
}
export interface SchedulePlan { ok: boolean; immediate: boolean; sendAt?: Date; reason?: string; suggestion?: Date }
/** Decide quando a campanha sai. Usado na tela e de novo na confirmação. */
export function planSend(when: "agora" | "agendar", scheduledAt: string, now = realNow()): SchedulePlan {
  if (when === "agora") {
    if (inWindow(now)) return { ok: true, immediate: true, sendAt: now };
    const next = nextWindow(now);
    return { ok: true, immediate: false, sendAt: next, reason: `Agora está fora do horário permitido (${WINDOW.text}, ${TZ_LABEL}). O envio será agendado para ${longLabel(next)}.` };
  }
  const at = scheduledAt ? new Date(scheduledAt) : null;
  if (!at || Number.isNaN(at.getTime())) return { ok: false, immediate: false, reason: "Escolha data e hora do envio." };
  if (at.getTime() < now.getTime() + MIN_LEAD_MS) return { ok: false, immediate: false, reason: "Esta data e hora já passaram. Escolha um horário pelo menos 5 minutos à frente.", suggestion: suggestFrom(now) };
  if (!inWindow(at)) return { ok: false, immediate: false, reason: `Fora do horário permitido: ${WINDOW.text}.`, suggestion: nextWindow(at) < now ? suggestFrom(now) : nextWindow(at) };
  return { ok: true, immediate: false, sendAt: at };
}
