"use client";
import { useRouter } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { useQuery } from "@/lib/useQuery";
import { getSettings, listCampaigns, listConversations, listDeals, listProducts, listSellers, listStages, listTags } from "@/lib/data/repositories";
import { ORIGINS } from "@/lib/data/types";
import { downloadCsv, fmt, now } from "@/lib/format";
import { inRange, ranges } from "@/lib/insights";
import { can } from "@/lib/permissions";
import { useApp, type InsightFilters, type Period } from "@/store/app";
import { Button, Checkbox, EmptyState, FilterMenu, IconButton, Input, Loaded, opts, Segmented, Skeleton, Tabs } from "@/components/ui";
import { DrillProvider } from "./parts";
import * as P from "./panels";

const PANELS = [{ id: "resumo", label: "Resumo" }, { id: "vendas", label: "Vendas" }, { id: "atendimento", label: "Atendimento" }, { id: "canais", label: "Canais e origem" }, { id: "produtos", label: "Produtos" }, { id: "equipe", label: "Equipe" }, { id: "campanhas", label: "Campanhas" }];
const VIEW: Record<string, (p: P.PanelData) => React.ReactNode> = { resumo: P.Resumo, vendas: P.Vendas, atendimento: P.Atendimento, canais: P.Canais, produtos: P.Produtos, equipe: P.Equipe, campanhas: P.Campanhas };
const PERIODS: { value: Period; label: string }[] = [{ value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }, { value: "mes", label: "Mês" }, { value: "custom", label: "Personalizado" }];
const Loading = () => <div role="status" aria-label="Carregando"><div className="grid grid-cols-2 gap-6 border-t border-tx pt-5 lg:grid-cols-4">{[1, 2, 3, 4].map((i) => <div key={i}><Skeleton className="h-3 w-24" /><Skeleton className="mt-3 h-8 w-32" /><Skeleton className="mt-3 h-3 w-28" /></div>)}</div><div className="grid gap-12 pt-12 xl:grid-cols-2">{[1, 2].map((i) => <div key={i} className="flex flex-col gap-3">{[90, 70, 48, 30, 20].map((w) => <Skeleton key={w} className="h-6" />)}</div>)}</div></div>;

export function Insights({ panel }: { panel: string }) {
  const { user, insights: f, set } = useApp(), router = useRouter();
  const team = can(user, "insights.team"), camp = can(user, "campaigns");
  const patch = (p: Partial<InsightFilters>) => set({ insights: { ...f, ...p } });
  const r = ranges(f);
  const q = useQuery(async () => {
    const [deals, stages, sellers, settings, convs, campaigns] = await Promise.all([listDeals({ ownerId: f.ownerId, channel: f.channel, productId: f.productId, tagId: f.tagId, origin: f.origin }), listStages(), listSellers(), getSettings(), listConversations(), camp ? listCampaigns() : []]);
    return { deals, stages, sellers, settings, campaigns, convs: convs.filter((v) => (!f.ownerId || v.contact.ownerId === f.ownerId) && (!f.channel || v.channel === f.channel) && (!f.tagId || v.contact.tagIds.includes(f.tagId))) };
  }, [f.ownerId, f.channel, f.productId, f.tagId, f.origin, camp]);
  const products = useQuery(listProducts).data, tags = useQuery(listTags).data;
  const h = now().getHours(), hello = `${h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"}, ${user!.name.split(" ")[0]}.`;
  const tabs = PANELS.filter((t) => t.id !== "campanhas" || camp);
  const active = f.ownerId || f.channel || f.productId || f.tagId || f.origin;
  const data: P.PanelData | undefined = q.data && { ...q.data, cur: q.data.deals.filter((d) => inRange(d, r.cur)), prev: q.data.deals.filter((d) => inRange(d, r.prev)), compare: f.compare, range: r.cur, team };
  if (!tabs.some((t) => t.id === panel)) return <EmptyState title="Painel não encontrado" action={<Button onClick={() => router.push("/insights")}>Voltar ao resumo</Button>} />;
  const View = VIEW[panel];
  return (
    <DrillProvider>
      <Tabs label="Painéis" className="no-print shrink-0 px-4 md:px-6" tabs={tabs} value={panel} onChange={(id) => router.push(id === "resumo" ? "/insights" : `/insights/${id}`)} />
      <div className="flex flex-col gap-5 px-4 pb-14 pt-6 md:px-6">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="min-w-48 flex-1"><h2 className="text-[22px] font-semibold leading-7 tracking-[-0.02em]">{panel === "resumo" ? hello : tabs.find((t) => t.id === panel)?.label}</h2><p className="t-label tnum mt-1">{fmt(r.cur.from, "dd MMM")} a {fmt(r.cur.to, "dd MMM yyyy")}</p></div>
          <div className="no-print flex flex-wrap items-center gap-2">
            {f.period === "custom" && <><Input type="date" aria-label="De" className="!w-36" max={f.to} value={f.from} onChange={(e) => e.target.value && patch({ from: e.target.value })} /><Input type="date" aria-label="Até" className="!w-36" min={f.from} value={f.to} onChange={(e) => e.target.value && patch({ to: e.target.value })} /></>}
            <div className="max-w-full overflow-x-auto"><Segmented label="Período" value={f.period} onChange={(period) => patch({ period })} options={PERIODS} /></div>
            <IconButton icon={Download} label="Exportar CSV" disabled={!data} onClick={() => data && downloadCsv(`insights-${panel}.csv`, P.csvOf(panel, data))} /><IconButton icon={Printer} label="Exportar PDF" onClick={() => print()} />
          </div>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          {team && <FilterMenu label="Responsável" value={f.ownerId} options={opts(q.data?.sellers)} onChange={(ownerId) => patch({ ownerId })} />}
          <FilterMenu label="Canal" value={f.channel} options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "instagram", label: "Instagram" }]} onChange={(channel) => patch({ channel })} />
          <FilterMenu label="Produto" value={f.productId} options={opts(products)} onChange={(productId) => patch({ productId })} />
          <FilterMenu label="Tag" value={f.tagId} options={opts(tags)} onChange={(tagId) => patch({ tagId })} />
          <FilterMenu label="Origem" value={f.origin} options={ORIGINS.map((o) => ({ value: o, label: o }))} onChange={(origin) => patch({ origin })} />
          {active && <Button size="sm" variant="ghost" onClick={() => patch({ ownerId: "", channel: "", productId: "", tagId: "", origin: "" })}>Limpar</Button>}
          <Checkbox className="ml-auto items-center" checked={f.compare} onChange={(compare) => patch({ compare })}><span className="t-sec">Comparar com o período anterior</span></Checkbox>
        </div>
        <Loaded q={q} skeleton={<Loading />}>{() => data && (data.cur.length || panel === "campanhas" ? <div><View {...data} /></div> : <EmptyState title="Sem leads neste recorte" text="Amplie o período ou tire um dos filtros." />)}</Loaded>
      </div>
    </DrillProvider>
  );
}
