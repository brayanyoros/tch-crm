"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ConversationView, DealView, Settings, Stage, TaskView, User } from "@/lib/data/types";
import type { CampaignView } from "@/lib/data/repositories";
import { int, money, moneyCents, now, pct, plural } from "@/lib/format";
import { fromSp, sp } from "@/lib/campaign/schedule";
import { change, closeRate, cohort, createdIn, cycleDays, dateLabel, distribution, firstReply, goalStatus, groupBy, lostIn, lossLabel, median, monthForecast, monthName, monthSeries, openNow, sum, ticket, weighted, wonIn, avg, type Range } from "@/lib/insights";
import { clientTurn, priorities, type Priority, type PriorityKind } from "@/lib/priorities";
import type { InsightFilters } from "@/store/app";
import { Avatar, CHANNEL, EmptyState, Section, Table, type Col } from "@/components/ui";
import { BarList, ChannelLines, Heatmap, Num, StatStrip } from "./parts";
import { CARD, CohortFunnel, days1, Distribution, GoalBlock, Kpi, LossReasons, pct1, Priorities, SalesChart } from "./blocks";

export interface PanelData { all: DealView[]; cur: DealView[]; prev: DealView[]; range: Range; prevRange: Range; rangeText: string; prevText: string; compare: boolean; stages: Stage[]; sellers: User[]; users: User[]; settings: Settings; convs: ConversationView[]; tasks: TaskView[]; team: boolean; campaigns: CampaignView[]; filters: InsightFilters; me: User }
const mins = (v: number | null) => (v === null ? "—" : `${Math.round(v)} min`);
const ch = (p: PanelData, cur: number | null, prev: number | null) => (p.compare ? change(cur, prev) : undefined);
const monthRange = (): Range => { const r = sp(now()); return { from: fromSp(r.y, r.m, 1, 0, 0), to: now() }; };
const dimFilters = (f: InsightFilters) => !!(f.channel || f.productId || f.tagId || f.origin);
/** Meta que vale para o recorte: global, do vendedor filtrado (ou do próprio vendedor) ou suspensa. */
function goalScope(p: PanelData): { owner: string; scope: "global" | "vendedor" | "suspensa" } {
  const owner = p.team ? p.filters.ownerId : p.me.id;
  if (dimFilters(p.filters)) return { owner, scope: "suspensa" };
  if (!owner) return { owner: "", scope: "global" };
  return { owner, scope: p.settings.goalsByMonth[goalStatus(p.settings, 0).key]?.sellers[owner] !== undefined ? "vendedor" : "suspensa" };
}
const cutoffLabel = () => { const d = sp(now()); return `${String(d.d).padStart(2, "0")}/${String(d.m).padStart(2, "0")}`; };

/* ---------- prioridades com os filtros pertinentes ---------- */
export function priorityItems(p: PanelData): { items: Priority[]; exception?: string } {
  const f = p.filters, dealOnly = !!(f.productId || f.origin);
  const convs = p.convs.filter((v) => !dealOnly || v.deal), tasks = p.tasks.filter((t) => (!f.ownerId || t.ownerId === f.ownerId) && (!dealOnly || p.all.some((d) => d.id === t.dealId)));
  return { items: priorities({ convs, deals: p.all, tasks, settings: p.settings, order: p.settings.priorityOrder as PriorityKind[] }), exception: dealOnly ? "Com filtro de produto ou origem, conversas e tarefas sem negócio ficam de fora." : undefined };
}

