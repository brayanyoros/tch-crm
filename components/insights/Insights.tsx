"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, X } from "lucide-react";
import { useQuery } from "@/lib/useQuery";
import { getSettings, listCampaigns, listConversations, listDeals, listProducts, listSellers, listStages, listTags, listTasks, listUsers } from "@/lib/data/repositories";
import { DEMO_DATA } from "@/lib/data/db";
import { ORIGINS } from "@/lib/data/types";
import { downloadCsv, now } from "@/lib/format";
import { createdIn, rangeLabel, ranges } from "@/lib/insights";
import { hhmm, longLabel, TZ_LABEL } from "@/lib/campaign/schedule";
import { can } from "@/lib/permissions";
import { useApp, type InsightFilters, type Period } from "@/store/app";
import { Button, Checkbox, Dropdown, EmptyState, ErrorState, FilterMenu, Input, opts, Segmented, Tabs } from "@/components/ui";
import { DrillProvider } from "./parts";
import { KpiSkeleton } from "./blocks";
import * as P from "./panels";

const PANELS = [{ id: "resumo", label: "Resumo" }, { id: "vendas", label: "Vendas" }, { id: "atendimento", label: "Atendimento" }, { id: "canais", label: "Canais e origem" }, { id: "produtos", label: "Produtos" }, { id: "equipe", label: "Equipe" }, { id: "campanhas", label: "Campanhas" }];
const HEAD: Record<string, [string, string]> = { resumo: ["Visão geral", "Resultados, metas e prioridades comerciais."], vendas: ["Vendas", "Resultado, pipeline, conversão e perdas."], atendimento: ["Atendimento", "Tempo de resposta humana e conversas em espera."], canais: ["Canais e origem", "De onde vêm os leads e as vendas."], produtos: ["Produtos", "Interesse e vendas por produto."], equipe: ["Equipe", "Metas e resultados por vendedor."], campanhas: ["Campanhas", "Resultados dos disparos pelo WhatsApp."] };
const VIEW: Record<string, (p: P.PanelData) => React.ReactNode> = { resumo: P.Resumo, vendas: P.Vendas, atendimento: P.Atendimento, canais: P.Canais, produtos: P.Produtos, equipe: P.Equipe, campanhas: P.Campanhas };
const PERIODS: { value: Period; label: string }[] = [{ value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }, { value: "mes", label: "Mês" }, { value: "custom", label: "Personalizado" }];
const CHANNELS = [{ value: "whatsapp", label: "WhatsApp" }, { value: "instagram", label: "Instagram" }];

