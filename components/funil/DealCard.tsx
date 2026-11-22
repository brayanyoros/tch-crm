"use client";
import { Clock, MoreHorizontal } from "lucide-react";
import type { DealView } from "@/lib/data/types";
import { isStale } from "@/lib/data/repositories";
import { ago, money } from "@/lib/format";
import { Avatar, ChannelIcon, Dropdown, Tag, type MenuItem } from "@/components/ui";

export function DealCard({ d, selected, menu, onOpen }: { d: DealView; selected?: boolean; menu?: MenuItem[]; onOpen?: () => void }) {
  const stale = isStale(d);
  return (
    <article className={`relative rounded-card border bg-bg p-3 transition-colors ${selected ? "border-gold" : "hover:border-line2"}`}>
      <div className="flex items-start gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold after:absolute after:inset-0">{d.contact.name}</button>
        <span className="pt-0.5"><ChannelIcon type={d.channel} /></span>
        {menu && <div className="relative z-10 -my-1 -mr-1.5" onPointerDown={(e) => e.stopPropagation()}><Dropdown items={menu} trigger={<button type="button" aria-label={`Ações de ${d.contact.name}`} className="inline-flex size-6 items-center justify-center rounded-tag text-tx2 hover:bg-sel hover:text-tx"><MoreHorizontal size={15} strokeWidth={1.5} /></button>} /></div>}
      </div>
      <p className="t-sec truncate">{d.title}</p>
      <p className="t-val mt-1.5">{money(d.value)}</p>
      <div className="mt-2.5 flex items-center gap-2 border-t pt-2.5">
        {d.tags[0] && <Tag {...d.tags[0]} />}
        {d.status === "aberto" && <span className={`t-meta tnum ml-auto inline-flex shrink-0 items-center gap-1 ${stale ? "text-alert" : "text-tx2"}`}>{stale && <Clock size={12} strokeWidth={1.75} aria-label="Sem mensagem há mais de 24 h" />}{ago(d.lastMessageAt)}</span>}
        <span className={d.status === "aberto" ? "" : "ml-auto"}><Avatar user={d.owner} size={22} /></span>
      </div>
    </article>
  );
}
