"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Kanban, List, Plus } from "lucide-react";
import { useQuery } from "@/lib/useQuery";
import { isStale, listPipeline, listSellers, listStages, listTags, listUsers } from "@/lib/data/repositories";
import type { DealView } from "@/lib/data/types";
import { ago, agoMs, DAY, fmt, money, now, plural } from "@/lib/format";
import { useApp } from "@/store/app";
import { can } from "@/lib/permissions";
import { Avatar, Button, ChannelIcon, EmptyState, ErrorState, FilterMenu, opts, Segmented, Skeleton, Table, Tag, type Col } from "@/components/ui";
import { Board } from "@/components/funil/Board";
import { DealPanel } from "@/components/funil/DealPanel";
import { NewDealDialog } from "@/components/funil/DealDialogs";
import { useDealActions } from "@/components/funil/useDealActions";

const EMPTY = { ownerId: "", channel: "", tagId: "", period: "" };
const PERIODS = [{ value: "1", label: "Últimas 24 h" }, { value: "7", label: "Últimos 7 dias" }, { value: "15", label: "Últimos 15 dias" }];
const BoardSkeleton = () => <div role="status" aria-label="Carregando" className="flex flex-1 gap-3 overflow-hidden bg-bg2 px-6 pt-4">{[3, 4, 3, 2, 3].map((n, i) => <div key={i} className="flex min-w-[248px] flex-1 flex-col gap-2"><Skeleton className="mb-2 h-4 w-32" />{Array.from({ length: n }, (_, k) => <div key={k} className="rounded-card border bg-bg p-3"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="mt-2 h-3 w-4/5" /><Skeleton className="mt-3 h-4 w-20" /><Skeleton className="mt-4 h-3 w-full" /></div>)}</div>)}</div>;

export default function FunilPage() {
  const user = useApp((s) => s.user)!;
  const router = useRouter(), params = useSearchParams(), selectedId = params.get("negocio") ?? undefined;
  const [f, setF] = useState(EMPTY), [view, setView] = useState<"quadro" | "lista">("quadro"), [creating, setCreating] = useState(false);
  const [moved, setMoved] = useState<Record<string, string>>({});
  const q = useQuery(() => listPipeline({ ownerId: f.ownerId, channel: f.channel, tagId: f.tagId }), [f]);
  const stages = useQuery(listStages).data ?? [], sellers = useQuery(listSellers).data ?? [], tags = useQuery(listTags).data, users = useQuery(listUsers).data ?? [];
  const actions = useDealActions(stages, sellers, (id, st) => setMoved((m) => { const n = { ...m }; if (st) n[id] = st; else delete n[id]; return n; }));
  const month = new Date(now().getFullYear(), now().getMonth(), 1);
  const deals = q.data?.filter((d) => (d.status === "aberto" || new Date(d.closedAt ?? 0) >= month) && (!f.period || agoMs(d.createdAt) <= Number(f.period) * DAY)).map((d) => moved[d.id] ? { ...d, stageId: moved[d.id] } : d);
  const selected = q.data?.find((d) => d.id === selectedId);
  const open = (id?: string) => router.replace(id ? `/funil?negocio=${id}` : "/funil", { scroll: false });
  const active = Object.values(f).some(Boolean);
  const cols: Col<DealView>[] = [
    { key: "nome", label: "Contato", render: (d) => d.contact.name, sort: (d) => d.contact.name },
    { key: "canal", label: "Canal", render: (d) => <ChannelIcon type={d.channel} />, sort: (d) => d.channel },
    { key: "produto", label: "Produto", render: (d) => d.title, sort: (d) => d.title },
    { key: "etapa", label: "Etapa", render: (d) => d.stage.name, sort: (d) => d.stageIndex },
    { key: "tag", label: "Tag", render: (d) => d.tags[0] && <Tag {...d.tags[0]} />, sort: (d) => d.tags[0]?.name ?? "" },
    { key: "resp", label: "Responsável", render: (d) => <span className="inline-flex items-center gap-2"><Avatar user={d.owner} size={22} />{d.owner?.name}</span>, sort: (d) => d.owner?.name ?? "" },
    { key: "msg", label: "Última mensagem", render: (d) => <span className={isStale(d) ? "text-alert" : "text-tx2"}>{ago(d.lastMessageAt)}</span>, sort: (d) => d.lastMessageAt },
    { key: "criado", label: "Criado", render: (d) => fmt(d.createdAt, "dd/MM"), sort: (d) => d.createdAt },
    { key: "valor", label: "Valor", right: true, render: (d) => <span className="font-semibold">{money(d.value)}</span>, sort: (d) => d.value },
  ];
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 md:px-6">
          {can(user, "insights.team") && <FilterMenu label="Responsável" value={f.ownerId} options={opts(sellers)} onChange={(v) => setF({ ...f, ownerId: v })} />}
          <FilterMenu label="Canal" value={f.channel} options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "instagram", label: "Instagram" }]} onChange={(v) => setF({ ...f, channel: v })} />
          <FilterMenu label="Tag" value={f.tagId} options={opts(tags)} onChange={(v) => setF({ ...f, tagId: v })} />
          <FilterMenu label="Período" value={f.period} options={PERIODS} onChange={(v) => setF({ ...f, period: v })} />
          {active && <Button size="sm" variant="ghost" onClick={() => setF(EMPTY)}>Limpar</Button>}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {deals && <span className="t-sec tnum hidden xl:inline">{plural(deals.length, "negócio")} · <b className="font-semibold text-tx">{money(deals.filter((d) => d.status === "aberto").reduce((a, d) => a + d.value, 0))}</b> em aberto</span>}
            <Segmented label="Visualização" value={view} onChange={setView} options={[{ value: "quadro", label: <><Kanban size={13} strokeWidth={1.5} />Quadro</> }, { value: "lista", label: <><List size={13} strokeWidth={1.5} />Lista</> }]} />
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Novo negócio</Button>
          </div>
        </div>
        {q.error ? <ErrorState retry={q.retry} /> : !deals || !stages.length ? <BoardSkeleton />
          : deals.length === 0 && active ? <EmptyState title="Nenhum negócio com esses filtros" text="Tire um dos filtros para ver o restante do funil." action={<Button onClick={() => setF(EMPTY)}>Limpar filtros</Button>} />
          : view === "quadro" ? <Board stages={stages} deals={deals} selectedId={selectedId} onOpen={(d) => open(d.id)} onMove={actions.move} menuFor={actions.menuFor} canMove={actions.canMove} />
          : <div className="flex-1 overflow-y-auto"><Table caption="Negócios do funil" cols={cols} rows={deals} onRow={(d) => open(d.id)} /></div>}
      </div>
      {selected && <DealPanel key={selected.id} d={selected} stages={stages} users={users} menu={actions.menuFor(selected)} canMove={actions.canMove(selected)} onMove={(s) => void actions.move(selected, s)} onClose={() => open()} />}
      {creating && <NewDealDialog onClose={() => setCreating(false)} onCreated={open} />}
      {actions.dialogs}
    </div>
  );
}
