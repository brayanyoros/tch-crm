"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ConversationView, DealView, Settings, Stage, User } from "@/lib/data/types";
import type { CampaignView } from "@/lib/data/repositories";
import { agoMs, DAY, duration, HOUR, int, money, moneyCents, now, pct, plural } from "@/lib/format";
import { avg, delta, groupBy, negotiating, open, proposals, reachedAt, sum, won, type Range } from "@/lib/insights";
import { Avatar, Badge, CHANNEL, ChannelIcon, EmptyState, Section, Table, type Col } from "@/components/ui";
import { preview } from "@/components/conversas/ConversationList";
import { BarList, ChannelLines, Funnel, Heatmap, Num, StatStrip } from "./parts";

export interface PanelData { cur: DealView[]; prev: DealView[]; compare: boolean; stages: Stage[]; sellers: User[]; settings: Settings; convs: ConversationView[]; range: Range; team: boolean; campaigns: CampaignView[] }
const mins = (v: number) => `${Math.round(v)} min`;
const reply = (ds: DealView[]) => avg(ds.filter((d) => d.firstReplyMin > 0).map((d) => d.firstReplyMin));
const vs = (p: PanelData, f: (ds: DealView[]) => number) => (p.compare ? delta(f(p.cur), f(p.prev)) : undefined);
const note = (p: PanelData, extra = "") => [p.compare ? "vs. período anterior" : "", extra].filter(Boolean).join(" · ");

interface SellerRow { id: string; user: User; leads: DealView[]; props: DealView[]; closed: DealView[]; goal: number }
const sellerRows = (p: PanelData): SellerRow[] => p.sellers.map((u) => { const leads = p.cur.filter((d) => d.ownerId === u.id); return { id: u.id, user: u, leads, props: proposals(leads), closed: won(leads), goal: p.settings.goals[u.id] ?? 0 }; }).filter((r) => r.leads.length);
const sellerCols: Col<SellerRow>[] = [
  { key: "n", label: "Responsável", render: (r) => <span className="inline-flex items-center gap-2 whitespace-nowrap"><Avatar user={r.user} size={22} />{r.user.name}</span>, sort: (r) => r.user.name },
  { key: "l", label: "Leads", right: true, render: (r) => <Num title={`Leads de ${r.user.name}`} deals={r.leads}>{r.leads.length}</Num>, sort: (r) => r.leads.length },
  { key: "r", label: "1ª resposta", right: true, render: (r) => mins(reply(r.leads)), sort: (r) => reply(r.leads) },
  { key: "p", label: "Propostas", right: true, render: (r) => <Num title={`Propostas de ${r.user.name}`} deals={r.props}>{r.props.length}</Num>, sort: (r) => r.props.length },
  { key: "f", label: "Fechado", right: true, render: (r) => <Num title={`Fechados de ${r.user.name}`} deals={r.closed} className="font-semibold">{money(sum(r.closed))}</Num>, sort: (r) => sum(r.closed) },
];

