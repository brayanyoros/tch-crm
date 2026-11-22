"use client";
import Link from "next/link";
import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useQuery } from "@/lib/useQuery";
import { deleteTask, listSellers, listTasks, setTaskDone } from "@/lib/data/repositories";
import { TASK_TYPES, type TaskView } from "@/lib/data/types";
import { agoMs, dateTime, dayDiff } from "@/lib/format";
import { can } from "@/lib/permissions";
import { attempt, toast, useApp } from "@/store/app";
import { Avatar, Button, Checkbox, Confirm, Dropdown, EmptyState, FilterMenu, IconButton, Loaded, opts } from "@/components/ui";
import { TaskDialog } from "@/components/tarefas/TaskDialog";

function TaskRow({ t, onEdit, onDelete }: { t: TaskView; onEdit: () => void; onDelete: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const late = !t.doneAt && agoMs(t.dueAt) > 0;
  const toggle = (done: boolean) => {
    if (!done) return void attempt(setTaskDone(t.id, false));
    setLeaving(true);
    setTimeout(() => { void attempt(setTaskDone(t.id, true)); setLeaving(false); toast("Tarefa concluída", { action: { label: "Desfazer", run: () => void attempt(setTaskDone(t.id, false)) } }); }, 320);
  };
  return (
    <li className={`flex items-center gap-3 border-b py-2.5 transition-all duration-300 ${leaving ? "translate-x-2 opacity-30" : ""}`}>
      <Checkbox label={`Concluir: ${t.title}`} checked={!!t.doneAt || leaving} onChange={toggle} />
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onEdit} className={`text-left font-medium ${t.doneAt ? "text-tx2 line-through" : ""}`}>{t.title}</button>
        <p className="t-sec truncate">{t.type}{t.contact && <> · <Link className="underline-offset-4 hover:underline" href={t.deal && t.deal.status !== "perdido" ? `/funil?negocio=${t.deal.id}` : `/contatos/${t.contact.id}`}>{t.contact.name}{t.deal && `, ${t.deal.title.toLowerCase()}`}</Link></>}</p>
      </div>
      <span className={`t-meta tnum shrink-0 ${late ? "text-alert" : "text-tx2"}`}>{dateTime(t.doneAt ?? t.dueAt)}</span>
      <Avatar user={t.owner} size={24} />
      <Dropdown items={[{ label: "Editar", icon: Pencil, run: onEdit }, { label: "Excluir", icon: Trash2, alert: true, run: onDelete }]} trigger={<IconButton icon={MoreHorizontal} label={`Ações de ${t.title}`} />} />
    </li>
  );
}
export default function TarefasPage() {
  const user = useApp((s) => s.user)!;
  const q = useQuery(listTasks), sellers = useQuery(listSellers).data;
  const [owner, setOwner] = useState(""), [type, setType] = useState(""), [edit, setEdit] = useState<TaskView | "nova" | null>(null), [del, setDel] = useState<TaskView | null>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 md:px-6">
        {can(user, "insights.team") && <FilterMenu label="Responsável" value={owner} options={opts(sellers)} onChange={setOwner} />}
        <FilterMenu label="Tipo" value={type} options={TASK_TYPES.map((t) => ({ value: t, label: t }))} onChange={setType} />
        {(owner || type) && <Button size="sm" variant="ghost" onClick={() => { setOwner(""); setType(""); }}>Limpar</Button>}
        <Button variant="primary" icon={Plus} className="ml-auto" onClick={() => setEdit("nova")}>Nova tarefa</Button>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <Loaded q={q}>{(all) => {
          const list = all.filter((t) => (!owner || t.ownerId === owner) && (!type || t.type === type)), open = list.filter((t) => !t.doneAt);
          const groups: [string, TaskView[]][] = [["Atrasadas", open.filter((t) => agoMs(t.dueAt) > 0)], ["Hoje", open.filter((t) => agoMs(t.dueAt) <= 0 && dayDiff(t.dueAt) === 0)], ["Próximas", open.filter((t) => dayDiff(t.dueAt) > 0)], ["Concluídas", list.filter((t) => t.doneAt).sort((a, b) => b.doneAt!.localeCompare(a.doneAt!))]];
          if (!list.length) return <EmptyState title="Nenhuma tarefa aqui" text="Crie um retorno, uma visita ou o envio de um orçamento." action={<Button icon={Plus} onClick={() => setEdit("nova")}>Nova tarefa</Button>} />;
          return <div className="w-full max-w-4xl px-4 pb-10 md:px-6">{groups.filter(([, g]) => g.length).map(([name, g]) => <section key={name} className="pt-6"><h2 className={`t-block flex items-baseline gap-2 border-b pb-2 ${name === "Atrasadas" ? "text-alert" : ""}`}>{name}<span className="t-meta tnum">{g.length}</span></h2><ul>{g.map((t) => <TaskRow key={t.id} t={t} onEdit={() => setEdit(t)} onDelete={() => setDel(t)} />)}</ul></section>)}</div>;
        }}</Loaded>
      </div>
      <TaskDialog open={!!edit} task={edit && edit !== "nova" ? edit : undefined} onClose={() => setEdit(null)} />
      <Confirm open={!!del} onClose={() => setDel(null)} title="Excluir tarefa" text={`“${del?.title ?? ""}” será apagada.`} action="Excluir" onConfirm={() => del && void attempt(deleteTask(del.id), "Tarefa excluída")} />
    </div>
  );
}
