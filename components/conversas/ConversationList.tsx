"use client";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ConversationView } from "@/lib/data/types";
import type { Query } from "@/lib/useQuery";
import { useApp } from "@/store/app";
import { listTime } from "@/lib/format";
import { Avatar, Badge, ChannelIcon, EmptyState, ErrorState, Initials, Pill, Segmented, Skeleton, Tabs } from "@/components/ui";

type Tab = "todas" | "minhas" | "nao-lidas";
export function preview(v: ConversationView) {
  const m = v.last;
  if (!m) return "Sem mensagens";
  const body = m.text || (m.attachment ? { pdf: `PDF · ${m.attachment.name}`, imagem: "Imagem", audio: "Áudio" }[m.attachment.type] : "");
  return m.kind === "equipe" ? `${m.authorId ? "Você" : "Automático"}: ${body}` : body;
}
const EMPTY: Record<Tab, [string, string]> = { todas: ["Nenhuma conversa neste canal", "Mensagens novas do WhatsApp e do Instagram aparecem aqui."], minhas: ["Você ainda não tem conversas", "Assuma um lead sem responsável na aba Todas."], "nao-lidas": ["Tudo respondido", "Nenhum cliente espera resposta agora."] };

export function ConversationList({ q, activeId }: { q: Query<ConversationView[]>; activeId?: string }) {
  const user = useApp((s) => s.user)!;
  const param = useSearchParams().get("aba");
  const [tab, setTab] = useState<Tab>(param === "nao-lidas" ? "nao-lidas" : "todas"), [ch, setCh] = useState<"todos" | "whatsapp" | "instagram">("todos");
  const all = q.data?.filter((v) => ch === "todos" || v.channel === ch) ?? [];
  const inTab = (t: Tab) => all.filter((v) => t === "todas" ? true : t === "minhas" ? v.contact.ownerId === user.id : v.unread > 0 || !!v.waitingSince);
  const list = inTab(tab);
  const suffix = tab === "nao-lidas" ? "?aba=nao-lidas" : "";
  return (
    <section aria-label="Lista de conversas" className="flex h-full min-h-0 flex-col">
      <Tabs label="Conversas" className="px-4" value={tab} onChange={(t) => setTab(t as Tab)} tabs={[{ id: "todas", label: "Todas" }, { id: "minhas", label: "Minhas" }, { id: "nao-lidas", label: "Não lidas", count: inTab("nao-lidas").length }]} />
      <div className="border-b px-4 py-2.5"><Segmented label="Canal" value={ch} onChange={setCh} options={[{ value: "todos", label: "Todos" }, { value: "whatsapp", label: <><ChannelIcon type="whatsapp" size={13} />WhatsApp</> }, { value: "instagram", label: <><ChannelIcon type="instagram" size={13} />Instagram</> }]} /></div>
      {q.error ? <ErrorState retry={q.retry} /> : !q.data ? <div role="status" aria-label="Carregando">{Array.from({ length: 8 }, (_, i) => <div key={i} className="flex gap-3 border-b px-4 py-3"><Skeleton className="size-9 rounded-full" /><div className="flex-1"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="mt-2 h-3 w-full" /></div></div>)}</div>
        : list.length === 0 ? <EmptyState title={EMPTY[tab][0]} text={EMPTY[tab][1]} />
        : <ul className="flex-1 overflow-y-auto">{list.map((v) => (
          <li key={v.id}>
            <Link href={`/conversas/${v.id}${suffix}`} scroll={false} aria-current={v.id === activeId ? "true" : undefined} className={`flex gap-3 border-b px-4 py-3 outline-offset-[-2px] transition-colors ${v.id === activeId ? "bg-sel" : "hover:bg-bg2"}`}>
              <Initials name={v.contact.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2"><span className={`min-w-0 flex-1 truncate ${v.unread ? "font-semibold" : "font-medium"}`}>{v.contact.name}</span><span className={`t-meta tnum ${v.unread ? "text-alert" : "text-tx2"}`}>{v.last && listTime(v.last.at)}</span></div>
                <p className={`truncate text-[12.5px] leading-[18px] ${v.unread ? "text-tx" : "text-tx2"}`}>{preview(v)}</p>
                <div className="mt-1.5 flex items-center gap-2"><ChannelIcon type={v.channel} size={13} />{v.closed ? <Pill>Encerrada</Pill> : v.deal ? <Pill>{v.deal.stage.name}</Pill> : <Pill>Sem negócio</Pill>}<span className="ml-auto flex items-center gap-1.5"><Badge n={v.unread} label={`${v.unread} não lidas`} /><Avatar user={v.owner} size={20} /></span></div>
              </div>
            </Link>
          </li>
        ))}</ul>}
    </section>
  );
}
