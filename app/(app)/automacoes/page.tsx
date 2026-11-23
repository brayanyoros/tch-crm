"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { useQuery } from "@/lib/useQuery";
import { listAutomations, setAutomationActive } from "@/lib/data/repositories";
import type { Automation } from "@/lib/data/types";
import { ago, agoMs, DAY, plural } from "@/lib/format";
import { attempt } from "@/store/app";
import { Button, Dialog, Dot, EmptyState, Loaded, Switch, Table, type Col } from "@/components/ui";
import { triggerText } from "@/lib/automation/catalog";
import { READY } from "@/components/automacoes/ready";

const week = (a: Automation) => a.runs.filter((r) => agoMs(r.at) < 7 * DAY);
const last = (a: Automation) => a.runs.reduce((m, r) => (r.at > m ? r.at : m), "");
const cols: Col<Automation>[] = [
  { key: "n", label: "Nome", render: (a) => a.name, sort: (a) => a.name },
  { key: "g", label: "Quando", render: (a) => <span className="text-tx2">{triggerText(a.published ?? a.draft)}</span> },
  { key: "s", label: "Status", sort: (a) => a.status, render: (a) => <span className="inline-flex items-center gap-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>{a.published ? <Switch label={`${a.name}: ${a.status === "ativa" ? "pausar" : "ativar"}`} checked={a.status === "ativa"} onChange={(v) => void attempt(setAutomationActive(a.id, v), v ? `${a.name} ativada` : `${a.name} pausada`)} /> : null}<Dot tone={a.status === "ativa" ? "positive" : a.status === "pausada" ? "warning" : "line3"} /><span className={a.status === "ativa" ? "" : "text-tx2"}>{{ ativa: "Ativa", pausada: "Pausada", rascunho: "Rascunho" }[a.status]}{a.published && JSON.stringify(a.published) !== JSON.stringify(a.draft) && <span className="t-meta block text-tx2">Edição não publicada</span>}</span></span> },
  { key: "e", label: "Execuções em 7 dias", right: true, render: (a) => week(a).length, sort: (a) => week(a).length },
  { key: "u", label: "Última execução", render: (a) => <span className="whitespace-nowrap text-tx2">{last(a) ? ago(last(a)) : "Ainda não rodou"}</span>, sort: last },
  { key: "f", label: "Falhas", right: true, sort: (a) => week(a).filter((r) => r.failure).length, render: (a) => { const n = week(a).filter((r) => r.failure).length; return <span className={n ? "font-semibold text-alert" : ""}>{n}</span>; } },
];
export default function AutomacoesPage() {
  const q = useQuery(listAutomations), router = useRouter(), [pick, setPick] = useState(false);
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2.5 md:px-6"><p className="t-sec">{q.data && `${plural(q.data.filter((a) => a.status === "ativa").length, "ativa")} de ${q.data.length}`}</p><Button variant="primary" icon={Plus} className="ml-auto" onClick={() => setPick(true)}>Nova automação</Button></div>
      <Loaded q={q}>{(list) => list.length ? <Table caption="Automações" cols={cols} rows={list} onRow={(a) => router.push(`/automacoes/${a.id}`)} /> : <EmptyState title="Nenhuma automação" text="Comece por um modelo pronto, como a resposta fora do horário." action={<Button onClick={() => setPick(true)}>Ver modelos</Button>} />}</Loaded>
      <Dialog open={pick} onClose={() => setPick(false)} title="Nova automação" description="Comece por um modelo pronto ou do zero.">
        <div className="-my-2">{READY.map((r, i) => <button key={r.name} type="button" onClick={() => router.push(`/automacoes/nova?modelo=${i}`)} className="group flex w-full items-center gap-3 border-b py-3 text-left"><span className="flex-1"><span className="block font-medium">{r.name}</span><span className="t-sec">{r.text}</span></span><ArrowRight size={15} strokeWidth={1.5} className="text-tx2 group-hover:text-tx" aria-hidden /></button>)}<button type="button" onClick={() => router.push("/automacoes/nova")} className="flex w-full items-center gap-2 py-3.5 text-left font-medium"><Plus size={15} strokeWidth={1.5} aria-hidden />Criar do zero</button></div>
      </Dialog>
    </div>
  );
}