/* ---------- Resumo ---------- */
interface OriginRow { id: string; name: string; leads: DealView[]; won: DealView[]; lost: DealView[] }
const originRows = (p: PanelData, key: (d: DealView) => string, base = p.all): OriginRow[] => {
  const names = [...new Set([...createdIn(base, p.range), ...wonIn(base, p.range), ...lostIn(base, p.range)].map(key))];
  return names.map((name) => { const g = base.filter((d) => key(d) === name); return { id: name, name, leads: createdIn(g, p.range), won: wonIn(g, p.range), lost: lostIn(g, p.range) }; });
};
const rate = (r: OriginRow) => (r.won.length + r.lost.length ? r.won.length / (r.won.length + r.lost.length) : null);
const originCols = (label: string, range: string): Col<OriginRow>[] => [
  { key: "n", label, render: (r) => r.name, sort: (r) => r.name },
  { key: "l", label: "Novos leads", right: true, render: (r) => <Num title={`Novos leads · ${r.name}`} deals={r.leads} note={`Negócios criados em ${range}.`}>{r.leads.length}</Num>, sort: (r) => r.leads.length },
  { key: "w", label: "Vendas ganhas", right: true, render: (r) => <Num title={`Vendas ganhas · ${r.name}`} deals={r.won} note={`Ganhos com fechamento em ${range}.`}>{r.won.length}</Num>, sort: (r) => r.won.length },
  { key: "v", label: "Valor vendido", right: true, render: (r) => <span className="font-semibold">{money(sum(r.won))}</span>, sort: (r) => sum(r.won) },
  { key: "c", label: "Conversão de fechamento", right: true, render: (r) => { const x = rate(r); return x === null ? <span className="text-tx2">Sem encerrados</span> : <Num title={`Encerrados · ${r.name}`} deals={[...r.won, ...r.lost]} note={`${r.won.length} ganhos ÷ ${r.won.length + r.lost.length} encerrados (ganhos + perdidos) em ${range}.`}>{pct1(x)}</Num>; }, sort: (r) => rate(r) ?? -1 },
];
interface SellerRow { id: string; user: User; leads: DealView[]; won: DealView[]; lost: DealView[]; open: DealView[]; goal: number | null; monthWon: DealView[]; pending: number }
function sellerRows(p: PanelData, items?: Priority[]): SellerRow[] {
  const key = goalStatus(p.settings, 0).key, m = monthRange();
  return p.sellers.map((u) => { const own = p.all.filter((d) => d.ownerId === u.id); return { id: u.id, user: u, leads: createdIn(own, p.range), won: wonIn(own, p.range), lost: lostIn(own, p.range), open: openNow(own), goal: p.settings.goalsByMonth[key]?.sellers[u.id] ?? null, monthWon: wonIn(own, m), pending: items?.filter((x) => x.ownerId === u.id).length ?? 0 }; });
}
export function Resumo(p: PanelData) {
  const m = monthRange(), monthWon = wonIn(p.all, m), g = goalScope(p), gs = goalStatus(p.settings, sum(monthWon), now(), g.owner);
  const w = wonIn(p.all, p.range), wPrev = wonIn(p.all, p.prevRange), cr = closeRate(p.all, p.range), crPrev = closeRate(p.all, p.prevRange), pr = priorityItems(p);
  const series = monthSeries(p.all, p.settings, g.scope === "suspensa" ? null : gs.goal);
  const team = sellerRows(p, pr.items).filter((r) => r.leads.length || r.won.length || r.open.length);
  return (
    <div className="flex flex-col gap-5">
      <GoalBlock gs={gs} won={sum(monthWon)} wonDeals={monthWon} scope={g.scope} globalGoal={p.settings.goalsByMonth[gs.key]?.team ?? null} todayLabel={cutoffLabel()} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Vendas ganhas" value={w.length ? money(sum(w)) : money(0)} sub={plural(w.length, "negócio ganho", "negócios ganhos")} ch={ch(p, sum(w), sum(wPrev))} prevLabel={p.prevText} deals={w} note={`Negócios marcados como ganhos com fechamento em ${p.rangeText}. É valor vendido, não recebimento.`} formula={<>Soma dos valores dos negócios marcados como <b>ganhos</b> com data de fechamento no período. Não é receita recebida nem faturamento fiscal.</>} />
        <Kpi label="Novos leads" value={int(p.cur.length)} sub="negócios criados no período" ch={ch(p, p.cur.length, p.prev.length)} prevLabel={p.prevText} deals={p.cur} note={`Negócios criados em ${p.rangeText}.`} formula={<>Negócios criados no período, cada um contado uma vez.</>} />
        <Kpi label="Conversão de fechamento" value={cr.rate === null ? null : pct1(cr.rate)} empty="Sem negócios encerrados no período" sub={`${cr.won.length} ganhos de ${cr.won.length + cr.lost.length} encerrados`} ch={ch(p, cr.rate, crPrev.rate)} prevLabel={p.prevText} deals={[...cr.won, ...cr.lost]} note={`${cr.won.length} ganhos ÷ ${cr.won.length + cr.lost.length} encerrados (ganhos + perdidos) com fechamento em ${p.rangeText}.`} formula={<>Ganhos ÷ (ganhos + perdidos), contando os negócios <b>encerrados</b> no período, não importa quando entraram. A conversão dos leads que entraram no período está em Vendas › Conversão entre etapas.</>} />
        <Kpi label="Ticket médio" value={ticket(w) === null ? null : money(ticket(w)!)} empty="Sem vendas ganhas no período" sub={w.length ? `${money(sum(w))} ÷ ${w.length}` : undefined} ch={ch(p, ticket(w), ticket(wPrev))} prevLabel={p.prevText} deals={w} note={`Valor vendido ÷ quantidade de vendas ganhas em ${p.rangeText}.`} formula={<>Valor das vendas ganhas ÷ quantidade de vendas ganhas, no mesmo recorte.</>} />
      </div>
      <section className={CARD} aria-label="Onde agir hoje"><header className="mb-3"><h2 className="text-[17px] font-semibold">Onde agir hoje</h2><p className="text-[13px] text-tx2">Prioridades de agora, independentes do período do relatório.</p></header><Priorities items={pr.items} users={p.users} settings={p.settings} exception={pr.exception} /></section>
      <section className={CARD}><header className="mb-3"><h2 className="text-[17px] font-semibold">Evolução das vendas em {monthName(gs.key)}</h2><p className="text-[13px] text-tx2">Vendas ganhas acumuladas{g.scope === "suspensa" ? "; sem meta para este recorte" : " contra a meta distribuída pelos dias comerciais"}.</p></header><SalesChart data={series} cutoff={cutoffLabel()} hasGoal={g.scope !== "suspensa" && gs.goal !== null} /></section>
      <div className="grid gap-5 2xl:grid-cols-2">
        <section className={CARD}><header className="mb-3 flex items-baseline gap-3"><h2 className="flex-1 text-[17px] font-semibold">Canais e origens</h2><Link href="/insights/canais" className="text-[13px] font-medium underline underline-offset-4">Ver análise completa</Link></header><Table caption="Resultados por origem" cols={originCols("Origem", p.rangeText)} rows={originRows(p, (d) => d.origin)} initialSort={{ key: "v", desc: true }} /></section>
        <section className={CARD}><header className="mb-3 flex items-baseline gap-3"><h2 className="flex-1 text-[17px] font-semibold">{p.team ? "Equipe" : "Seus números"}</h2><Link href="/insights/equipe" className="text-[13px] font-medium underline underline-offset-4">Ver análise completa</Link></header>
          {team.length ? <Table caption="Equipe" rows={team} initialSort={{ key: "w", desc: true }} cols={[
            { key: "n", label: "Responsável", render: (r) => <span className="inline-flex items-center gap-2 whitespace-nowrap"><Avatar user={r.user} size={22} />{r.user.name.split(" ")[0]}</span>, sort: (r) => r.user.name },
            { key: "w", label: "Vendas ganhas", right: true, render: (r) => <Num title={`Vendas ganhas de ${r.user.name}`} deals={r.won} note={`Ganhos com fechamento em ${p.rangeText}.`}>{money(sum(r.won))}</Num>, sort: (r) => sum(r.won) },
            { key: "m", label: "Meta do mês", right: true, render: (r) => (r.goal === null ? <span className="text-tx2">Sem meta</span> : `${pct(sum(r.monthWon) / r.goal)} de ${money(r.goal)}`), sort: (r) => (r.goal ? sum(r.monthWon) / r.goal : -1) },
            { key: "c", label: "Conversão", right: true, render: (r) => (r.won.length + r.lost.length ? pct1(r.won.length / (r.won.length + r.lost.length)) : <span className="text-tx2">—</span>), sort: (r) => (r.won.length + r.lost.length ? r.won.length / (r.won.length + r.lost.length) : -1) },
            { key: "o", label: "Abertas", right: true, render: (r) => <Num title={`Oportunidades abertas de ${r.user.name}`} deals={r.open} note="Negócios abertos agora.">{r.open.length}</Num>, sort: (r) => r.open.length },
            { key: "p", label: "Pendências", right: true, render: (r) => (r.pending ? <span className="font-medium text-alert">{r.pending}</span> : "0"), sort: (r) => r.pending },
          ]} /> : <EmptyState title="Sem movimento da equipe neste recorte" />}
        </section>
      </div>
    </div>
  );
}

