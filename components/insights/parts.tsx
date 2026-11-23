"use client";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DealView } from "@/lib/data/types";
import { money, pct, plural } from "@/lib/format";
import { byDay, sum, type Range } from "@/lib/insights";
import { ChannelIcon, Drawer, EmptyState } from "@/components/ui";

/* ---------- detalhar: negócios por trás de qualquer número ---------- */
/** `note`: critério e, em taxas, numerador e denominador. */
type Drill = (title: string, deals: DealView[], note?: string) => void;
const Ctx = createContext<Drill>(() => {});
export const useDrill = () => useContext(Ctx);
export function DrillProvider({ children }: { children: ReactNode }) {
  const [s, set] = useState<{ title: string; deals: DealView[]; note?: string } | null>(null);
  const router = useRouter();
  return (
    <Ctx.Provider value={(title, deals, note) => set({ title, deals, note })}>
      {children}
      <Drawer open={!!s} onClose={() => set(null)} title={s?.title ?? ""}>
        {s?.note && <p className="border-b px-5 py-3 text-[13px] leading-[19px] text-tx2">{s.note}</p>}
        {s && (s.deals.length === 0 ? <EmptyState title="Nenhum negócio neste recorte" /> : (
          <>
            <p className="t-sec tnum border-b px-5 py-2.5">{plural(s.deals.length, "negócio")} · {money(sum(s.deals))}</p>
            <ul>{[...s.deals].sort((a, b) => b.value - a.value).slice(0, 150).map((d) => (
              <li key={d.id}><button type="button" onClick={() => { set(null); router.push(d.status === "perdido" ? `/contatos/${d.contactId}` : `/funil?negocio=${d.id}`); }} className="flex w-full items-center gap-3 border-b px-5 py-2.5 text-left outline-offset-[-2px] hover:bg-bg2"><ChannelIcon type={d.channel} /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{d.contact.name}</span><span className="t-sec block truncate">{d.title} · {d.status === "perdido" ? `Perdido (${d.lostReason})` : d.stage.name}</span></span><span className="t-val">{money(d.value)}</span></button></li>
            ))}</ul>
          </>
        ))}
      </Drawer>
    </Ctx.Provider>
  );
}
/** Número clicável. */
export function Num({ title, deals, children, className = "", note }: { title: string; deals: DealView[]; children: ReactNode; className?: string; note?: string }) {
  const drill = useDrill();
  return <button type="button" aria-label={`${title}: ver negócios`} onClick={(e) => { e.stopPropagation(); drill(title, deals, note); }} className={`tnum rounded-tag decoration-line2 underline-offset-4 hover:underline ${className}`}>{children}</button>;
}
export interface Stat { label: string; value: ReactNode; note?: ReactNode; change?: number | null; lowerIsBetter?: boolean; deals?: DealView[]; highlight?: boolean }
/** Faixa de números em linha, separados por fios verticais. */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-card border border-line border-t-tx bg-surface lg:flex">
      {stats.map((s) => (
        <div key={s.label} className="relative min-w-0 border-b px-4 py-4 odd:border-r lg:flex-1 lg:border-b-0 lg:border-r lg:px-6 lg:last:border-r-0">
          {s.highlight && <span aria-hidden className="absolute inset-x-0 -top-0.5 h-0.5 bg-gold" />}
          <p className="t-label">{s.label}</p>
          <p className="t-num mt-1 truncate max-sm:!text-[22px]">{s.deals ? <Num title={s.label} deals={s.deals} className="max-w-full truncate">{s.value}</Num> : s.value}</p>
          <p className="t-sec tnum mt-0.5">{s.change !== undefined && s.change !== null && Math.round(s.change * 100) !== 0 && <span className={`font-semibold ${(s.change < 0) !== !!s.lowerIsBetter ? "text-alert" : "text-positive"}`}>{s.change >= 0 ? "+" : "−"}{pct(Math.abs(s.change))} </span>}{s.note}</p>
        </div>
      ))}
    </div>
  );
}
export interface Bar { key: string; label: ReactNode; value: number; text: string; deals?: DealView[]; title: string; strong?: boolean }
export function BarList({ bars, width = 148 }: { bars: Bar[]; width?: number }) {
  const max = Math.max(1, ...bars.map((b) => b.value)), drill = useDrill();
  return (
    <ul className="flex flex-col gap-0.5">
      {bars.map((b) => (
        <li key={b.key}>
          <button type="button" disabled={!b.deals} title={`${b.title}: ${b.text}`} onClick={() => b.deals && drill(b.title, b.deals)} className="grid w-full items-center gap-3 rounded-tag py-1 text-left hover:bg-bg2 disabled:cursor-default" style={{ gridTemplateColumns: `minmax(84px, ${width}px) 1fr auto` }}>
            <span className="truncate">{b.label}</span><span className="h-4"><span className={`block h-full rounded-r-tag ${b.strong ? "bg-gold" : "bg-tx2"}`} style={{ width: `${(b.value / max) * 100}%`, minWidth: b.value ? 2 : 0 }} /></span><span className="t-val min-w-14 text-right">{b.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
interface TipProps { active?: boolean; label?: string | number; payload?: readonly { name?: string | number; value?: unknown }[] }
function Tip({ active, label, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-ctl border bg-bg px-3 py-2 shadow-pop"><p className="t-meta text-tx2">{label}</p>{payload.map((p) => <p key={String(p.name)} className="tnum flex justify-between gap-5"><span>{p.name}</span><b className="font-semibold">{String(p.value)}</b></p>)}</div>;
}
export function ChannelLines({ deals, range }: { deals: DealView[]; range: Range }) {
  const data = byDay(deals, range), drill = useDrill();
  const wa = deals.filter((d) => d.channel === "whatsapp"), ig = deals.filter((d) => d.channel === "instagram");
  const axis = { fill: "var(--tx2)", fontSize: 11 };
  return (
    <div>
      <div className="mb-2 flex gap-5">
        {([["whatsapp", "WhatsApp", wa, "0"], ["instagram", "Instagram", ig, "5 4"]] as const).map(([k, l, d, dash]) => <button key={k} type="button" onClick={() => drill(`Leads do ${l}`, d)} className="flex items-center gap-2 rounded-tag hover:underline"><svg width="22" height="4" aria-hidden><line x1="0" x2="22" y1="2" y2="2" strokeWidth="2" strokeDasharray={dash} stroke={k === "whatsapp" ? "var(--gold)" : "var(--tx2)"} /></svg>{l}<b className="tnum font-semibold">{d.length}</b></button>)}
      </div>
      <div className="h-56" role="img" aria-label={`Leads por dia: WhatsApp ${wa.length}, Instagram ${ig.length} no período`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={28} />
            <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
            <Tooltip content={Tip} cursor={{ stroke: "var(--line2)" }} />
            <Area isAnimationActive={false} type="linear" dataKey="whatsapp" name="WhatsApp" stroke="var(--gold)" fill="var(--gold)" fillOpacity={0.08} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} />
            <Line isAnimationActive={false} type="linear" dataKey="instagram" name="Instagram" stroke="var(--tx2)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2, strokeDasharray: "0" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"], HOURS = Array.from({ length: 16 }, (_, i) => i + 8);
export function Heatmap({ deals }: { deals: DealView[] }) {
  const drill = useDrill();
  const cell = (d: number, h: number) => deals.filter((x) => { const t = new Date(x.createdAt); return (t.getDay() + 6) % 7 === d && t.getHours() === h; });
  const grid = DAYS.map((_, d) => HOURS.map((h) => cell(d, h))), max = Math.max(1, ...grid.flat().map((c) => c.length));
  return (
    <div className="overflow-x-auto pb-1">
      <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-0.5"><caption className="sr-only">Contatos recebidos por dia e hora</caption>
        <thead><tr><th className="w-10" />{HOURS.map((h) => <th key={h} scope="col" className="t-meta tnum text-tx2">{h}h</th>)}</tr></thead>
        <tbody>{grid.map((row, d) => <tr key={DAYS[d]}><th scope="row" className="t-meta text-left text-tx2">{DAYS[d]}</th>{row.map((c, i) => { const k = c.length / max; return <td key={i} className="p-0"><button type="button" title={`${DAYS[d]}, ${HOURS[i]}h: ${plural(c.length, "contato")}`} onClick={() => drill(`${DAYS[d]}, ${HOURS[i]}h`, c)} className={`tnum t-meta h-7 w-full rounded-tag ${k > 0.5 ? "text-oninv" : "text-tx"}`} style={{ background: c.length ? `color-mix(in srgb, var(--inv) ${Math.round(k > 0.5 ? 55 + k * 45 : 6 + k * 36)}%, var(--bg))` : "var(--bg2)" }}>{c.length || ""}</button></td>; })}</tr>)}</tbody>
      </table>
    </div>
  );
}
