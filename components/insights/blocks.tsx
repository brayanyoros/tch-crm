"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarPlus, Info, MessageSquare } from "lucide-react";
import type { DealView, Settings, Stage, User } from "@/lib/data/types";
import { duration, HOUR, money, now, pct, plural } from "@/lib/format";
import { lossLabel, monthName, type Change, type GoalStatus } from "@/lib/insights";
import { PRIORITY_LABEL, type Priority, type PriorityKind } from "@/lib/priorities";
import { can } from "@/lib/permissions";
import { useApp } from "@/store/app";
import { Avatar, Popover, Skeleton } from "@/components/ui";
import { TaskDialog } from "@/components/tarefas/TaskDialog";
import { useDrill } from "./parts";

export const CARD = "rounded-[12px] border border-line bg-surface p-5";
export const pct1 = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
export const days1 = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${v === 1 ? "dia" : "dias"}`;
const short = (v: number) => (v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil` : money(v));

export function Formula({ children, label }: { children: ReactNode; label: string }) {
  return <Popover width={300} align="end" trigger={<button type="button" aria-label={`Como é calculado: ${label}`} className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-tx2 hover:bg-sel hover:text-tx"><Info size={14} strokeWidth={1.5} /></button>}><div className="p-3.5 text-[13px] leading-[19px] text-tx3">{children}</div></Popover>;
}
export function ChangeText({ ch, lowerIsBetter, prevLabel }: { ch: Change | null | undefined; lowerIsBetter?: boolean; prevLabel: string }) {
  if (ch === undefined) return null;
  if (!ch) return <span className="text-tx2">Sem dado para comparar</span>;
  if (ch.kind === "sem_base") return <span className="text-tx2">Sem base comparável em {prevLabel}</span>;
  if (ch.kind === "igual" || Math.round(ch.value * 100) === 0) return <span className="text-tx2">Igual a {prevLabel}</span>;
  const good = (ch.value > 0) !== !!lowerIsBetter;
  return <span><b className={`font-semibold ${good ? "text-positive" : "text-alert"}`}>{ch.value > 0 ? "+" : "−"}{pct(Math.abs(ch.value))}</b> <span className="text-tx2">vs. {prevLabel}</span></span>;
}
/** Card de indicador: valor, comparação, fórmula e acesso aos registros. */
export function Kpi({ label, value, empty, sub, ch, lowerIsBetter, prevLabel, formula, deals, note, accent }: { label: string; value: ReactNode | null; empty?: string; sub?: ReactNode; ch?: Change | null; lowerIsBetter?: boolean; prevLabel: string; formula: ReactNode; deals?: DealView[]; note?: string; accent?: boolean }) {
  const drill = useDrill();
  return (
    <article className={`${CARD} relative flex min-w-0 flex-col gap-1`}>
      {accent && <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 bg-gold" />}
      <header className="flex items-center gap-2"><h3 className="flex-1 text-[13px] font-medium text-tx2">{label}</h3><Formula label={label}>{formula}</Formula></header>
      {value === null ? <p className="py-1.5 text-[15px] text-tx2">{empty}</p>
        : deals ? <button type="button" onClick={() => drill(label, deals, note)} aria-label={`${label}: ver registros`} className="self-start rounded-tag text-left text-[30px] font-semibold leading-9 tracking-[-0.02em] tnum decoration-line2 underline-offset-4 hover:underline">{value}</button>
        : <p className="text-[30px] font-semibold leading-9 tracking-[-0.02em] tnum">{value}</p>}
      {sub && <p className="text-[13px] text-tx2 tnum">{sub}</p>}
      <p className="text-[13px] tnum"><ChangeText ch={ch} lowerIsBetter={lowerIsBetter} prevLabel={prevLabel} /></p>
    </article>
  );
}
export const KpiSkeleton = ({ n = 4 }: { n?: number }) => <div role="status" aria-label="Carregando indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: n }, (_, i) => <div key={i} className={CARD}><Skeleton className="h-3 w-24" /><Skeleton className="mt-3 h-8 w-32" /><Skeleton className="mt-3 h-3 w-40" /></div>)}</div>;

/* ---------- meta ---------- */
export function GoalBlock({ gs, won, wonDeals, scope, globalGoal, todayLabel }: { gs: GoalStatus; won: number; wonDeals: DealView[]; scope: "global" | "vendedor" | "suspensa"; globalGoal: number | null; todayLabel: string }) {
  const user = useApp((s) => s.user), drill = useDrill(), edit = can(user, "goals");
  const expected = gs.totalDays ? gs.elapsedDays / gs.totalDays : 0, month = monthName(gs.key);
  const head = <div className="min-w-0"><p className="text-[13px] font-medium text-tx2">Vendas ganhas em {month}</p><button type="button" onClick={() => drill(`Vendas ganhas em ${month}`, wonDeals, "Negócios marcados como ganhos com fechamento neste mês, até o corte dos dados.")} className="rounded-tag text-left text-[34px] font-semibold leading-10 tracking-[-0.025em] tnum decoration-line2 underline-offset-4 hover:underline">{money(won)}</button><p className="text-[13px] text-tx2 tnum">{plural(wonDeals.length, "negócio")} · até {todayLabel}</p></div>;
  if (scope === "suspensa" || gs.goal === null) return (
    <section aria-label="Meta do mês" className={`${CARD} flex flex-wrap items-center gap-x-10 gap-y-4`}>
      {head}
      <div className="min-w-60 flex-1 text-[14px] leading-[21px]">
        {scope === "suspensa" ? <p className="text-tx2">Comparação com a meta suspensa: não existe meta para este recorte de filtros.{globalGoal ? ` A meta global do mês é ${money(globalGoal)}.` : ""}</p>
          : <><p className="font-medium">Sem meta cadastrada para {month}.</p><p className="text-tx2">{edit ? "Defina a meta do mês para acompanhar o ritmo. Referência do planejamento TCH: meta de R$ 300.000 e supermeta de R$ 500.000." : "Peça a um gestor para cadastrar a meta do mês."}</p></>}
      </div>
      {edit && scope !== "suspensa" && <Link href={`/configuracoes/metas?mes=${gs.key}`} className="inline-flex h-10 items-center rounded-card bg-gold px-4 text-[14px] font-semibold text-[var(--ink)] hover:bg-[var(--gold-lt)]">Definir meta</Link>}
    </section>
  );
  const k = gs.pct ?? 0, ahead = k - expected;
  return (
    <section aria-label="Meta do mês" className={CARD}>
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        {head}
        <dl className="grid min-w-0 flex-1 basis-full grid-cols-2 gap-x-8 gap-y-3 text-[14px] sm:grid-cols-4 lg:basis-0">
          <div><dt className="text-[13px] text-tx2">{scope === "vendedor" ? "Meta do vendedor" : "Meta do mês"}</dt><dd className="t-val">{money(gs.goal)}</dd></div>
          <div><dt className="text-[13px] text-tx2">Atingido</dt><dd className="t-val">{pct1(k)}</dd></div>
          <div><dt className="text-[13px] text-tx2">{gs.remaining ? "Falta" : "Meta batida"}</dt><dd className="t-val">{gs.remaining ? money(gs.remaining) : `+${money(won - gs.goal)}`}</dd></div>
          <div><dt className="text-[13px] text-tx2">{gs.ended ? "Mês" : "Ritmo necessário"}</dt><dd className="t-val">{gs.ended ? "Encerrado" : gs.remaining === 0 ? "—" : gs.pace !== null ? `${money(gs.pace)}/dia` : "—"}</dd></div>
        </dl>
      </div>
      <div className="mt-5">
        <div role="progressbar" aria-label={`Meta: ${pct1(k)} atingido; esperado ${pct1(expected)} pelo calendário`} aria-valuenow={Math.round(k * 100)} aria-valuemin={0} aria-valuemax={100} className="relative h-2 rounded-full bg-surface2">
          <span className="block h-full rounded-full bg-gold" style={{ width: `${Math.min(1, k) * 100}%` }} />
          {!gs.ended && <span aria-hidden className="absolute -top-1 h-4 w-0.5 bg-tx" style={{ left: `${expected * 100}%` }} />}
        </div>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-tx2 tnum">
          <span>{gs.ended ? "Sem dias comerciais restantes" : `${plural(gs.daysLeft, "dia comercial restante", "dias comerciais restantes")}${gs.todayCounts ? ", contando hoje" : ", sem contar hoje"}`}</span>
          {!gs.ended && <span>Marca: ritmo esperado pelo calendário ({pct1(expected)}). {ahead >= 0 ? "Acima do ritmo." : `Abaixo do ritmo em ${pct1(-ahead)}.`}</span>}
          {gs.superGoal && <span>Supermeta {money(gs.superGoal)}: {pct1(won / gs.superGoal)}</span>}
        </p>
      </div>
    </section>
  );
}
/* ---------- evolução ---------- */
interface Point { day: string; d: number; realizado: number | null; meta: number | null }
interface TipP { active?: boolean; label?: string | number; payload?: readonly { payload?: Point }[] }
function Tip({ active, payload }: TipP) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return <div className="rounded-ctl border bg-surface px-3 py-2 text-[13px] shadow-pop tnum"><p className="text-tx2">{p.day}</p><p>Realizado: <b className="font-semibold">{p.realizado === null ? "sem dados (futuro)" : money(p.realizado)}</b></p>{p.meta !== null && <p>Meta acumulada: {money(p.meta)}</p>}{p.meta !== null && p.realizado !== null && <p className={p.realizado >= p.meta ? "text-positive" : "text-alert"}>Diferença: {p.realizado >= p.meta ? "+" : "−"}{money(Math.abs(p.realizado - p.meta))}</p>}</div>;
}
export function SalesChart({ data, cutoff, hasGoal }: { data: Point[]; cutoff: string; hasGoal: boolean }) {
  const [table, setTable] = useState(false);
  const axis = { fill: "var(--tx2)", fontSize: 12 };
  const last = [...data].reverse().find((x) => x.realizado !== null);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
        <span className="inline-flex items-center gap-2"><svg width="22" height="4" aria-hidden><line x1="0" x2="22" y1="2" y2="2" stroke="var(--gold)" strokeWidth="2.5" /></svg>Realizado acumulado</span>
        {hasGoal && <span className="inline-flex items-center gap-2"><svg width="22" height="4" aria-hidden><line x1="0" x2="22" y1="2" y2="2" stroke="var(--tx2)" strokeWidth="2" strokeDasharray="5 4" /></svg>Meta acumulada (pelos dias comerciais)</span>}
        <button type="button" className="ml-auto rounded-tag text-tx2 underline underline-offset-4 hover:text-tx" aria-expanded={table} onClick={() => setTable(!table)}>{table ? "Ver gráfico" : "Ver em tabela"}</button>
      </div>
      {table ? (
        <div className="max-h-72 overflow-y-auto"><table className="w-full text-[13px] tnum"><caption className="sr-only">Vendas acumuladas por dia</caption><thead><tr className="border-b text-left text-tx2"><th scope="col" className="py-1.5 font-medium">Dia</th><th scope="col" className="py-1.5 text-right font-medium">Realizado</th>{hasGoal && <th scope="col" className="py-1.5 text-right font-medium">Meta</th>}</tr></thead><tbody>{data.map((x) => <tr key={x.d} className="border-b"><td className="py-1.5">{x.day}</td><td className="py-1.5 text-right">{x.realizado === null ? "—" : money(x.realizado)}</td>{hasGoal && <td className="py-1.5 text-right">{x.meta === null ? "—" : money(x.meta)}</td>}</tr>)}</tbody></table></div>
      ) : (
        <div className="h-64" role="img" aria-label={`Vendas acumuladas até ${cutoff}: ${money(last?.realizado ?? 0)}${hasGoal && last?.meta ? `; meta acumulada no mesmo dia: ${money(last.meta)}` : ""}.`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={64} tickFormatter={short} />
              <Tooltip content={Tip} cursor={{ stroke: "var(--line2)" }} />
              {last && <ReferenceLine x={last.day} stroke="var(--line2)" strokeDasharray="2 3" label={{ value: `Dados até ${cutoff}`, position: "insideTopRight", fill: "var(--tx2)", fontSize: 11 }} />}
              {hasGoal && <Line isAnimationActive={false} type="linear" dataKey="meta" name="Meta" stroke="var(--tx2)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />}
              <Line isAnimationActive={false} type="stepAfter" dataKey="realizado" name="Realizado" stroke="var(--gold)" strokeWidth={2.5} dot={false} connectNulls={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
/* ---------- funil ---------- */
export function CohortFunnel({ steps, n, small, range }: { steps: { stage: Stage; deals: DealView[] }[]; n: number; small: boolean; range: string }) {
  const drill = useDrill(), max = Math.max(1, n);
  if (!n) return <p className="text-[14px] text-tx2">Sem leads criados no período: a conversão entre etapas fica indisponível.</p>;
  return (
    <div>
      <p className="mb-3 text-[13px] leading-[19px] text-tx2">Coorte: {plural(n, "lead criado", "leads criados")} em {range}, observados até hoje. Cada negócio conta uma vez; etapa pulada conta como passada.</p>
      {small && <p className="mb-3 text-[13px] text-alert">Amostra pequena: as taxas podem variar muito.</p>}
      <ol className="flex flex-col gap-1">
        {steps.map((x, i) => (
          <li key={x.stage.id}>
            {i > 0 && <p className="tnum py-0.5 pl-[136px] text-[12px] text-tx2 max-sm:pl-0">{steps[i - 1].deals.length ? `${pct(x.deals.length / steps[i - 1].deals.length)} seguiram (${x.deals.length} de ${steps[i - 1].deals.length})` : "—"}</p>}
            <button type="button" onClick={() => drill(`Chegaram a ${x.stage.name}`, x.deals, `${x.deals.length} de ${n} leads criados em ${range} chegaram a ${x.stage.name}.`)} className="grid w-full grid-cols-[124px_1fr_auto] items-center gap-3 rounded-tag text-left hover:bg-sel">
              <span className="truncate text-[14px]">{x.stage.name}</span>
              <span className="h-5 overflow-hidden rounded-tag bg-surface2"><span className={`block h-full ${i === steps.length - 1 ? "bg-gold" : "bg-tx2/70"}`} style={{ width: `${(x.deals.length / max) * 100}%`, minWidth: x.deals.length ? 2 : 0 }} /></span>
              <span className="t-val min-w-9 text-right">{x.deals.length}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-3 flex justify-between border-t border-line pt-2.5 text-[14px]"><span className="text-tx2">Da entrada ao ganho</span><span className="t-val">{pct1((steps.at(-1)?.deals.length ?? 0) / n)}</span></p>
    </div>
  );
}
export function Distribution({ rows, refLabel }: { rows: { stage: Stage; deals: DealView[] }[]; refLabel: string }) {
  const drill = useDrill(), max = Math.max(1, ...rows.map((r) => r.deals.reduce((a, d) => a + d.value, 0)));
  const total = rows.flatMap((r) => r.deals);
  return (
    <div>
      <p className="mb-3 text-[13px] text-tx2">Negócios abertos em cada etapa em {refLabel}. Não é taxa de conversão.</p>
      <ul className="flex flex-col gap-2">{rows.map((r) => { const v = r.deals.reduce((a, d) => a + d.value, 0); return (
        <li key={r.stage.id}><button type="button" onClick={() => drill(`Abertos em ${r.stage.name}`, r.deals, `Negócios abertos agora em ${r.stage.name} (${refLabel}).`)} className="grid w-full grid-cols-[124px_1fr_auto] items-center gap-3 rounded-tag text-left hover:bg-sel">
          <span className="truncate text-[14px]">{r.stage.name}</span><span className="h-5 overflow-hidden rounded-tag bg-surface2"><span className="block h-full bg-tx2/70" style={{ width: `${(v / max) * 100}%`, minWidth: v ? 2 : 0 }} /></span><span className="tnum min-w-[116px] text-right text-[13px]"><b className="font-semibold">{r.deals.length}</b> · {money(v)}</span>
        </button></li>); })}</ul>
      <p className="mt-3 flex justify-between border-t border-line pt-2.5 text-[14px] tnum"><span className="text-tx2">Total aberto</span><span className="font-semibold">{total.length} · {money(total.reduce((a, d) => a + d.value, 0))}</span></p>
    </div>
  );
}
/* ---------- perdas ---------- */
export function LossReasons({ lost, range }: { lost: DealView[]; range: string }) {
  const drill = useDrill();
  if (!lost.length) return <p className="text-[14px] text-tx2">Nenhum negócio marcado como perdido em {range}.</p>;
  const groups = [...lost.reduce((m, d) => m.set(lossLabel(d.lostReason), [...(m.get(lossLabel(d.lostReason)) ?? []), d]), new Map<string, DealView[]>())].sort((a, b) => b[1].length - a[1].length), max = groups[0][1].length;
  return (
    <div>
      <ul className="flex flex-col gap-2">{groups.map(([k, ds]) => (
        <li key={k}><button type="button" onClick={() => drill(`Perdidos: ${k}`, ds, `${ds.length} de ${lost.length} negócios perdidos em ${range} com o motivo registrado “${k}”.`)} className="grid w-full grid-cols-[124px_1fr_auto] items-center gap-3 rounded-tag text-left hover:bg-sel">
          <span className="truncate text-[14px]">{k}</span><span className="h-4 overflow-hidden rounded-tag bg-surface2"><span className="block h-full bg-tx2/70" style={{ width: `${(ds.length / max) * 100}%` }} /></span><span className="tnum min-w-[150px] text-right text-[13px]"><b className="font-semibold">{ds.length}</b> · {pct(ds.length / lost.length)} · {money(ds.reduce((a, d) => a + d.value, 0))}</span>
        </button></li>))}</ul>
      <p className="mt-3 text-[12.5px] text-tx2">Motivo como foi registrado ao marcar a perda. “Sem retorno” corresponde ao motivo “Sumiu”.</p>
    </div>
  );
}
/* ---------- prioridades ---------- */
export function Priorities({ items, users, settings, exception }: { items: Priority[] | undefined; users: User[]; settings?: Settings; exception?: string }) {
  const [all, setAll] = useState(false), [kind, setKind] = useState<PriorityKind | "">(""), [task, setTask] = useState<Priority | null>(null);
  if (!items) return <div role="status" aria-label="Carregando prioridades" className="flex flex-col gap-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>;
  const list = items.filter((x) => !kind || x.kind === kind), shown = all ? list : list.slice(0, 5);
  const counts = (Object.keys(PRIORITY_LABEL) as PriorityKind[]).map((k) => [k, items.filter((x) => x.kind === k).length] as const).filter(([, n]) => n);
  const order = (settings?.priorityOrder ?? []).map((k) => PRIORITY_LABEL[k as PriorityKind]).filter(Boolean);
  return (
    <div>
      {counts.length > 0 && <div role="group" aria-label="Filtrar por motivo" className="mb-3 flex flex-wrap gap-1.5">{[["", items.length] as const, ...counts].map(([k, n]) => <button key={k || "todos"} type="button" aria-pressed={kind === k} onClick={() => { setKind(k as PriorityKind | ""); setAll(false); }} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] ${kind === k ? "border-gold bg-sel font-medium" : "border-line text-tx2 hover:text-tx"}`}>{k ? PRIORITY_LABEL[k as PriorityKind] : "Todas"}<span className="tnum text-tx2">{n}</span></button>)}</div>}
      {!list.length ? <p className="py-6 text-center text-[14px] text-tx2">Nada pendente agora{kind ? " neste motivo" : ""}.</p> : (
        <ul className="flex flex-col">{shown.map((x) => { const owner = users.find((u) => u.id === x.ownerId) ?? null; const late = x.kind === "aguardando" && !!settings && now().getTime() - Date.parse(x.since) > settings.limits.replyH * HOUR; return (
          <li key={x.id} className="grid items-center gap-x-4 gap-y-2 border-b border-line py-3 last:border-0 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-2"><span className="text-[14px] font-semibold">{x.name}</span>{x.deal && <span className="text-[12.5px] text-tx2">{x.deal.stage.name} · {money(x.deal.value)}</span>}</p>
              <p className={`text-[13px] ${x.kind === "aguardando" || x.kind === "tarefa_vencida" ? "text-alert" : "text-tx3"}`}>{x.reason}</p>
              {x.lastClient && <p className="mt-0.5 line-clamp-1 text-[13px] text-tx2">Cliente: “{x.lastClient.text || (x.lastClient.attachment ? "anexo" : "")}”</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-[13px] text-tx2"><Avatar user={owner} size={20} /><span className="max-sm:hidden">{owner?.name.split(" ")[0] ?? "Sem dono"}</span></span>
              <span className={`tnum w-24 text-right text-[13px] ${late ? "font-medium text-alert" : "text-tx2"}`}><WaitSince iso={x.since} kind={x.kind} /></span>
              {x.conversationId && (x.kind === "aguardando" || x.kind === "proposta_sem_retorno") ? <Link href={`/conversas/${x.conversationId}`} className="inline-flex h-8 items-center gap-1.5 rounded-ctl border border-line px-2.5 text-[13px] font-medium hover:border-line2"><MessageSquare size={14} strokeWidth={1.5} aria-hidden />Abrir conversa</Link>
                : x.kind === "sem_atividade" || x.kind === "fechamento_proximo" ? <button type="button" onClick={() => setTask(x)} className="inline-flex h-8 items-center gap-1.5 rounded-ctl border border-line px-2.5 text-[13px] font-medium hover:border-line2"><CalendarPlus size={14} strokeWidth={1.5} aria-hidden />Agendar retorno</button>
                : x.deal ? <Link href={`/funil?negocio=${x.deal.id}`} className="inline-flex h-8 items-center rounded-ctl border border-line px-2.5 text-[13px] font-medium hover:border-line2">Abrir negócio</Link> : <Link href="/tarefas" className="inline-flex h-8 items-center rounded-ctl border border-line px-2.5 text-[13px] font-medium hover:border-line2">Ver tarefa</Link>}
            </div>
          </li>); })}</ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-tx2">
        {list.length > 5 && <button type="button" className="font-medium text-tx underline underline-offset-4" onClick={() => setAll(!all)}>{all ? "Mostrar só as 5 primeiras" : `Ver todas (${list.length})`}</button>}
        <span>Ordem: {order.join(" › ")}; empate por quem espera há mais tempo. Cada lead aparece uma vez.</span>
        {exception && <span>{exception}</span>}
      </div>
      <TaskDialog open={!!task} onClose={() => setTask(null)} preset={{ title: task ? `Retorno para ${task.name}` : "", dealId: task?.deal?.id, contactId: task?.contactId, ownerId: task?.ownerId ?? undefined }} />
    </div>
  );
}
/** Espera ou atraso, no relógio dos dados. */
function WaitSince({ iso, kind }: { iso: string; kind: PriorityKind }) {
  const ms = Math.max(0, now().getTime() - new Date(iso).getTime());
  if (kind === "fechamento_proximo") return <>{iso.slice(8, 10)}/{iso.slice(5, 7)}</>;
  return <>{kind === "tarefa_vencida" ? "atrasada " : ""}{duration(ms)}</>;
}