/* ---------- Vendas ---------- */
export function Vendas(p: PanelData) {
  const w = wonIn(p.all, p.range), wPrev = wonIn(p.all, p.prevRange), cyc = cycleDays(w), cycPrev = cycleDays(wPrev), open = openNow(p.all), co = cohort(p.all, p.range, p.stages), f = monthForecast(p.all);
  const g = goalScope(p), gs = goalStatus(p.settings, sum(f.realized), now(), g.owner), chances = p.stages.slice(0, -1).map((s) => `${s.name} ${s.chance}%`).join(", "), ref = dateLabel(now());
  const fCols: Col<DealView>[] = [
    { key: "n", label: "Negócio", render: (d) => <Link href={`/funil?negocio=${d.id}`} className="underline-offset-4 hover:underline">{d.contact.name}</Link>, sort: (d) => d.contact.name },
    { key: "e", label: "Etapa", render: (d) => d.stage.name, sort: (d) => d.stageIndex }, { key: "d", label: "Previsão", render: (d) => d.expectedCloseAt!.split("-").reverse().join("/"), sort: (d) => d.expectedCloseAt! },
    { key: "v", label: "Valor", right: true, render: (d) => money(d.value), sort: (d) => d.value }, { key: "c", label: "Chance", right: true, render: (d) => `${d.stage.chance}%`, sort: (d) => d.stage.chance },
    { key: "p", label: "Ponderado", right: true, render: (d) => money((d.value * d.stage.chance) / 100), sort: (d) => d.value * d.stage.chance },
  ];
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi accent label="Vendas ganhas" value={money(sum(w))} sub={plural(w.length, "negócio")} ch={ch(p, sum(w), sum(wPrev))} prevLabel={p.prevText} deals={w} note={`Ganhos com fechamento em ${p.rangeText}.`} formula={<>Negócios ganhos com fechamento no período. Valor vendido, não recebido.</>} />
        <Kpi label="Ticket médio" value={ticket(w) === null ? null : money(ticket(w)!)} empty="Sem vendas no período" ch={ch(p, ticket(w), ticket(wPrev))} prevLabel={p.prevText} deals={w} formula={<>Valor das vendas ganhas ÷ quantidade, no período.</>} />
        <Kpi label="Ciclo de venda" value={cyc.length ? days1(avg(cyc)!) : null} empty="Sem vendas no período" sub={cyc.length ? `mediana ${days1(median(cyc)!)} · ${cyc.length} vendas` : undefined} ch={ch(p, avg(cyc), avg(cycPrev))} lowerIsBetter prevLabel={p.prevText} deals={w} formula={<>Dias entre a criação do negócio e o ganho, nas vendas ganhas do período. Média e mediana.</>} />
        <Kpi label="Pipeline aberto" value={money(sum(open))} sub={`${plural(open.length, "negócio aberto", "negócios abertos")} em ${ref}`} prevLabel={p.prevText} deals={open} note={`Negócios abertos agora (${ref}), sem recorte de período.`} formula={<>Soma dos valores dos negócios abertos agora. Não depende do período escolhido.</>} />
        <Kpi label="Pipeline ponderado" value={money(weighted(open))} sub="valor × chance da etapa" prevLabel={p.prevText} deals={open} note={`Abertos agora × chance configurada da etapa (${chances}).`} formula={<>Σ valor × chance de cada etapa, nos negócios abertos agora. Chances <b>configuradas</b> em Configurações › Funil: {chances}. Não é previsão do mês: não considera quando cada negócio deve fechar.</>} />
      </div>
      <section className={CARD}><header className="mb-3"><h2 className="text-[17px] font-semibold">Evolução das vendas em {monthName(gs.key)}</h2></header><SalesChart data={monthSeries(p.all, p.settings, g.scope === "suspensa" ? null : gs.goal)} cutoff={cutoffLabel()} hasGoal={g.scope !== "suspensa" && gs.goal !== null} /></section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className={CARD}><header className="mb-1"><h2 className="text-[17px] font-semibold">Conversão entre etapas</h2></header><CohortFunnel steps={co.steps} n={co.n} small={co.small} range={p.rangeText} /></section>
        <section className={CARD}><header className="mb-1"><h2 className="text-[17px] font-semibold">Distribuição atual do funil</h2></header><Distribution rows={distribution(open, p.stages)} refLabel={ref} /></section>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className={CARD}><header className="mb-3"><h2 className="text-[17px] font-semibold">Motivos de perda</h2><p className="text-[13px] text-tx2">Negócios perdidos com fechamento em {p.rangeText}.</p></header><LossReasons lost={lostIn(p.all, p.range)} range={p.rangeText} /></section>
        <section className={CARD}>
          <header className="mb-3"><h2 className="text-[17px] font-semibold">Previsão de fechamento em {monthName(gs.key)}</h2><p className="text-[13px] text-tx2">Pelos negócios abertos com data prevista até o fim do mês. Sempre o mês atual, independente do período.</p></header>
          <dl className="mb-4 grid grid-cols-3 gap-4 text-[14px]">
            <div><dt className="text-[13px] text-tx2">Realizado</dt><dd className="t-val"><Num title="Vendas ganhas no mês" deals={f.realized}>{money(sum(f.realized))}</Num></dd></div>
            <div><dt className="text-[13px] text-tx2">Estimado</dt><dd className="t-val">{money(f.estimated)}</dd><dd className="text-[12px] text-tx2">valor × chance</dd></div>
            <div><dt className="text-[13px] text-tx2">Potencial</dt><dd className="t-val"><Num title="Previstos para o mês" deals={f.inMonth} note="Abertos com fechamento previsto até o fim do mês, pelo valor cheio.">{money(f.potential)}</Num></dd></div>
          </dl>
          {f.inMonth.length ? <Table caption="Previstos para o mês" cols={fCols} rows={f.inMonth} initialSort={{ key: "d", desc: false }} /> : <p className="text-[14px] text-tx2">Nenhum negócio aberto com fechamento previsto para este mês.</p>}
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-tx2">
            <span><Num title="Previsão vencida" deals={f.overdue} note="Abertos com data prevista já passada.">{f.overdue.length}</Num> com previsão vencida</span>
            <span><Num title="Sem data prevista" deals={f.noDate} note="Abertos sem data prevista de fechamento: ficam fora da previsão.">{f.noDate.length}</Num> sem data prevista ({money(sum(f.noDate))}), fora da previsão</span>
          </p>
          <p className="mt-1 text-[12.5px] text-tx2">A data prevista é registrada no painel do negócio, no Funil.</p>
        </section>
      </div>
    </div>
  );
}