export function Resumo(p: PanelData) {
  const w = won(p.cur), neg = negotiating(p.cur, p.stages), router = useRouter();
  const waiting = p.convs.filter((v) => v.waitingSince).sort((a, b) => a.waitingSince!.localeCompare(b.waitingSince!));
  return (
    <>
      <StatStrip stats={[
        { label: "Leads novos", value: int(p.cur.length), change: vs(p, (d) => d.length), note: note(p), deals: p.cur },
        { label: "Tempo médio da 1ª resposta", value: mins(reply(p.cur)), note: "meta 15 min", deals: p.cur },
        { label: "Em negociação", value: money(sum(neg)), note: plural(neg.length, "negócio"), deals: neg },
        { label: "Fechados", value: money(sum(w)), note: plural(w.length, "negócio"), change: vs(p, (d) => sum(won(d))), deals: w, highlight: true },
      ]} />
      <div className="grid gap-x-12 gap-y-10 pt-9 xl:grid-cols-2">
        <Section card title="Funil de conversão"><Funnel deals={p.cur} stages={p.stages} /></Section>
        <Section card title={<span className="inline-flex items-center gap-2">Precisam de resposta agora <Badge n={waiting.length} /></span>} aside={<Link href="/conversas?aba=nao-lidas" className="t-sec underline-offset-4 hover:underline">Ver todas</Link>}>
          {waiting.length === 0 ? <EmptyState title="Tudo respondido" text="Nenhum cliente espera resposta agora." /> : <ul>{waiting.map((v) => { const ms = agoMs(v.waitingSince!); return (
            <li key={v.id}><button type="button" onClick={() => router.push(`/conversas/${v.id}`)} className="flex w-full items-center gap-3 border-b px-1 py-2 text-left hover:bg-bg2"><ChannelIcon type={v.channel} /><span className="w-32 shrink-0 truncate font-medium">{v.contact.name}</span><span className="t-sec min-w-0 flex-1 truncate">{preview(v)}</span><Avatar user={v.owner} size={20} /><span className={`t-meta tnum w-[74px] text-right ${ms > p.settings.limits.replyH * HOUR ? "text-alert" : "text-tx2"}`}>{duration(ms)}</span></button></li>
          ); })}</ul>}
        </Section>
        <Section card title="Leads por canal"><ChannelLines deals={p.cur} range={p.range} /></Section>
        <Section card title={p.team ? "Por responsável" : "Seus números"}><Table caption="Por responsável" cols={sellerCols} rows={sellerRows(p)} initialSort={{ key: "f", desc: true }} /></Section>
      </div>
    </>
  );
}
export function Vendas(p: PanelData) {
  const w = won(p.cur), op = open(p.cur), neg = negotiating(p.cur, p.stages), lost = p.cur.filter((d) => d.status === "perdido");
  const days = avg(w.map((d) => (new Date(d.closedAt!).getTime() - new Date(d.createdAt).getTime()) / DAY)), forecast = op.reduce((a, d) => a + (d.value * d.stage.chance) / 100, 0);
  return (
    <>
      <StatStrip stats={[{ label: "Fechado", value: money(sum(w)), change: vs(p, (d) => sum(won(d))), note: plural(w.length, "negócio"), deals: w, highlight: true }, { label: "Em negociação", value: money(sum(neg)), note: plural(neg.length, "negócio"), deals: neg }, { label: "Ticket médio", value: money(w.length ? sum(w) / w.length : 0), change: vs(p, (d) => (won(d).length ? sum(won(d)) / won(d).length : 0)), note: "por venda", deals: w }, { label: "Tempo até fechar", value: `${days.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`, note: "média por venda", deals: w }, { label: "Previsão", value: money(forecast), note: "valor × chance da etapa", deals: op }]} />
      <div className="grid gap-x-12 gap-y-10 pt-9 xl:grid-cols-2">
        <Section card title="Conversão por etapa"><Funnel deals={p.cur} stages={p.stages} /></Section>
        <Section card title="Motivos de perda">{lost.length ? <BarList bars={groupBy(lost, (d) => d.lostReason ?? "Outro").sort((a, b) => b[1].length - a[1].length).map(([k, d]) => ({ key: k, label: k, value: d.length, text: `${d.length} · ${pct(d.length / lost.length)}`, deals: d, title: `Perdidos por ${k.toLowerCase()}` }))} /> : <EmptyState title="Nenhuma perda no período" />}</Section>
        <Section card title="Previsão por etapa" className="xl:col-span-2"><BarList width={220} bars={p.stages.slice(0, -1).map((s) => { const d = op.filter((x) => x.stageId === s.id); return { key: s.id, label: <>{s.name} <span className="t-sec tnum">{s.chance}%</span></>, value: sum(d) * s.chance, text: money((sum(d) * s.chance) / 100), deals: d, title: `Previsão em ${s.name}` }; })} /></Section>
      </div>
    </>
  );
}
export function Atendimento(p: PanelData) {
  const waiting = p.convs.filter((v) => v.waitingSince), out = p.convs.filter((v) => v.windowEndsAt && new Date(v.windowEndsAt) < now() && v.deal?.status === "aberto");
  const dealsOf = (vs2: ConversationView[]) => vs2.flatMap((v) => v.deal ?? []);
  return (
    <>
      <StatStrip stats={[{ label: "1ª resposta", value: mins(reply(p.cur)), change: vs(p, reply), lowerIsBetter: true, note: "meta 15 min", deals: p.cur, highlight: true }, { label: "Tempo médio de resposta", value: mins(avg(p.cur.map((d) => d.avgReplyMin))), note: "todas as mensagens", deals: p.cur }, { label: "Sem resposta agora", value: int(waiting.length), note: "conversas esperando", deals: dealsOf(waiting) }, { label: "Saíram da janela de 24h", value: int(out.length), note: "com negócio aberto", deals: dealsOf(out) }]} />
      <div className="pt-9"><Section card title="Quando os contatos chegam"><Heatmap deals={p.cur} /></Section></div>
      <div className="grid gap-x-12 gap-y-10 pt-9 xl:grid-cols-2">
        <Section card title="Tempo da 1ª resposta"><BarList bars={([["Até 5 min", 0, 5], ["6 a 10 min", 6, 10], ["11 a 15 min", 11, 15], ["Mais de 15 min", 16, 1e9]] as const).map(([l, a, b]) => { const d = p.cur.filter((x) => x.firstReplyMin >= a && x.firstReplyMin <= b); return { key: l, label: l, value: d.length, text: String(d.length), deals: d, title: l }; })} /></Section>
        <Section card title={p.team ? "1ª resposta por pessoa" : "Sua 1ª resposta"}><BarList bars={sellerRows(p).map((r) => ({ key: r.id, label: r.user.name, value: reply(r.leads), text: mins(reply(r.leads)), deals: r.leads, title: r.user.name }))} /></Section>
      </div>
    </>
  );
}
interface OriginRow { id: string; name: string; deals: DealView[] }
const conv = (d: DealView[]) => (d.length ? won(d).length / d.length : 0);
const originCols = (label: string): Col<OriginRow>[] => [
  { key: "n", label, render: (r) => r.name, sort: (r) => r.name }, { key: "l", label: "Leads", right: true, render: (r) => <Num title={r.name} deals={r.deals}>{r.deals.length}</Num>, sort: (r) => r.deals.length },
  { key: "p", label: "Propostas", right: true, render: (r) => <Num title={`Propostas · ${r.name}`} deals={proposals(r.deals)}>{proposals(r.deals).length}</Num>, sort: (r) => proposals(r.deals).length },
  { key: "v", label: "Vendas", right: true, render: (r) => <Num title={`Vendas · ${r.name}`} deals={won(r.deals)}>{won(r.deals).length}</Num>, sort: (r) => won(r.deals).length },
  { key: "c", label: "Conversão", right: true, render: (r) => `${(conv(r.deals) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, sort: (r) => conv(r.deals) },
  { key: "r", label: "Receita", right: true, render: (r) => <Num title={`Receita · ${r.name}`} deals={won(r.deals)} className="font-semibold">{money(sum(won(r.deals)))}</Num>, sort: (r) => sum(won(r.deals)) },
];
const rowsOf = (ds: DealView[], k: (d: DealView) => string): OriginRow[] => groupBy(ds, k).map(([name, deals]) => ({ id: name, name, deals }));
export function Canais(p: PanelData) {
  const sort = { key: "l", desc: true };
  return <div className="flex flex-col gap-10"><Section card title="Leads por canal"><ChannelLines deals={p.cur} range={p.range} /></Section><Section card title="Por canal"><Table caption="Por canal" cols={originCols("Canal")} rows={rowsOf(p.cur, (d) => CHANNEL[d.channel])} initialSort={sort} /></Section><Section card title="Por origem"><Table caption="Por origem" cols={originCols("Origem")} rows={rowsOf(p.cur, (d) => d.origin)} initialSort={sort} /></Section><Section card title="Anúncios do Meta">{p.cur.some((d) => d.ad) ? <Table caption="Por anúncio" cols={originCols("Anúncio")} rows={rowsOf(p.cur.filter((d) => d.ad), (d) => d.ad!)} initialSort={sort} /> : <EmptyState title="Nenhum lead de anúncio no período" />}</Section></div>;
}
export function Produtos(p: PanelData) {
  return (
    <div className="flex flex-col gap-10">
      <Section card title="Por produto"><Table caption="Por produto" cols={originCols("Produto")} rows={rowsOf(p.cur, (d) => d.product.name)} initialSort={{ key: "l", desc: true }} /></Section>
      <div className="grid gap-x-12 gap-y-10 xl:grid-cols-2">
        <Section card title="Ticket médio por categoria"><BarList bars={groupBy(won(p.cur), (d) => d.product.category).map(([k, d]) => ({ key: k, label: k, value: sum(d) / d.length, text: money(sum(d) / d.length), deals: d, title: `Vendas em ${k}` })).sort((a, b) => b.value - a.value)} /></Section>
        <Section card title="Interesse por categoria"><BarList bars={groupBy(p.cur, (d) => d.product.category).map(([k, d]) => ({ key: k, label: k, value: d.length, text: plural(d.length, "lead"), deals: d, title: `Leads de ${k}` })).sort((a, b) => b.value - a.value)} /></Section>
      </div>
    </div>
  );
}
function Goal({ value, goal, label }: { value: number; goal: number; label: string }) {
  const k = goal ? value / goal : 0;
  return <span className="inline-flex w-full min-w-40 items-center gap-2.5"><span role="progressbar" aria-label={label} aria-valuenow={Math.round(k * 100)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 flex-1 rounded-full bg-surface2"><span className={`block h-full rounded-full ${k >= 1 ? "bg-positive" : k >= 0.7 ? "bg-[var(--stage-prop)]" : "bg-alert"}`} style={{ width: `${Math.min(1, k) * 100}%` }} /></span><span className="t-val w-11 text-right">{pct(k)}</span></span>;
}
export function Equipe(p: PanelData) {
  const w = won(p.cur), goal = p.team ? p.settings.teamGoal : sellerRows(p)[0]?.goal ?? 0;
  return (
    <>
      <StatStrip stats={[{ label: p.team ? "Meta da equipe" : "Sua meta", value: money(goal), note: "no mês" }, { label: "Fechado", value: money(sum(w)), note: goal ? `${pct(sum(w) / goal)} da meta` : "", deals: w, highlight: true }, { label: "Falta", value: money(Math.max(0, goal - sum(w))), note: `${30 - now().getDate()} dias até o fim do mês` }]} />
      <div className="pt-9"><Section card title={p.team ? "Por vendedor" : "Seu mês"}><Table caption="Equipe" rows={sellerRows(p)} initialSort={{ key: "f", desc: true }} cols={[...sellerCols, { key: "m", label: "Meta", right: true, render: (r) => money(r.goal), sort: (r) => r.goal }, { key: "x", label: "% da meta", render: (r) => <Goal label={r.user.name} value={sum(r.closed)} goal={r.goal} />, sort: (r) => (r.goal ? sum(r.closed) / r.goal : 0) }]} /></Section></div>
    </>
  );
}
export function Campanhas(p: PanelData) {
  const router = useRouter(), list = p.campaigns.filter((c) => c.stats.sent);
  const n = (f: (c: CampaignView) => number) => list.reduce((a, c) => a + f(c), 0);
  const col = (key: string, label: string, f: (c: CampaignView) => number, show: (v: number) => string = int): Col<CampaignView> => ({ key, label, right: true, render: (c) => show(f(c)), sort: f });
  if (!list.length) return <EmptyState title="Nenhuma campanha enviada" text="Os resultados aparecem depois do primeiro disparo." />;
  return (
    <>
      <StatStrip stats={[{ label: "Enviadas", value: int(n((c) => c.stats.sent)), note: plural(list.length, "campanha") }, { label: "Lidas", value: int(n((c) => c.stats.read)), note: pct(n((c) => c.stats.read) / Math.max(1, n((c) => c.stats.delivered))) + " das entregues" }, { label: "Respostas", value: int(n((c) => c.stats.replied)), note: `${n((c) => c.stats.left)} saídas` }, { label: "Receita", value: money(n((c) => c.stats.revenue)), note: plural(n((c) => c.stats.deals), "negócio"), highlight: true }]} />
      <div className="pt-9"><Section card title="Por campanha"><Table caption="Campanhas" rows={list} onRow={(c) => router.push(`/campanhas/${c.id}`)} cols={[{ key: "n", label: "Campanha", render: (c) => c.name, sort: (c) => c.name }, col("e", "Enviadas", (c) => c.stats.sent), col("d", "Entregues", (c) => c.stats.delivered), col("l", "Lidas", (c) => c.stats.read), col("r", "Respostas", (c) => c.stats.replied), col("s", "Saídas", (c) => c.stats.left), col("g", "Negócios", (c) => c.stats.deals), col("v", "Receita", (c) => c.stats.revenue, money), col("c", "Custo", (c) => c.stats.cost, moneyCents)]} /></Section></div>
    </>
  );
}
/** Linhas do CSV do painel aberto. */
export function csvOf(panel: string, p: PanelData): (string | number)[][] {
  if (panel === "campanhas") return [["Campanha", "Enviadas", "Entregues", "Lidas", "Respostas", "Saídas", "Negócios", "Receita", "Custo"], ...p.campaigns.map((c) => [c.name, c.stats.sent, c.stats.delivered, c.stats.read, c.stats.replied, c.stats.left, c.stats.deals, c.stats.revenue, c.stats.cost.toFixed(2).replace(".", ",")])];
  if (panel === "equipe" || panel === "resumo" || panel === "atendimento") return [["Responsável", "Leads", "1ª resposta (min)", "Propostas", "Fechado", "Meta"], ...sellerRows(p).map((r) => [r.user.name, r.leads.length, Math.round(reply(r.leads)), r.props.length, sum(r.closed), r.goal])];
  if (panel === "vendas") return [["Etapa", "Alcançaram", "Em aberto", "Valor em aberto"], ...p.stages.map((s, i) => { const d = open(p.cur).filter((x) => x.stageId === s.id); return [s.name, reachedAt(p.cur, i).length, d.length, sum(d)]; })];
  const rows = panel === "produtos" ? rowsOf(p.cur, (d) => d.product.name) : [...rowsOf(p.cur, (d) => CHANNEL[d.channel]), ...rowsOf(p.cur, (d) => d.origin), ...rowsOf(p.cur.filter((d) => d.ad), (d) => "Anúncio: " + d.ad)];
  return [[panel === "produtos" ? "Produto" : "Origem", "Leads", "Propostas", "Vendas", "Receita"], ...rows.map((r) => [r.name, r.deals.length, proposals(r.deals).length, won(r.deals).length, sum(won(r.deals))])];
}
