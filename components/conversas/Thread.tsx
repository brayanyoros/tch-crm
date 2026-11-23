"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, ArrowLeft, MailOpen, MoreHorizontal, PanelRight, Trash2, UserRound } from "lucide-react";
import type { ConversationView, User } from "@/lib/data/types";
import { assignContacts, deleteConversation, listSellers, markRead, markUnread, setClosed } from "@/lib/data/repositories";
import { useQuery } from "@/lib/useQuery";
import { attempt, useApp } from "@/store/app";
import { dayLabel } from "@/lib/format";
import { can } from "@/lib/permissions";
import { Avatar, ChannelIcon, Confirm, Dropdown, IconButton, StagePill, type MenuItem } from "@/components/ui";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";

export function Thread({ v, users, onInfo }: { v: ConversationView; users: User[]; onInfo: () => void }) {
  const user = useApp((s) => s.user), router = useRouter();
  const sellers = useQuery(listSellers).data ?? [];
  const [del, setDel] = useState(false);
  const scroller = useRef<HTMLDivElement>(null), n = v.messages.length;
  const held = useRef<string | null>(null); // "marcar como não lida" vale até sair da conversa
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [v.id, n]);
  useEffect(() => { if (v.unread && held.current !== v.id) void markRead(v.id); }, [v.id, v.unread]);
  const mine = can(user, "lead.reply", { ownerId: v.contact.ownerId });
  const menu: MenuItem[] = [
    ...(can(user, "lead.transfer") ? [{ label: "Transferir", icon: UserRound, sub: sellers.map((s) => ({ label: s.name, checked: s.id === v.contact.ownerId, run: () => void attempt(assignContacts([v.contactId], s.id), `Transferido para ${s.name}`) })) }] : []),
    { label: "Marcar como não lida", icon: MailOpen, run: () => { held.current = v.id; void attempt(markUnread(v.id), "Marcada como não lida"); } },
    ...(mine ? [v.closed ? { label: "Reabrir conversa", icon: ArchiveRestore, run: () => void attempt(setClosed(v.id, false), "Conversa reaberta") } : { label: "Encerrar", icon: Archive, run: () => void attempt(setClosed(v.id, true), "Conversa encerrada") }] : []),
    ...(can(user, "lead.delete") ? [{ label: "Excluir conversa", icon: Trash2, alert: true, run: () => setDel(true) }] : []),
  ];
  return (
    <section aria-label={`Conversa com ${v.contact.name}`} className="flex h-full min-h-0 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-3 md:px-6">
        <IconButton icon={ArrowLeft} label="Voltar à lista" className="md:hidden" onClick={() => router.push("/conversas")} />
        <div className="min-w-0 flex-1"><Link href={`/contatos/${v.contactId}`} className="t-block block truncate underline-offset-4 hover:underline">{v.contact.name}</Link><p className="t-sec tnum flex items-center gap-1.5 truncate"><ChannelIcon type={v.channel} size={13} />{v.channel === "whatsapp" ? v.contact.phone : v.contact.instagram}</p></div>
        {v.deal && <span className="hidden sm:inline"><StagePill id={v.deal.stageId} index={v.deal.stageIndex} name={v.deal.stage.name} /></span>}
        <Avatar user={v.owner} size={26} />
        {v.deal && <Link href={`/funil?negocio=${v.deal.id}`} className="hidden underline-offset-4 hover:underline lg:inline">Ver no funil</Link>}
        <IconButton icon={PanelRight} label="Ficha do lead" className="xl:hidden" onClick={onInfo} />
        <Dropdown items={menu} trigger={<IconButton icon={MoreHorizontal} label="Ações da conversa" />} />
      </header>
      <div ref={scroller} className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-5 md:px-6" role="log" aria-label="Mensagens" tabIndex={0}>
        {v.messages.map((m, i) => {
          const day = dayLabel(m.at), sep = !i || dayLabel(v.messages[i - 1].at) !== day;
          return <div key={m.id}>{sep && <div className="my-3 flex items-center gap-3"><span className="h-px flex-1 bg-line" /><span className="t-label">{day}</span><span className="h-px flex-1 bg-line" /></div>}<MessageBubble m={m} author={users.find((u) => u.id === m.authorId)?.name} /></div>;
        })}
        {v.closed && <p className="t-sec py-3 text-center">Conversa encerrada. Uma nova mensagem reabre o atendimento.</p>}
      </div>
      <Composer key={v.id} v={v} />
      <Confirm open={del} onClose={() => setDel(false)} title="Excluir conversa" text={`Todas as mensagens com ${v.contact.name} serão apagadas. Esta ação não pode ser desfeita.`} action="Excluir" onConfirm={() => { router.push("/conversas"); void attempt(deleteConversation(v.id), "Conversa excluída"); }} />
    </section>
  );
}