/* ---------- Atendimento ---------- */
export function Atendimento(p: PanelData) {
  const goal = p.settings.limits.firstReplyMin, fr = firstReply(p.cur, goal), frPrev = firstReply(p.prev, goal);
  const waiting = p.convs.filter((v) => v.waitingSince), autoOnly = waiting.filter((v) => clientTurn(v).autoReplied), out = p.convs.filter((v) => v.windowEndsAt && new Date(v.windowEndsAt) < now() && v.deal?.status === "aberto");
  const dealsOf = (vs: ConversationView[]) => vs.flatMap((v) => v.deal ?? []);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi accent label="1ª resposta humana" value={mins(fr.avg)} empty="Sem atendimentos" sub={fr.n ? `mediana ${mins(fr.median)} · ${fr.n} atendimentos` : undefined} ch={ch(p, fr.avg, frPrev.avg)} lowerIsBetter prevLabel={p.prevText} deals={p.cur.filter((d) => d.firstReplyMin > 0)} formula={<>Minutos <b>corridos</b> entre a primeira mensagem do lead e a primeira resposta de uma pessoa da equipe, nos leads criados no período. Respostas automáticas não contam. Quem ainda espera está em “Aguardando agora”.</>} />
        <Kpi label={`Dentro da meta de ${goal} min`} value={fr.within === null ? null : pct1(fr.within)} empty="Sem atendimentos" sub={`${fr.n - fr.above.length} de ${fr.n}`} ch={ch(p, fr.within, frPrev.within)} prevLabel={p.prevText} formula={<>Atendimentos com 1ª resposta humana em até {goal} minutos ÷ atendimentos respondidos. Meta em Configurações › Horário e alertas.</>} />
        <Kpi label="Acima do prazo" value={int(fr.above.length)} sub={`1ª resposta acima de ${goal} min`} ch={ch(p, fr.above.length, frPrev.above.length)} lowerIsBetter prevLabel={p.prevText} deals={fr.above} formula={<>Leads do período cuja 1ª resposta humana passou de {goal} minutos.</>} />
        <Kpi label="Aguardando agora" value={int(waiting.length)} sub={autoOnly.length ? `${autoOnly.length} só com resposta automática` : "nenhum só com resposta automática"} prevLabel={p.prevText} deals={dealsOf(waiting)} note="Conversas cuja última mensagem é do cliente, sem resposta humana. Agora, sem recorte de período." formula={<>Conversas esperando resposta humana neste momento. A resposta automática não encerra a espera.</>} />
      </div>
      <section className={CARD}><Section title="Quando os contatos chegam"><Heatmap deals={p.cur} /></Section></section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className={CARD}><Section title="Tempo da 1ª resposta humana"><BarList bars={([["Até 5 min", 0, 5], ["6 a 10 min", 6, 10], [`11 a ${goal} min`, 11, goal], [`Mais de ${goal} min`, goal + 1, 1e9]] as const).map(([l, a, b]) => { const d = p.cur.filter((x) => x.firstReplyMin > 0 && x.firstReplyMin >= a && x.firstReplyMin <= b); return { key: l, label: l, value: d.length, text: String(d.length), deals: d, title: l }; })} /></Section></section>
        <section className={CARD}><Section title={p.team ? "1ª resposta por pessoa" : "Sua 1ª resposta"}><BarList bars={sellerRows(p).filter((r) => r.leads.length).map((r) => { const x = firstReply(r.leads, goal); return { key: r.id, label: r.user.name, value: x.avg ?? 0, text: `${mins(x.avg)} · n=${x.n}`, deals: r.leads, title: r.user.name }; })} /></Section><p className="mt-3 text-[13px] text-tx2">{plural(out.length, "conversa com negócio aberto saiu", "conversas com negócio aberto saíram")} da janela de 24h.</p></section>
      </div>
    </div>
  );
}