export function Insights({ panel }: { panel: string }) {
  const { user, insights: f, set } = useApp(), router = useRouter();
  const team = can(user, "insights.team"), camp = can(user, "campaigns");
  const patch = (p: Partial<InsightFilters>) => set({ insights: { ...f, ...p } });
  const r = ranges(f);
  const [updated, setUpdated] = useState<Date | null>(null);
  const q = useQuery(async () => {
    const dims = { ownerId: f.ownerId, channel: f.channel, productId: f.productId, tagId: f.tagId, origin: f.origin };
    const [all, stages, sellers, users, settings, convs, tasks, campaigns] = await Promise.all([listDeals(dims), listStages(), listSellers(), listUsers(), getSettings(), listConversations(), listTasks(), camp ? listCampaigns() : []]);
    setUpdated(new Date());
    return { all, stages, sellers, users, settings, tasks, campaigns, convs: convs.filter((v) => (!f.ownerId || v.contact.ownerId === f.ownerId) && (!f.channel || v.channel === f.channel) && (!f.tagId || v.contact.tagIds.includes(f.tagId)) && (!f.productId || v.deal?.productId === f.productId) && (!f.origin || v.deal?.origin === f.origin)) };
  }, [f.ownerId, f.channel, f.productId, f.tagId, f.origin, camp]);
  const products = useQuery(listProducts).data, tags = useQuery(listTags).data;
  const tabs = PANELS.filter((t) => t.id !== "campanhas" || camp);
  const rangeText = rangeLabel(r.cur), prevText = rangeLabel(r.prev);
  const data: P.PanelData | undefined = q.data && user ? { ...q.data, cur: createdIn(q.data.all, r.cur), prev: createdIn(q.data.all, r.prev), range: r.cur, prevRange: r.prev, rangeText, prevText, compare: f.compare, team, filters: f, me: user } : undefined;
  if (!tabs.some((t) => t.id === panel)) return <EmptyState title="Painel não encontrado" action={<Button onClick={() => router.push("/insights")}>Voltar ao resumo</Button>} />;
  const View = VIEW[panel], [title, sub] = HEAD[panel];
  const chips = [
    f.ownerId && { k: "ownerId", label: `Responsável: ${q.data?.sellers.find((s) => s.id === f.ownerId)?.name ?? ""}` }, f.channel && { k: "channel", label: `Canal: ${CHANNELS.find((c) => c.value === f.channel)?.label}` },
    f.productId && { k: "productId", label: `Produto: ${products?.find((p) => p.id === f.productId)?.name ?? ""}` }, f.tagId && { k: "tagId", label: `Tag: ${tags?.find((t) => t.id === f.tagId)?.name ?? ""}` }, f.origin && { k: "origin", label: `Origem: ${f.origin}` },
  ].filter((x): x is { k: keyof InsightFilters; label: string } => !!x);
  const exportCsv = () => {
    if (!data) return;
    const head: (string | number)[][] = [[`Insights · ${title}`], [`Período: ${rangeText}${f.compare ? ` · comparado com ${prevText}` : ""}`], [`Fuso: ${TZ_LABEL} (America/Sao_Paulo)`], [`Gerado em: ${updated ? longLabel(updated) : ""}`], [`Filtros: ${chips.map((c) => c.label).join("; ") || "nenhum"}`], ...(DEMO_DATA ? [["Base de demonstração"]] : []), []];
    downloadCsv(`insights-${panel}.csv`, [...head, ...P.csvOf(panel, data)]);
  };
  return (
    <DrillProvider>
      <Tabs label="Painéis" className="no-print shrink-0 px-4 md:px-6" tabs={tabs} value={panel} onChange={(id) => router.push(id === "resumo" ? "/insights" : `/insights/${id}`)} />
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 pb-14 pt-5 md:px-6">
        <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="min-w-56 flex-1"><h2 className="text-[20px] font-semibold leading-7 tracking-[-0.01em]">{title}</h2><p className="text-[13px] text-tx2">{sub}</p></div>
          <div className="no-print flex flex-wrap items-center gap-2">
            {f.period === "custom" && <><Input type="date" aria-label="De" className="!w-36" max={f.to} value={f.from} onChange={(e) => e.target.value && patch({ from: e.target.value })} /><Input type="date" aria-label="Até" className="!w-36" min={f.from} value={f.to} onChange={(e) => e.target.value && patch({ to: e.target.value })} /></>}
            <div className="max-w-full overflow-x-auto"><Segmented label="Período" value={f.period} onChange={(period) => patch({ period })} options={PERIODS} /></div>
            <Dropdown items={[{ label: "Exportar CSV deste painel", run: exportCsv }, { label: "Exportar PDF (imprimir)", run: () => print() }]} trigger={<Button icon={Download} disabled={!data}>Exportar</Button>} />
          </div>
        </header>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-tx2 tnum">
          <span><b className="font-medium text-tx">{rangeText}</b>{f.compare ? ` · comparado com ${prevText} (intervalo equivalente)` : ""}</span>
          {updated && <span>Atualizado às {hhmm(updated)} ({TZ_LABEL})</span>}
          {DEMO_DATA && <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-1.5 rounded-full bg-warning" />Base de demonstração: dados até {longLabel(now())}</span>}
        </p>
        <div className="no-print flex flex-wrap items-center gap-2">
          {team && <FilterMenu label="Responsável" value={f.ownerId} options={opts(q.data?.sellers)} onChange={(ownerId) => patch({ ownerId })} />}
          <FilterMenu label="Canal" value={f.channel} options={CHANNELS} onChange={(channel) => patch({ channel })} />
          <FilterMenu label="Produto" value={f.productId} options={opts(products)} onChange={(productId) => patch({ productId })} />
          <FilterMenu label="Tag" value={f.tagId} options={opts(tags)} onChange={(tagId) => patch({ tagId })} />
          <FilterMenu label="Origem" value={f.origin} options={ORIGINS.map((o) => ({ value: o, label: o }))} onChange={(origin) => patch({ origin })} />
          <Checkbox className="ml-auto items-center" checked={f.compare} onChange={(compare) => patch({ compare })}><span className="t-sec">Comparar com o período anterior</span></Checkbox>
        </div>
        {chips.length > 0 && <div className="no-print flex flex-wrap items-center gap-1.5" aria-label="Filtros ativos">{chips.map((c) => <button key={c.k} type="button" onClick={() => patch({ [c.k]: "" })} aria-label={`Remover filtro ${c.label}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] hover:border-line2">{c.label}<X size={13} aria-hidden /></button>)}<Button size="sm" variant="ghost" onClick={() => patch({ ownerId: "", channel: "", productId: "", tagId: "", origin: "" })}>Limpar filtros</Button></div>}
        {q.error ? <ErrorState retry={q.retry} /> : !data ? <KpiSkeleton /> : <View {...data} />}
      </div>
    </DrillProvider>
  );
}
