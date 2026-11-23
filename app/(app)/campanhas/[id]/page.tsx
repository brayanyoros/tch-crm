"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Pause, Play, X } from "lucide-react";
import { useQuery } from "@/lib/useQuery";
import { getCampaign, listContacts, listSenders, listTemplates, setCampaignStatus, type CampaignView } from "@/lib/data/repositories";
import type { CampaignRecipient, RecipientStatus } from "@/lib/data/types";
import { maskPhone } from "@/lib/campaign/audience";
import { longLabel, shortLabel, TZ_LABEL } from "@/lib/campaign/schedule";
import { render } from "@/lib/campaign/message";
import { int, moneyCents, pct } from "@/lib/format";
import { attempt } from "@/store/app";
import { Button, Confirm, FilterMenu, Loaded, Section, Table, type Col } from "@/components/ui";
import { BarList, StatStrip } from "@/components/insights/parts";
import { CampaignStatusLabel } from "@/components/campanhas/parts";
import { ChatPreview, Note } from "@/components/campanhas/wizard/shared";

const STATUS: RecipientStatus[] = ["Na fila", "Enviada", "Entregue", "Lida", "Respondeu", "Saiu", "Falhou"];
type R = CampaignRecipient & { id: string };
const cols: Col<R>[] = [{ key: "n", label: "Contato", render: (r) => r.name, sort: (r) => r.name }, { key: "t", label: "Telefone", render: (r) => <span className="tnum">{maskPhone(r.phone)}</span> }, { key: "s", label: "Status", render: (r) => <span className={r.status === "Falhou" || r.status === "Saiu" ? "text-alert" : ""}>{r.status}</span>, sort: (r) => STATUS.indexOf(r.status) }];
export default function CampanhaPage() {
  const { id } = useParams<{ id: string }>(), router = useRouter();
  const q = useQuery(() => getCampaign(id), [id]), tpl = useQuery(listTemplates).data, senders = useQuery(listSenders).data, contacts = useQuery(listContacts).data;
  const [st, setSt] = useState(""), [cancel, setCancel] = useState(false);
  return (
    <Loaded q={q}>{(c: CampaignView) => {
      if (c.status === "Rascunho") { router.replace(`/campanhas/nova?rascunho=${c.id}`); return null; }
      const s = c.stats, rows = c.recipients.filter((r) => !st || r.status === st).map((r) => ({ ...r, id: r.contactId })), t = tpl?.find((x) => x.id === c.templateId), sender = senders?.find((x) => x.id === c.senderId);
      const waiting = c.status === "Agendada" || c.status === "Pausada", noEvents = s.queued === s.total;
      return (
        <div className="flex flex-col gap-6 px-4 pb-12 pt-4 md:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/campanhas" aria-label="Voltar às campanhas" className="text-tx2 hover:text-tx"><ArrowLeft size={16} strokeWidth={1.5} /></Link>
            <div className="min-w-0 flex-1"><h2 className="t-page truncate">{c.name}</h2><p className="t-sec flex flex-wrap items-center gap-x-3"><span className="text-tx"><CampaignStatusLabel c={c} /></span><span>{c.audienceLabel}</span>{c.scheduledAt && <span>{longLabel(new Date(c.scheduledAt))} ({TZ_LABEL})</span>}</p></div>
            {c.status === "Agendada" && <Button icon={Pause} onClick={() => void attempt(setCampaignStatus(c.id, "Pausada"), "Campanha pausada")}>Pausar</Button>}
            {c.status === "Pausada" && <Button icon={Play} onClick={() => void attempt(setCampaignStatus(c.id, "retomar"), "Campanha retomada")}>Retomar</Button>}
            {waiting && <Button variant="danger" icon={X} onClick={() => setCancel(true)}>Cancelar</Button>}
          </div>
          {waiting && noEvents && <Note>Destinatários fixados {c.confirmedAt ? `em ${shortLabel(new Date(c.confirmedAt))}` : "na confirmação"}. A integração com a API do WhatsApp não existe neste ambiente: nada foi enviado e não há eventos de entrega. Editar uma campanha confirmada não é possível; cancele e crie outra.</Note>}
          <StatStrip stats={[{ label: "Destinatários", value: int(s.total), note: noEvents ? "aguardando envio" : `${int(s.queued)} na fila` }, { label: "Entregues", value: int(s.delivered), note: s.sent ? `${pct(s.delivered / s.sent)} das enviadas` : "sem eventos" }, { label: "Respostas", value: int(s.replied), note: s.delivered ? `${pct(s.replied / s.delivered)} das entregues` : "sem eventos", highlight: true }, { label: "Saídas e falhas", value: int(s.left + s.failed), note: `${s.left} pediram para sair · ${s.failed} falhas` }]} />
          <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-w-0 flex-col gap-8">
              <Section card title="Do envio à resposta"><BarList bars={([["Enviadas", s.sent], ["Entregues", s.delivered], ["Lidas", s.read], ["Respostas", s.replied]] as const).map(([l, v], i) => ({ key: l, label: l, value: v, text: s.sent ? `${int(v)} · ${pct(v / s.sent)}` : "0", title: l, strong: i === 3 }))} /><p className="mt-3 text-[12.5px] text-tx2">Leitura e resposta vêm dos eventos do WhatsApp. Vendas não são atribuídas a campanhas: falta definir a regra de atribuição.</p></Section>
              <Section card title="Destinatários" aside={<FilterMenu label="Status" value={st} options={STATUS.map((x) => ({ value: x, label: x }))} onChange={setSt} />}><Table caption="Destinatários" cols={cols} rows={rows} onRow={(r) => router.push(`/contatos/${r.contactId}`)} /></Section>
            </div>
            <aside className="flex h-fit flex-col gap-3">
              <ChatPreview sender={sender} template={t} text={render(t, c.vars, contacts?.find((x) => x.id === c.recipients[0]?.contactId))} />
              <dl className="rounded-[12px] border border-line bg-surface p-4 text-[14px]">
                <div className="flex justify-between gap-3 py-1"><dt className="text-tx2">Modelo</dt><dd className="text-right">{t?.label ?? t?.name ?? "—"}</dd></div>
                <div className="flex justify-between gap-3 py-1"><dt className="text-tx2">Remetente</dt><dd className="tnum">{sender?.handle ?? "—"}</dd></div>
                <div className="flex justify-between gap-3 py-1"><dt className="text-tx2">Custo estimado</dt><dd className="tnum">{s.cost === null ? "Sem tarifa" : moneyCents(s.cost)}</dd></div>
              </dl>
            </aside>
          </div>
          <Confirm open={cancel} onClose={() => setCancel(false)} title="Cancelar campanha" text="A campanha não será enviada. Esta ação não pode ser desfeita." action="Cancelar campanha" onConfirm={() => void attempt(setCampaignStatus(c.id, "Cancelada"), "Campanha cancelada")} />
        </div>
      );
    }}</Loaded>
  );
}
