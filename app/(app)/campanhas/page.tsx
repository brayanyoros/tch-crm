"use client";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useQuery } from "@/lib/useQuery";
import { listCampaigns, type CampaignView } from "@/lib/data/repositories";
import { fmt, int, money } from "@/lib/format";
import { Button, EmptyState, Loaded, Table, type Col } from "@/components/ui";
import { CampaignStatusLabel } from "@/components/campanhas/parts";

const num = (key: string, label: string, f: (c: CampaignView) => number, show = int): Col<CampaignView> => ({ key, label, right: true, sort: f, render: (c) => (c.stats.sent ? show(f(c)) : <span className="text-tx2">–</span>) });
const cols: Col<CampaignView>[] = [
  { key: "n", label: "Nome", render: (c) => c.name, sort: (c) => c.name }, { key: "s", label: "Status", render: (c) => <CampaignStatusLabel c={c} />, sort: (c) => c.status },
  { key: "p", label: "Público", render: (c) => <span>{c.audience}{c.stats.total > 0 && <span className="tnum text-tx2"> · {c.stats.total}</span>}</span> }, { key: "d", label: "Data", render: (c) => <span className="tnum whitespace-nowrap">{c.scheduledAt ? fmt(c.scheduledAt, "dd/MM HH:mm") : "–"}</span>, sort: (c) => c.scheduledAt },
  num("e", "Entregues", (c) => c.stats.delivered), num("l", "Lidas", (c) => c.stats.read), num("r", "Respostas", (c) => c.stats.replied), num("v", "Receita", (c) => c.stats.revenue, money),
];
export default function CampanhasPage() {
  const q = useQuery(listCampaigns), router = useRouter();
  const novo = <Button variant="primary" icon={Plus} onClick={() => router.push("/campanhas/nova")}>Nova campanha</Button>;
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center border-b px-4 py-2.5 md:px-6"><p className="t-sec">Só contatos com autorização registrada recebem campanhas.</p><div className="ml-auto">{novo}</div></div>
      <Loaded q={q}>{(list) => list.length ? <Table caption="Campanhas" cols={cols} rows={list} onRow={(c) => router.push(c.status === "Rascunho" ? `/campanhas/nova?rascunho=${c.id}` : `/campanhas/${c.id}`)} /> : <EmptyState title="Nenhuma campanha" text="Crie o primeiro convite para o showroom." action={novo} />}</Loaded>
    </div>
  );
}