/* ---------- Canais, Produtos ---------- */
export function Canais(p: PanelData) {
  const sort = { key: "l", desc: true };
  return <div className="flex flex-col gap-5"><section className={CARD}><Section title="Novos leads por canal"><ChannelLines deals={p.cur} range={p.range} /></Section></section><section className={CARD}><Section title="Por canal"><Table caption="Por canal" cols={originCols("Canal", p.rangeText)} rows={originRows(p, (d) => CHANNEL[d.channel])} initialSort={sort} /></Section></section><section className={CARD}><Section title="Por origem"><Table caption="Por origem" cols={originCols("Origem", p.rangeText)} rows={originRows(p, (d) => d.origin)} initialSort={sort} /></Section></section><section className={CARD}><Section title="Anúncios do Meta">{p.all.some((d) => d.ad) ? <Table caption="Por anúncio" cols={originCols("Anúncio", p.rangeText)} rows={originRows(p, (d) => d.ad!, p.all.filter((d) => d.ad))} initialSort={sort} /> : <EmptyState title="Nenhum lead de anúncio" />}</Section></section></div>;
}
export function Produtos(p: PanelData) {
  const w = wonIn(p.all, p.range);
  return (
    <div className="flex flex-col gap-5">
      <section className={CARD}><Section title="Por produto"><Table caption="Por produto" cols={originCols("Produto", p.rangeText)} rows={originRows(p, (d) => d.product.name)} initialSort={{ key: "l", desc: true }} /></Section></section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className={CARD}><Section title="Ticket médio por categoria">{w.length ? <BarList bars={groupBy(w, (d) => d.product.category).map(([k, d]) => ({ key: k, label: k, value: sum(d) / d.length, text: money(sum(d) / d.length), deals: d, title: `Vendas em ${k}` })).sort((a, b) => b.value - a.value)} /> : <p className="text-tx2">Sem vendas ganhas no período.</p>}</Section></section>
        <section className={CARD}><Section title="Interesse por categoria"><BarList bars={groupBy(p.cur, (d) => d.product.category).map(([k, d]) => ({ key: k, label: k, value: d.length, text: plural(d.length, "lead"), deals: d, title: `Leads de ${k}` })).sort((a, b) => b.value - a.value)} /></Section></section>
      </div>
    </div>
  );
}

