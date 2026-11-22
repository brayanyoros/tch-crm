"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { TASK_TYPES, type Task } from "@/lib/data/types";
import { createTask, listPipeline, listSellers, updateTask } from "@/lib/data/repositories";
import { useQuery } from "@/lib/useQuery";
import { attempt, useApp } from "@/store/app";
import { now, toLocalInput, DAY } from "@/lib/format";
import { Button, Dialog, Field, Input, Select, opts } from "@/components/ui";

const schema = z.object({ title: z.string().trim().min(3, "Descreva a tarefa."), type: z.enum(TASK_TYPES), dealId: z.string(), dueAt: z.string().min(1, "Escolha data e hora."), ownerId: z.string().min(1, "Escolha quem vai fazer.") });
type Form = z.infer<typeof schema>;
/** Amanhã às 9h, em horário local. */
export const tomorrow9 = () => { const d = new Date(now().getTime() + DAY); d.setHours(9, 0, 0, 0); return d; };

function TaskForm({ task, preset, onClose }: { task?: Task; preset?: Partial<Task>; onClose: () => void }) {
  const user = useApp((s) => s.user)!;
  const deals = useQuery(listPipeline).data, sellers = useQuery(listSellers).data;
  const base = task ?? preset;
  const f = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { title: base?.title ?? "", type: base?.type ?? "Retorno", dealId: base?.dealId ?? "", dueAt: toLocalInput(base?.dueAt ?? tomorrow9()), ownerId: base?.ownerId ?? user.id } });
  const { errors, isSubmitting } = f.formState;
  const owners = sellers?.some((s) => s.id === user.id) ? sellers : [...(sellers ?? []), user];
  const save = f.handleSubmit(async (v) => {
    const p = { ...v, dealId: v.dealId || undefined, contactId: v.dealId ? deals?.find((d) => d.id === v.dealId)?.contactId : base?.contactId, dueAt: new Date(v.dueAt).toISOString() };
    if (await attempt(task ? updateTask(task.id, p) : createTask(p), task ? "Tarefa atualizada" : "Tarefa criada")) onClose();
  });
  return (
    <Dialog open onClose={onClose} title={task ? "Editar tarefa" : "Nova tarefa"} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={isSubmitting} onClick={save}>Salvar</Button></>}>
      <Field label="O que fazer" error={errors.title?.message}><Input autoFocus aria-invalid={!!errors.title} {...f.register("title")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo"><Select options={TASK_TYPES.map((t) => ({ value: t, label: t }))} {...f.register("type")} /></Field>
        <Field label="Data e hora" error={errors.dueAt?.message}><Input type="datetime-local" {...f.register("dueAt")} /></Field>
      </div>
      <Field label="Negócio"><Select key={deals?.length ?? 0} placeholder="Sem negócio ligado" options={(deals ?? []).map((d) => ({ value: d.id, label: `${d.contact.name} · ${d.title}` }))} {...f.register("dealId")} /></Field>
      {user.role !== "vendedor" && <Field label="Responsável" error={errors.ownerId?.message}><Select key={owners.length} options={opts(owners)} {...f.register("ownerId")} /></Field>}
    </Dialog>
  );
}
export function TaskDialog({ open, ...p }: { open: boolean; task?: Task; preset?: Partial<Task>; onClose: () => void }) {
  return open ? <TaskForm {...p} /> : null;
}
