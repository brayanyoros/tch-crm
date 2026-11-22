"use client";
import { useState } from "react";
import { useQuery } from "@/lib/useQuery";
import { listConversations, listStages, listUsers } from "@/lib/data/repositories";
import { EmptyState, Skeleton } from "@/components/ui";
import { ConversationList } from "./ConversationList";
import { Thread } from "./Thread";
import { LeadSheet } from "./LeadSheet";

/** Três colunas; no celular vira pilha: lista → conversa → ficha. */
export function Conversas({ id }: { id?: string }) {
  const q = useQuery(listConversations), stages = useQuery(listStages).data ?? [], users = useQuery(listUsers).data ?? [];
  const [info, setInfo] = useState(false);
  const v = q.data?.find((x) => x.id === id);
  return (
    <div className="flex min-h-0 flex-1">
      <div className={`h-full w-full shrink-0 md:block md:w-80 md:border-r ${id ? "hidden" : ""}`}><ConversationList q={q} activeId={id} /></div>
      <div className={`h-full min-w-0 flex-1 flex-col md:flex ${id ? "flex" : "hidden"}`}>
        {v ? <Thread v={v} users={users} onInfo={() => setInfo(true)} />
          : !id ? <EmptyState title="Escolha uma conversa" text="Selecione um lead na lista para ver as mensagens e responder." />
          : q.data ? <EmptyState title="Conversa não encontrada" text="Ela pode ter sido excluída ou transferida para outra pessoa." />
          : !q.error && <div className="flex flex-col gap-3 p-6" role="status" aria-label="Carregando"><Skeleton className="h-14 w-1/2" /><Skeleton className="ml-auto h-16 w-1/2" /><Skeleton className="h-10 w-1/3" /></div>}
      </div>
      {v && <div className="hidden h-full w-[360px] shrink-0 border-l xl:block"><LeadSheet key={v.id} v={v} stages={stages} users={users} /></div>}
      {v && info && <div className="slide-in fixed inset-0 z-40 bg-bg md:left-auto md:w-[380px] md:border-l xl:hidden"><LeadSheet v={v} stages={stages} users={users} onClose={() => setInfo(false)} /></div>}
    </div>
  );
}
