"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CalendarPlus, MessageSquare, MoreHorizontal, Plus, Shuffle, Trash2, UserRound } from "lucide-react";
import { useQuery } from "@/lib/useQuery";
import { assignContacts, deleteContact, getContact, listSellers, listUsers, setConsent, setTaskDone } from "@/lib/data/repositories";
import type { DealView } from "@/lib/data/types";
import { agoMs, dateTime, fmt, money } from "@/lib/format";
import { can } from "@/lib/permissions";
import { attempt, useApp } from "@/store/app";
import { Avatar, Button, ChannelIcon, Checkbox, Confirm, Dropdown, EmptyState, IconButton, Initials, Loaded, Table, Tabs, type Col, type MenuItem } from "@/components/ui";
import { TagPicker } from "@/components/contatos/TagPicker";
import { MergeDialog } from "@/components/contatos/MergeDialog";
import { ContactDialog } from "@/components/contatos/ContactDialog";
import { NewDealDialog } from "@/components/funil/DealDialogs";
import { TaskDialog } from "@/components/tarefas/TaskDialog";

type Data = Awaited<ReturnType<typeof getContact>>;
interface Event { id: string; at: string; kind: string; text: string; who?: string }
function timeline(d: Data): Event[] {
  return [
    ...(d.conversation?.messages ?? []).map((m) => ({ id: m.id, at: m.at, kind: m.kind === "nota" ? "Nota interna" : m.kind === "cliente" ? "Mensagem do cliente" : "Mensagem da equipe", text: m.text || m.attachment?.name || "", who: m.authorId })),
    ...d.deals.flatMap((x) => [...x.history.map((h) => ({ id: h.id, at: h.at, kind: "Negócio", text: `${h.text} · ${x.title}`, who: h.authorId })), ...x.notes.map((n) => ({ id: n.id, at: n.at, kind: "Nota", text: n.text, who: n.authorId }))]),
    ...d.tasks.map((t) => ({ id: t.id, at: t.doneAt ?? t.dueAt, kind: t.doneAt ? "Tarefa concluída" : "Tarefa agendada", text: t.title, who: t.ownerId })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}
const dealCols: Col<DealView>[] = [
  { key: "p", label: "Produto", render: (d) => d.title, sort: (d) => d.title },
  { key: "e", label: "Situação", render: (d) => d.status === "perdido" ? `Perdido · ${d.lostReason}` : d.stage.name, sort: (d) => d.stageIndex },
  { key: "r", label: "Responsável", render: (d) => d.owner?.name ?? "–" }, { key: "c", label: "Criado", render: (d) => fmt(d.createdAt, "dd/MM/yyyy"), sort: (d) => d.createdAt },
  { key: "v", label: "Valor", right: true, render: (d) => money(d.value), sort: (d) => d.value },
];
function Consentimento({ d }: { d: Data }) {
  const c = d.contact.consent, [leave, setLeave] = useState(false);
  const label = { autorizado: "Autorizado a receber campanhas", sem: "Sem autorização registrada", saiu: "Pediu para sair" }[c.status];
  return (
    <div className="max-w-lg p-4 md:p-6">
      <p className={`t-block ${c.status === "saiu" ? "text-alert" : ""}`}>{label}</p>
      <p className="t-sec mt-1">{c.date ? `${c.status === "saiu" ? "Saída" : "Autorização"} em ${fmt(c.date, "dd/MM/yyyy 'às' HH:mm")} · ${c.origin}` : "Campanhas não são enviadas a este contato."}</p>
      <div className="mt-4">{c.status === "autorizado" ? <Button variant="danger" onClick={() => setLeave(true)}>Registrar saída</Button> : <Button onClick={() => void attempt(setConsent(d.contact.id, "autorizado", "Registrado pela equipe"), "Autorização registrada")}>Registrar autorização</Button>}</div>
      <Confirm open={leave} onClose={() => setLeave(false)} title="Registrar saída" text={`${d.contact.name} deixa de receber campanhas. As conversas individuais continuam normais.`} action="Registrar saída" onConfirm={() => void attempt(setConsent(d.contact.id, "saiu", "Pedido registrado pela equipe"), "Saída registrada")} />
    </div>
  );
}
export default function ContatoPage() {
  const { id } = useParams<{ id: string }>(), router = useRouter(), user = useApp((s) => s.user);
  const q = useQuery(() => getContact(id), [id]), users = useQuery(listUsers).data ?? [], sellers = useQuery(listSellers).data ?? [];
  const [tab, setTab] = useState("linha"), [dlg, setDlg] = useState<"" | "unir" | "editar" | "negocio" | "tarefa" | "excluir">("");
  const name = (u?: string) => users.find((x) => x.id === u)?.name;
  return (
    <Loaded q={q}>{(d) => {
      const c = d.contact, close = () => setDlg("");
      const menu: MenuItem[] = [{ label: "Editar dados", run: () => setDlg("editar") }, { label: "Unir duplicado", icon: Shuffle, run: () => setDlg("unir") }, ...(can(user, "lead.transfer") ? [{ label: "Transferir", icon: UserRound, sub: sellers.map((s) => ({ label: s.name, checked: s.id === c.ownerId, run: () => void attempt(assignContacts([c.id], s.id), `Transferido para ${s.name}`) })) }] : []), ...(can(user, "lead.delete") ? [{ label: "Excluir contato", icon: Trash2, alert: true, run: () => setDlg("excluir") }] : [])];
      return (
        <div className="flex flex-col">
          <header className="flex flex-col gap-4 px-4 pb-4 pt-4 md:px-6">
            <Link href="/contatos" className="inline-flex items-center gap-1.5 self-start text-tx2 hover:text-tx"><ArrowLeft size={14} strokeWidth={1.5} aria-hidden />Contatos</Link>
            <div className="flex flex-wrap items-start gap-4">
              <Initials name={c.name} size={52} />
              <div className="min-w-0 flex-1"><h2 className="t-page">{c.name}</h2><p className="t-sec tnum flex flex-wrap items-center gap-x-3">{c.phone && <span className="inline-flex items-center gap-1.5"><ChannelIcon type="whatsapp" size={13} />{c.phone}</span>}{c.instagram && <span className="inline-flex items-center gap-1.5"><ChannelIcon type="instagram" size={13} />{c.instagram}</span>}{c.email && <span>{c.email}</span>}<span>{c.city}</span><span className="inline-flex items-center gap-1.5"><Avatar user={c.owner} size={18} />{c.owner?.name ?? "Sem responsável"}</span></p><div className="mt-2.5"><TagPicker contactId={c.id} tags={c.tags} /></div></div>
              <div className="flex flex-wrap gap-2">{d.conversation && <Button variant="primary" icon={MessageSquare} onClick={() => router.push(`/conversas/${d.conversation!.id}`)}>Abrir conversa</Button>}<Button icon={Plus} onClick={() => setDlg("negocio")}>Negócio</Button><Button icon={CalendarPlus} onClick={() => setDlg("tarefa")}>Tarefa</Button><Dropdown items={menu} trigger={<IconButton icon={MoreHorizontal} label="Mais ações" />} /></div>
            </div>
          </header>
          <Tabs label="Ficha do contato" className="px-4 md:px-6" value={tab} onChange={setTab} tabs={[{ id: "linha", label: "Linha do tempo" }, { id: "negocios", label: "Negócios", count: d.deals.length }, { id: "tarefas", label: "Tarefas", count: d.tasks.length }, { id: "consentimento", label: "Consentimento" }]} />
          {tab === "linha" && <ol className="max-w-3xl px-4 py-4 md:px-6">{timeline(d).map((e) => <li key={e.id} className="grid grid-cols-[92px_1fr] gap-4 border-b py-2.5 last:border-0 sm:grid-cols-[130px_1fr]"><span className="t-meta tnum pt-0.5 text-tx2">{dateTime(e.at)}</span><span><span className="t-label">{e.kind}{e.who && ` · ${name(e.who)}`}</span><span className="block [overflow-wrap:anywhere]">{e.text}</span></span></li>)}{!timeline(d).length && <EmptyState title="Nada registrado ainda" text="Mensagens, tarefas e mudanças de etapa aparecem aqui." />}</ol>}
          {tab === "negocios" && (d.deals.length ? <Table caption="Negócios do contato" cols={dealCols} rows={d.deals} onRow={(x) => x.status !== "perdido" && router.push(`/funil?negocio=${x.id}`)} /> : <EmptyState title="Nenhum negócio" text={`Crie o primeiro negócio de ${c.name.split(" ")[0]}.`} action={<Button icon={Plus} onClick={() => setDlg("negocio")}>Novo negócio</Button>} />)}
          {tab === "tarefas" && (d.tasks.length ? <ul className="max-w-3xl px-4 py-2 md:px-6">{d.tasks.map((t) => <li key={t.id} className="border-b py-3 last:border-0"><Checkbox checked={!!t.doneAt} onChange={(v) => void attempt(setTaskDone(t.id, v))}><span><span className={t.doneAt ? "text-tx2 line-through" : ""}>{t.title}</span><span className={`t-meta tnum block ${!t.doneAt && agoMs(t.dueAt) > 0 ? "text-alert" : "text-tx2"}`}>{t.type} · {dateTime(t.dueAt)} · {name(t.ownerId)}</span></span></Checkbox></li>)}</ul> : <EmptyState title="Nenhuma tarefa" text="Agende um retorno, uma visita ou o envio do orçamento." action={<Button icon={CalendarPlus} onClick={() => setDlg("tarefa")}>Criar tarefa</Button>} />)}
          {tab === "consentimento" && <Consentimento d={d} />}
          {dlg === "unir" && <MergeDialog contact={c} onClose={close} onMerged={(k) => { close(); router.replace(`/contatos/${k}`); }} />}
          {dlg === "editar" && <ContactDialog contact={c} onClose={close} />}
          {dlg === "negocio" && <NewDealDialog contactId={c.id} onClose={close} />}
          <TaskDialog open={dlg === "tarefa"} onClose={close} preset={{ contactId: c.id, dealId: d.deals.find((x) => x.status === "aberto")?.id, ownerId: c.ownerId ?? undefined }} />
          <Confirm open={dlg === "excluir"} onClose={close} title="Excluir contato" text={`${c.name}, com conversas, negócios e tarefas, será apagado. Esta ação não pode ser desfeita.`} action="Excluir" onConfirm={() => { router.push("/contatos"); void attempt(deleteContact(c.id), "Contato excluído"); }} />
        </div>
      );
    }}</Loaded>
  );
}
