"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { ConversationView, Stage, User } from "@/lib/data/types";
import { listSellers } from "@/lib/data/repositories";
import { useQuery } from "@/lib/useQuery";
import { money } from "@/lib/format";
import { Button } from "@/components/ui";
import { Details, Group, NextAction, Notes, StageBlock, TipButton } from "@/components/funil/dealParts";
import { useDealActions } from "@/components/funil/useDealActions";
import { NewDealDialog } from "@/components/funil/DealDialogs";
import { ContactDialog } from "@/components/contatos/ContactDialog";
import { TagPicker } from "@/components/contatos/TagPicker";
import { TaskDialog } from "@/components/tarefas/TaskDialog";

export function LeadSheet({ v, stages, users, onClose }: { v: ConversationView; stages: Stage[]; users: User[]; onClose?: () => void }) {
  const [dlg, setDlg] = useState<"" | "tarefa" | "editarTarefa" | "negocio" | "contato">("");
  const sellers = useQuery(listSellers).data ?? [], actions = useDealActions(stages, sellers);
  const d = v.deal, c = v.contact, close = () => setDlg("");
  return (
    <aside aria-label="Detalhes do negócio" className="deal-sheet h-full overflow-y-auto overflow-x-hidden bg-bg text-tx">
      <div className="flex flex-col gap-6 px-5 pb-8 pt-5 sm:px-6">
        <header>
          <div className="flex min-h-6 items-center justify-between"><p className="text-[12px] leading-4 text-tx2">Negócio</p>{onClose && <TipButton icon={X} label="Fechar detalhes" className="-my-1 -mr-2" onClick={onClose} />}</div>
          {d ? <>
            <h2 className="mt-1 line-clamp-2 text-[19px] font-semibold leading-6 tracking-[-0.01em] [overflow-wrap:anywhere]" title={d.title}>{d.title}</h2>
            <p className="mt-4 text-[12px] leading-4 text-tx2">Valor do negócio</p>
            <p className="tnum mt-0.5 text-[30px] font-semibold leading-9 tracking-[-0.025em]">{money(d.value)}</p>
          </> : <><p className="mb-3 mt-1 text-[13px] text-tx2">Este contato ainda não tem negócio aberto.</p><Button className="!h-10 w-full !rounded-card !bg-bg2" icon={Plus} onClick={() => setDlg("negocio")}>Criar negócio</Button></>}
          {d && stages.length > 0 && <div className="mt-4"><StageBlock d={d} stages={stages} editable={actions.canMove(d)} onMove={(id) => void actions.move(d, id)} /></div>}
        </header>
        <Group title="Informações"><Details contact={c} owner={v.owner} deal={d} onEdit={() => setDlg("contato")} /></Group>
        <Group title="Tags"><TagPicker neutral contactId={c.id} tags={v.tags} /></Group>
        <div className="border-t border-line pt-6"><Group title="Próxima ação"><NextAction d={d} users={users} onSchedule={() => setDlg("tarefa")} onEdit={() => setDlg("editarTarefa")} /></Group></div>
        {d && <Group title="Notas"><Notes d={d} users={users} /></Group>}
      </div>
      <TaskDialog open={dlg === "tarefa"} onClose={close} preset={{ dealId: d?.id, contactId: c.id, ownerId: c.ownerId ?? undefined }} />
      <TaskDialog open={dlg === "editarTarefa"} task={d?.nextTask} onClose={close} />
      {dlg === "negocio" && <NewDealDialog contactId={c.id} onClose={close} />}
      {dlg === "contato" && <ContactDialog contact={c} onClose={close} />}
      {actions.dialogs}
    </aside>
  );
}
