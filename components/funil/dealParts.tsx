"use client";
import { useState, type ReactNode } from "react";
import { CalendarPlus, Check, ChevronDown, Copy, Pencil, Plus } from "lucide-react";
import type { Contact, DealView, Stage, User } from "@/lib/data/types";
import { addNote, assignContacts, listSellers, setTaskDone } from "@/lib/data/repositories";
import { useQuery } from "@/lib/useQuery";
import { attempt, toast, useApp } from "@/store/app";
import { can } from "@/lib/permissions";
import { agoMs, dateTime } from "@/lib/format";
import { Avatar, Button, Dropdown, IconButton, Tooltip, type IconButtonProps } from "@/components/ui";

const GOLD = "inline-flex h-10 w-full items-center justify-center gap-2 rounded-card bg-gold text-[13px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--gold-lt)] active:bg-gold";
export const TipButton = ({ label, className = "", ...p }: IconButtonProps) => <Tooltip text={label} side="top"><IconButton label={label} title={undefined} className={`hover:!bg-bg2 ${className}`} {...p} /></Tooltip>;
export function Group({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return <section><header className="mb-2 flex min-h-6 items-center justify-between"><h3 className="text-[13px] font-semibold leading-5 text-tx">{title}</h3>{aside}</header>{children}</section>;
}

export function StageBlock({ d, stages, editable, onMove }: { d: DealView; stages: Stage[]; editable: boolean; onMove: (id: string) => void }) {
  const name = <><span aria-hidden className="size-2 shrink-0 rounded-full bg-gold" /><span className="min-w-0 flex-1 truncate text-left font-medium">{d.stage.name}</span></>;
  return (
    <div>
      {editable ? (
        <Dropdown align="start" items={stages.map((s) => ({ label: s.name, checked: s.id === d.stageId, run: () => { if (s.id !== d.stageId) onMove(s.id); } }))}
          trigger={<button type="button" aria-label={`Etapa: ${d.stage.name}. Alterar`} className="flex h-9 w-full items-center gap-2.5 rounded-card border border-line bg-bg2 px-3 transition-colors hover:border-line2 data-[state=open]:border-gold">{name}<ChevronDown size={16} strokeWidth={1.5} className="text-tx2" aria-hidden /></button>} />
      ) : <div className="flex h-9 items-center gap-2.5">{name}</div>}
      <div className="mt-2.5 flex h-1.5 items-center gap-1" aria-hidden>{stages.map((s, i) => <span key={s.id} title={s.name} className={`flex-1 rounded-full ${i === d.stageIndex ? "h-1.5 bg-gold" : i < d.stageIndex ? "h-[3px] bg-tx2" : "h-[3px] bg-line"}`} />)}</div>
      <p className="tnum mt-2 text-[12px] leading-4 text-tx2">Etapa {d.stageIndex + 1} de {stages.length}</p>
    </div>
  );
}

const ROW = "grid min-h-9 grid-cols-[84px_minmax(0,1fr)] items-center gap-2";
/** Valor editável: o lápis é permanente; hover e foco realçam a linha. */
export function Info({ label, children, onEdit, editLabel, action }: { label: string; children: ReactNode; onEdit?: () => void; editLabel?: string; action?: ReactNode }) {
  const value = <span className="min-w-0 text-right font-medium [overflow-wrap:anywhere]">{children}</span>;
  return (
    <div className={ROW}>
      <dt className="text-[13px] text-tx2">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end gap-1">
        {onEdit ? <button type="button" aria-label={editLabel} onClick={onEdit} className="group -mr-2 flex min-h-8 min-w-0 items-center justify-end gap-2 rounded-ctl px-2 py-1 transition-colors hover:bg-bg2">{value}<Pencil size={13} strokeWidth={1.5} aria-hidden className="shrink-0 text-tx2 opacity-60 group-hover:opacity-100" /></button> : value}
        {action}
      </dd>
    </div>
  );
}
export function Details({ contact: c, owner: o, deal, onEdit, children }: { contact: Contact; owner: User | null; deal?: DealView; onEdit: () => void; children?: ReactNode }) {
  const user = useApp((s) => s.user), sellers = useQuery(listSellers).data ?? [];
  const handle = c.phone ?? c.instagram;
  const copy = async () => { try { await navigator.clipboard.writeText(handle ?? ""); toast("Contato copiado"); } catch { toast("Não foi possível copiar.", { alert: true }); } };
  const owner = <span className="inline-flex min-w-0 items-center gap-2"><Avatar user={o} size={22} /><span className="min-w-0 text-left font-medium [overflow-wrap:anywhere]">{o?.name ?? "Sem responsável"}</span></span>;
  return (
    <dl className="text-[13px]">
      <Info label="Contato" onEdit={onEdit} editLabel={`Editar contato: ${handle}`} action={handle && <TipButton icon={Copy} size={15} label="Copiar contato" className="-mr-2 ml-1" onClick={() => void copy()} />}><span className={c.phone ? "tnum whitespace-nowrap" : ""}>{handle}</span></Info>
      {c.email && <Info label="E-mail">{c.email}</Info>}
      <Info label="Cidade" onEdit={onEdit} editLabel={`Editar cidade: ${c.city}`}>{c.city}</Info>
      {deal && <Info label="Origem">{deal.origin}</Info>}
      <div className={ROW}>
        <dt className="text-tx2">Responsável</dt>
        <dd className="flex min-w-0 justify-end">{can(user, "lead.transfer") ? (
          <Dropdown items={sellers.map((s) => ({ label: s.name, checked: s.id === c.ownerId, run: () => { if (s.id !== c.ownerId) void attempt(assignContacts([c.id], s.id), `Transferido para ${s.name}`); } }))}
            trigger={<button type="button" aria-label={`Responsável: ${o?.name ?? "nenhum"}. Transferir`} className="-mr-2 flex min-h-8 min-w-0 items-center gap-2 rounded-ctl px-2 py-1 transition-colors hover:bg-bg2 data-[state=open]:bg-bg2">{owner}<ChevronDown size={14} strokeWidth={1.5} className="shrink-0 text-tx2" aria-hidden /></button>} />
        ) : owner}</dd>
      </div>
      {children}
    </dl>
  );
}

export function NextAction({ d, users, onSchedule, onEdit }: { d?: DealView; users: User[]; onSchedule: () => void; onEdit: () => void }) {
  const t = d?.nextTask;
  if (!t) return <><p className="mb-3 text-[13px] text-tx2">Nenhuma tarefa agendada</p><button type="button" onClick={onSchedule} className={GOLD}><CalendarPlus size={16} strokeWidth={1.5} aria-hidden />Agendar tarefa</button></>;
  const late = agoMs(t.dueAt) > 0, owner = users.find((u) => u.id === t.ownerId) ?? null;
  const done = async () => { if (await attempt(setTaskDone(t.id, true))) toast("Tarefa concluída", { action: { label: "Desfazer", run: () => void attempt(setTaskDone(t.id, false)) } }); };
  return (
    <>
      <p className="text-[14px] font-semibold leading-5 [overflow-wrap:anywhere]">{t.title}</p>
      <p className="tnum mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-[18px] text-tx2">
        <span className={late ? "font-medium text-alert" : ""}>{late && "Atrasada · "}{dateTime(t.dueAt)}</span><span>{t.type}</span>
        {owner && <span className="inline-flex items-center gap-1.5"><Avatar user={owner} size={18} />{owner.name}</span>}
      </p>
      <div className="mt-3 flex gap-2"><button type="button" onClick={() => void done()} className={GOLD}><Check size={16} strokeWidth={1.75} aria-hidden />Concluir</button><Button className="!h-10 !rounded-card !bg-bg2" icon={Pencil} onClick={onEdit}>Editar</Button></div>
      <button type="button" onClick={onSchedule} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-ctl text-[13px] text-tx2 hover:text-tx"><Plus size={16} strokeWidth={1.5} aria-hidden />Agendar outra</button>
    </>
  );
}

export function Notes({ d, users }: { d: DealView; users: User[] }) {
  const [text, setText] = useState(""), [busy, setBusy] = useState(false);
  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    if (await attempt(addNote(d.id, text.trim()), "Nota salva")) setText(""); // só limpa depois de persistir
    setBusy(false);
  };
  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <textarea aria-label="Nova nota" placeholder="Adicione uma observação sobre este negócio…" value={text} disabled={busy} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(); } }} className="field block !min-h-24 !rounded-card !bg-bg2 !p-3" />
        {text.trim() && <div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="ghost" disabled={busy} onClick={() => setText("")}>Descartar</Button><Button size="sm" type="submit" className="!bg-bg2" disabled={busy}>{busy ? "Salvando" : "Salvar nota"}</Button></div>}
      </form>
      {d.notes.length > 0 && <ul className="mt-4 flex flex-col gap-4">{d.notes.map((n) => <li key={n.id}><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{n.text}</p><p className="tnum mt-0.5 text-[12px] leading-4 text-tx2">{users.find((u) => u.id === n.authorId)?.name} · {dateTime(n.at)}</p></li>)}</ul>}
    </>
  );
}