/* ---------- Equipe ---------- */
export function Equipe(p: PanelData) {
  const pr = priorityItems(p), rows = sellerRows(p, pr.items), key = goalStatus(p.settings, 0).key, mg = p.settings.goalsByMonth[key], goal = p.team ? mg?.team ?? null : mg?.sellers[p.me.id] ?? null, monthWon = wonIn(p.all, monthRange());
  return (
    <div className="flex flex-col gap-5">
      <GoalBlock gs={goalStatus(p.settings, sum(monthWon), now(), p.team ? "" : p.me.id)} won={sum(monthWon)} wonDeals={monthWon} scope={dimFilters(p.filters) || (p.team && p.filters.ownerId) ? "suspensa" : p.team ? "global" : goal === null ? "suspensa" : "vendedor"} globalGoal={mg?.team ?? null} todayLabel={cutoffLabel()} />
      <section className={CARD}><Section title={`Meta de ${monthName(key)} por vendedor`}><Table caption="Metas por vendedor" rows={rows} initialSort={{ key: "a", desc: true }} cols={[
        { key: "n", label: "Responsável", render: (r) => <span className="inline-flex items-center gap-2 whitespace-nowrap"><Avatar user={r.user} size={22} />{r.user.name}</span>, sort: (r) => r.user.name },
        { key: "w", label: "Ganho no mês", right: true, render: (r) => <Num title={`Ganho no mês · ${r.user.name}`} deals={r.monthWon}>{money(sum(r.monthWon))}</Num>, sort: (r) => sum(r.monthWon) },
        { key: "m", label: "Meta", right: true, render: (r) => (r.goal === null ? <span className="text-tx2">Sem meta</span> : money(r.goal)), sort: (r) => r.goal ?? -1 },
        { key: "a", label: "Atingido", render: (r) => { if (r.goal === null) return <span className="text-tx2">—</span>; const k = sum(r.monthWon) / r.goal; return <span className="inline-flex w-full min-w-40 items-center gap-2.5"><span role="progressbar" aria-label={`${r.user.name}: ${pct(k)} da meta`} aria-valuenow={Math.round(k * 100)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 flex-1 rounded-full bg-surface2"><span className="block h-full rounded-full bg-gold" style={{ width: `${Math.min(1, k) * 100}%` }} /></span><span className="t-val w-12 text-right">{pct(k)}</span></span>; }, sort: (r) => (r.goal ? sum(r.monthWon) / r.goal : -1) },
      ]} /></Section></section>
      <section className={CARD}><Section title={`No período: ${p.rangeText}`}><Table caption="Equipe no período" rows={rows} initialSort={{ key: "w", desc: true }} cols={[
        { key: "n", label: "Responsável", render: (r) => r.user.name, sort: (r) => r.user.name },
        { key: "l", label: "Novos leads", right: true, render: (r) => <Num title={`Novos leads de ${r.user.name}`} deals={r.leads}>{r.leads.length}</Num>, sort: (r) => r.leads.length },
        { key: "r", label: "1ª resposta", right: true, render: (r) => mins(firstReply(r.leads, p.settings.limits.firstReplyMin).avg), sort: (r) => firstReply(r.leads, p.settings.limits.firstReplyMin).avg ?? 9e9 },
        { key: "w", label: "Vendas ganhas", right: true, render: (r) => <Num title={`Vendas ganhas de ${r.user.name}`} deals={r.won}>{money(sum(r.won))}</Num>, sort: (r) => sum(r.won) },
        { key: "c", label: "Conversão de fechamento", right: true, render: (r) => (r.won.length + r.lost.length ? `${pct1(r.won.length / (r.won.length + r.lost.length))} (${r.won.length}/${r.won.length + r.lost.length})` : <span className="text-tx2">—</span>), sort: (r) => (r.won.length + r.lost.length ? r.won.length / (r.won.length + r.lost.length) : -1) },
        { key: "o", label: "Abertas agora", right: true, render: (r) => <Num title={`Abertas de ${r.user.name}`} deals={r.open}>{r.open.length}</Num>, sort: (r) => r.open.length },
        { key: "p", label: "Pendências", right: true, render: (r) => r.pending, sort: (r) => r.pending },
      ]} /></Section></section>
    </div>
  );
}

/* ---------- Campanhas ---------- */
export function Campanhas(p: PanelData) {
  const router = useRouter(), list = p.campaigns.filter((c) => c.stats.sent);
  const n = (f: (c: CampaignView) => number) => list.reduce((a, c) => a + f(c), 0);
  const col = (key: string, label: string, f: (c: CampaignView) => number): Col<CampaignView> => ({ key, label, right: true, render: (c) => int(f(c)), sort: f });
  if (!list.length) return <EmptyState title="Nenhuma campanha com envios" text="Os resultados aparecem depois do primeiro disparo." />;
  return (
    <>
      <StatStrip stats={[{ label: "Enviadas", value: int(n((c) => c.stats.sent)), note: plural(list.length, "campanha") }, { label: "Lidas", value: int(n((c) => c.stats.read)), note: pct(n((c) => c.stats.read) / Math.max(1, n((c) => c.stats.delivered))) + " das entregues" }, { label: "Respostas", value: int(n((c) => c.stats.replied)), note: `${n((c) => c.stats.left)} saídas`, highlight: true }, { label: "Falhas", value: int(n((c) => c.stats.failed)), note: "no envio" }]} />
      <div className="pt-5"><section className={CARD}><Section title="Por campanha"><Table caption="Campanhas" rows={list} onRow={(c) => router.push(`/campanhas/${c.id}`)} cols={[{ key: "n", label: "Campanha", render: (c) => c.name, sort: (c) => c.name }, col("e", "Enviadas", (c) => c.stats.sent), col("d", "Entregues", (c) => c.stats.delivered), col("l", "Lidas", (c) => c.stats.read), col("r", "Respostas", (c) => c.stats.replied), col("s", "Saídas", (c) => c.stats.left), col("f", "Falhas", (c) => c.stats.failed), { key: "c", label: "Custo estimado", right: true, render: (c) => (c.stats.cost === null ? <span className="text-tx2">Sem tarifa</span> : moneyCents(c.stats.cost)), sort: (c) => c.stats.cost ?? -1 }]} /></Section></section></div>
    </>
  );
}

/** Linhas do CSV do painel aberto, com as mesmas definições da tela. */
export function csvOf(panel: string, p: PanelData): (string | number)[][] {
  const r2 = (v: number | null) => (v === null ? "" : Math.round(v * 1000) / 10);
  if (panel === "campanhas") return [["Campanha", "Enviadas", "Entregues", "Lidas", "Respostas", "Saídas", "Falhas", "Custo estimado"], ...p.campaigns.map((c) => [c.name, c.stats.sent, c.stats.delivered, c.stats.read, c.stats.replied, c.stats.left, c.stats.failed, c.stats.cost === null ? "sem tarifa" : c.stats.cost.toFixed(2).replace(".", ",")])];
  if (panel === "equipe" || panel === "atendimento") return [["Responsável", "Novos leads", "1ª resposta humana (min)", "Vendas ganhas (R$)", "Ganhos", "Encerrados", "Conversão de fechamento (%)", "Abertas agora", "Meta do mês (R$)", "Ganho no mês (R$)"], ...sellerRows(p).map((r) => [r.user.name, r.leads.length, firstReply(r.leads, p.settings.limits.firstReplyMin).avg ?? "", sum(r.won), r.won.length, r.won.length + r.lost.length, r2(r.won.length + r.lost.length ? r.won.length / (r.won.length + r.lost.length) : null), r.open.length, r.goal ?? "", sum(r.monthWon)])];
  if (panel === "vendas") { const co = cohort(p.all, p.range, p.stages), dist = distribution(openNow(p.all), p.stages); return [["Etapa", "Coorte: chegaram", "Coorte: % do anterior", "Abertos agora", "Valor aberto (R$)", "Chance configurada (%)"], ...p.stages.map((s, i) => { const d = dist.find((x) => x.stage.id === s.id)?.deals ?? []; return [s.name, co.steps[i].deals.length, i ? r2(co.steps[i - 1].deals.length ? co.steps[i].deals.length / co.steps[i - 1].deals.length : null) : "", d.length, sum(d), s.chance]; }), [], ["Motivo de perda", "Quantidade", "Valor (R$)"], ...groupBy(lostIn(p.all, p.range), (d) => lossLabel(d.lostReason)).map(([k, d]) => [k, d.length, sum(d)])]; }
  const rows = panel === "produtos" ? originRows(p, (d) => d.product.name) : [...originRows(p, (d) => CHANNEL[d.channel]), ...originRows(p, (d) => d.origin)];
  return [[panel === "produtos" ? "Produto" : "Canal ou origem", "Novos leads", "Vendas ganhas", "Valor vendido (R$)", "Conversão de fechamento (%)"], ...rows.map((r) => [r.name, r.leads.length, r.won.length, sum(r.won), r2(rate(r))])];
}
