"use client";
import Link from "next/link";
import { useState } from "react";
import { MessageSquare, MoreHorizontal, X } from "lucide-react";
import type { DealView, Stage, User } from "@/lib/data/types";
import { ago, dateTime, fmt, money } from "@/lib/format";
import { ChannelIcon, Dropdown, IconButton, type MenuItem } from "@/components/ui";
import { ContactDialog } from "@/components/contatos/ContactDialog";
import { TagPicker } from "@/components/contatos/TagPicker";
import { TaskDialog } from "@/components/tarefas/TaskDialog";
import { Details, Group, Info, NextAction, Notes, StageBlock, TipButton } from "./dealParts";

const LINK = "inline-flex h-9 w-full items-center justify-center gap-2 rounded-card border border-line bg-bg2 text-[13px] font-medium transition-colors hover:border-line2";
export function DealPanel({ d, stages, users, menu, canMove, onMove, onClose }: { d: DealView; stages: Stage[]; users: User[]; menu?: MenuItem[]; canMove: boolean; onMove: (stageId: string) => void; onClose: () => void }) {
  const [dlg, setDlg] = useState<"" | "tarefa" | "editarTarefa" | "contato">("");
  const c = d.contact, close = () => setDlg("");
  return (
    <aside aria-label={`Negócio de ${c.name}`} className="deal-sheet slide-in fixed inset-0 z-40 overflow-y-auto overflow-x-hidden border-line bg-bg text-tx md:static md:w-[360px] md:shrink-0 md:border-l">
      <div className="flex flex-col gap-6 px-5 pb-8 pt-5 sm:px-6">
        <header>
          <div className="flex min-h-6 items-center"><p className="flex-1 text-[12px] leading-4 text-tx2">Negócio</p>{menu && <Dropdown items={menu} trigger={<IconButton icon={MoreHorizontal} label="Ações do negócio" className="-my-1 hover:!bg-bg2" />} />}<TipButton icon={X} label="Fechar detalhes" className="-my-1 -mr-2" onClick={onClose} /></div>
          <h2 className="mt-1 line-clamp-2 text-[19px] font-semibold leading-6 tracking-[-0.01em] [overflow-wrap:anywhere]" title={d.title}>{d.title}</h2>
          <Link href={`/contatos/${c.id}`} className="mt-1 inline-flex max-w-full items-center gap-1.5 text-[13px] text-tx2 underline-offset-4 hover:text-tx hover:underline"><ChannelIcon type={d.channel} /><span className="min-w-0 [overflow-wrap:anywhere]">{c.name}</span></Link>
          <p className="mt-4 text-[12px] leading-4 text-tx2">Valor do negócio</p>
          <p className="tnum mt-0.5 text-[30px] font-semibold leading-9 tracking-[-0.025em]">{money(d.value)}</p>
          <div className="mt-4"><StageBlock d={d} stages={stages} editable={canMove} onMove={onMove} /></div>
          {d.conversationId && <Link href={`/conversas/${d.conversationId}`} className={`mt-4 ${LINK}`}><MessageSquare size={16} strokeWidth={1.5} aria-hidden />Abrir conversa</Link>}
        </header>
        <Group title="Informações">
          <Details contact={c} owner={d.owner} deal={d} onEdit={() => setDlg("contato")}>
            {d.ad && <Info label="Anúncio">{d.ad}</Info>}
            <Info label="Criado em"><span className="tnum">{fmt(d.createdAt, "dd/MM/yyyy")}</span></Info>
            <Info label="Última msg.">{ago(d.lastMessageAt)}</Info>
          </Details>
        </Group>
        <Group title="Tags"><TagPicker neutral contactId={c.id} tags={d.tags} /></Group>
        <div className="border-t border-line pt-6"><Group title="Próxima ação"><NextAction d={d} users={users} onSchedule={() => setDlg("tarefa")} onEdit={() => setDlg("editarTarefa")} /></Group></div>
        <Group title="Notas"><Notes d={d} users={users} /></Group>
        <Group title="Histórico"><ol className="flex flex-col gap-3">{[...d.history].reverse().map((h) => <li key={h.id}><p>{h.text}</p><p className="tnum mt-0.5 text-[12px] leading-4 text-tx2">{dateTime(h.at)}{h.authorId ? ` · ${users.find((u) => u.id === h.authorId)?.name}` : ""}</p></li>)}</ol></Group>
      </div>
      <TaskDialog open={dlg === "tarefa"} onClose={close} preset={{ dealId: d.id, contactId: c.id, ownerId: d.ownerId ?? undefined }} />
      <TaskDialog open={dlg === "editarTarefa"} task={d.nextTask} onClose={close} />
      {dlg === "contato" && <ContactDialog contact={c} onClose={close} />}
    </aside>
  );
}
