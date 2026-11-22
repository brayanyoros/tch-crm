"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Pause, Play, X } from "lucide-react";
import { useQuery } from "@/lib/useQuery";
import { getCampaign, listDeals, listTemplates, setCampaignStatus, type CampaignView } from "@/lib/data/repositories";
import type { CampaignRecipient, RecipientStatus } from "@/lib/data/types";
import { fmt, money, moneyCents, plural } from "@/lib/format";
import { attempt } from "@/store/app";
import { Button, Confirm, FilterMenu, Loaded, Section, Table, type Col } from "@/components/ui";
import { BarList, DrillProvider, StatStrip } from "@/components/insights/parts";
import { CampaignStatusLabel, PhonePreview } from "@/components/campanhas/parts";

const STATUS: RecipientStatus[] = ["Na fila", "Enviada", "Entregue", "Lida", "Respondeu", "Saiu", "Falhou"];
type R = CampaignRecipient & { id: string };
const cols: Col<R>[] = [{ key: "n", label: "Contato", render: (r) => r.name, sort: (r) => r.name }, { key: "t", label: "Telefone", render: (r) => <span className="tnum">{r.phone}</span> }, { key: "s", label: "Status", render: (r) => <span className={r.status === "Falhou" || r.status === "Saiu" ? "text-alert" : ""}>{r.status}</span>, sort: (r) => STATUS.indexOf(r.status) }];
export default function CampanhaPage() {
  const { id } = useParams<{ id: string }>(), router = useRouter();
  const q = useQuery(() => getCampaign(id), [id]), tpl = useQuery(listTemplates).data, deals = useQuery(listDeals).data?.filter((d) => d.campaignId === id) ?? [];
  const [st, setSt] = useState(""), [cancel, setCancel] = useState(false);
  return (
    <Loaded q={q}>{(c: CampaignView) => {
      const s = c.stats, rows = c.recipients.filter((r) => !st || r.status === st).map((r) => ({ ...r, id: r.contactId })), live = c.status === "Enviando" || c.status === "Agendada";
      return (
        <DrillProvider>
          <div className="flex flex-col gap-6 px-4 pb-12 pt-4 md:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/campanhas" aria-label="Voltar às campanhas" className="text-tx2 hover:text-tx"><ArrowLeft size={16} strokeWidth={1.5} /></Link>
              <div className="min-w-0 flex-1"><h2 className="t-page truncate">{c.name}</h2><p className="t-sec tnum flex flex-wrap items-center gap-x-3"><span className="text-tx"><CampaignStatusLabel c={c} /></span><span>{c.audience}</span>{c.scheduledAt && <span>{fmt(c.scheduledAt, "dd/MM/yyyy 'às' HH:mm")}</span>}</p></div>
              {live && <Button icon={Pause} onClick={() => void attempt(setCampaignStatus(c.id, "Pausada"), "Campanha pausada")}>Pausar</Button>}
              {c.status === "Pausada" && <Button icon={Play} onClick={() => void attempt(setCampaignStatus(c.id, "retomar"), "Campanha retomada")}>Retomar</Button>}
              {(live || c.status === "Pausada") && <Button variant="danger" icon={X} onClick={() => setCancel(true)}>Cancelar</Button>}
            </div>
            <StatStrip stats={[{ label: "Receita", value: money(s.revenue), note: plural(s.deals, "negócio gerado", "negócios gerados"), deals, highlight: true }, { label: "Respostas", value: s.replied, note: s.delivered ? `${Math.round((s.replied / s.delivered) * 100)}% das entregues` : "sem envios ainda" }, { label: "Saídas", value: s.left, note: `${s.failed} falhas no envio` }, { label: "Custo", value: moneyCents(s.cost), note: "mensagens entregues" }]} />
            <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="flex flex-col gap-8">
                <Section title="Do envio à resposta"><BarList bars={([["Enviadas", s.sent], ["Entregues", s.delivered], ["Lidas", s.read], ["Respostas", s.replied]] as const).map(([l, v], i) => ({ key: l, label: l, value: v, text: s.sent ? `${v} · ${Math.round((v / s.sent) * 100)}%` : "0", title: l, strong: i === 3 }))} /></Section>
                <Section title="Destinatários" aside={<FilterMenu label="Status" value={st} options={STATUS.map((x) => ({ value: x, label: x }))} onChange={setSt} />}><Table caption="Destinatários" cols={cols} rows={rows} onRow={(r) => router.push(`/contatos/${r.contactId}`)} /></Section>
              </div>
              <PhonePreview body={(tpl?.find((t) => t.id === c.templateId)?.body ?? "").replace("{{nome}}", "Marcelo").replace("{{produto}}", "a sauna a vapor")} header={c.header} buttons={c.buttons} />
            </div>
          </div>
          <Confirm open={cancel} onClose={() => setCancel(false)} title="Cancelar campanha" text="As mensagens que ainda estão na fila não serão enviadas. As já enviadas continuam valendo." action="Cancelar campanha" onConfirm={() => void attempt(setCampaignStatus(c.id, "Cancelada"), "Campanha cancelada")} />
        </DrillProvider>
      );
    }}</Loaded>
  );
}
