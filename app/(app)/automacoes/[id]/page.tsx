"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useQuery } from "@/lib/useQuery";
import { deleteAutomation, getAutomation, setAutomationActive } from "@/lib/data/repositories";
import type { AutomationRun } from "@/lib/data/types";
import { dateTime } from "@/lib/format";
import { attempt } from "@/store/app";
import { Confirm, EmptyState, IconButton, Loaded, Switch, Table, Tabs, type Col } from "@/components/ui";
import { Editor } from "@/components/automacoes/Editor";

const cols: Col<AutomationRun>[] = [
  { key: "d", label: "Data", render: (r) => <span className="tnum whitespace-nowrap">{dateTime(r.at)}</span>, sort: (r) => r.at }, { key: "l", label: "Lead", render: (r) => r.contactName, sort: (r) => r.contactName },
  { key: "a", label: "Ações", render: (r) => <span className="text-tx2">{r.actions.join(", ")}</span> }, { key: "r", label: "Resultado", render: (r) => r.failure ? <span className="text-alert">Falhou: {r.failure}</span> : "Concluída", sort: (r) => r.failure ?? "" },
];
export default function AutomacaoPage() {
  const { id } = useParams<{ id: string }>(), router = useRouter(), q = useQuery(() => getAutomation(id), [id]);
  const [tab, setTab] = useState("regra"), [del, setDel] = useState(false);
  return (
    <Loaded q={q}>{(a) => (
      <div className="flex flex-col">
        <div className="flex items-center gap-3 px-4 pb-2 pt-3 md:px-6"><Link href="/automacoes" aria-label="Voltar às automações" className="text-tx2 hover:text-tx"><ArrowLeft size={16} strokeWidth={1.5} /></Link><h2 className="t-block flex-1 truncate">{a.name}</h2><Switch label={a.active ? "Pausar" : "Ativar"} checked={a.active} onChange={(v) => void attempt(setAutomationActive(a.id, v), v ? "Automação ativada" : "Automação pausada")} /><span>{a.active ? "Ativa" : "Pausada"}</span><IconButton icon={Trash2} label="Excluir automação" onClick={() => setDel(true)} /></div>
        <Tabs label="Automação" className="px-4 md:px-6" value={tab} onChange={setTab} tabs={[{ id: "regra", label: "Regra" }, { id: "historico", label: "Histórico", count: a.runs.length }]} />
        {tab === "regra" ? <Editor initial={a} automation={a} /> : a.runs.length ? <Table caption="Histórico" cols={cols} rows={a.runs} initialSort={{ key: "d", desc: true }} /> : <EmptyState title="Ainda não rodou" text="Cada execução aparece aqui com o lead e as ações." />}
        <Confirm open={del} onClose={() => setDel(false)} title="Excluir automação" text={`“${a.name}” e o histórico serão apagados.`} action="Excluir" onConfirm={() => { router.push("/automacoes"); void attempt(deleteAutomation(a.id), "Automação excluída"); }} />
      </div>
    )}</Loaded>
  );
}
