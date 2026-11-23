"use client";
import * as D from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { useApp } from "@/store/app";
import { useQuery } from "@/lib/useQuery";
import { listContacts, listConversations, listPipeline } from "@/lib/data/repositories";
import { money, norm } from "@/lib/format";
import { can } from "@/lib/permissions";
import { CHANNEL, ChannelIcon, Initials, Kbd } from "@/components/ui";
import { NAV } from "./Sidebar";

interface Hit { id: string; group: string; label: string; detail: string; href: string; lead?: ReactNode }
function Content({ close }: { close: () => void }) {
  const [q, setQ] = useState(""), [i, setI] = useState(0);
  const router = useRouter(), user = useApp((s) => s.user);
  const contacts = useQuery(listContacts).data, convs = useQuery(listConversations).data, deals = useQuery(listPipeline).data;
  const hits = useMemo(() => {
    const t = norm(q), has = (...s: (string | undefined)[]) => s.some((x) => x && norm(x).includes(t)), out: Hit[] = [];
    if (!t) return NAV.filter((n) => !n.action || can(user, n.action)).map((n) => ({ id: n.href, group: "Ir para", label: n.label, detail: "", href: n.href, lead: <n.icon size={16} strokeWidth={1.5} className="text-tx2" /> }));
    contacts?.filter((c) => has(c.name, c.phone, c.instagram, c.city)).slice(0, 5).forEach((c) => out.push({ id: "c" + c.id, group: "Contatos", label: c.name, detail: c.phone ?? c.instagram ?? "", href: `/contatos/${c.id}`, lead: <Initials name={c.name} size={24} /> }));
    convs?.filter((v) => has(v.contact.name, v.last?.text)).slice(0, 5).forEach((v) => out.push({ id: "v" + v.id, group: "Conversas", label: v.contact.name, detail: v.last?.text || CHANNEL[v.channel], href: `/conversas/${v.id}`, lead: <ChannelIcon type={v.channel} size={16} /> }));
    deals?.filter((d) => has(d.contact.name, d.title)).slice(0, 5).forEach((d) => out.push({ id: "d" + d.id, group: "Negócios", label: `${d.contact.name} · ${d.title}`, detail: money(d.value), href: `/funil?negocio=${d.id}`, lead: <ChannelIcon type={d.channel} size={16} /> }));
    return out;
  }, [q, contacts, convs, deals, user]);
  useEffect(() => setI(0), [q]);
  const go = (h?: Hit) => { if (h) { close(); router.push(h.href); } };
  return (
    <>
      <div className="flex items-center gap-2.5 border-b px-4">
        <Search size={16} strokeWidth={1.5} className="text-tx2" aria-hidden />
        <input autoFocus role="combobox" aria-expanded aria-controls="palette-list" aria-activedescendant={hits[i]?.id} aria-label="Buscar contato, conversa ou negócio" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar contato, conversa ou negócio" className="h-12 flex-1 bg-transparent text-[14px] outline-none"
          onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setI(Math.min(i + 1, hits.length - 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setI(Math.max(i - 1, 0)); } else if (e.key === "Enter") go(hits[i]); }} />
        <Kbd>Esc</Kbd>
      </div>
      <ul id="palette-list" role="listbox" aria-label="Resultados" className="max-h-[52vh] overflow-y-auto p-2">
        {hits.length === 0 && <li className="t-sec px-3 py-8 text-center">Nada encontrado para “{q}”. Tente o telefone ou só o primeiro nome.</li>}
        {hits.map((h, n) => (
          <li key={h.id}>
            {hits[n - 1]?.group !== h.group && <p className="t-label px-2 pb-1 pt-2">{h.group}</p>}
            <div id={h.id} role="option" aria-selected={n === i} onMouseMove={() => setI(n)} onClick={() => go(h)} className={`flex cursor-pointer items-center gap-3 rounded-ctl px-2 py-2 ${n === i ? "bg-sel" : ""}`}>
              {h.lead}<span className="shrink-0 truncate font-medium">{h.label}</span><span className="t-sec ml-auto min-w-0 truncate">{h.detail}</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
export function Palette() {
  const { palette, set } = useApp();
  const close = () => set({ palette: false });
  return (
    <D.Root open={palette} onOpenChange={(o) => set({ palette: o })}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-scrim" />
        <D.Content aria-describedby={undefined} className="rise fixed inset-x-3 top-[12vh] z-[60] mx-auto max-w-xl overflow-hidden rounded-card border bg-surface shadow-pop outline-none"><D.Title className="sr-only">Busca</D.Title><Content close={close} /></D.Content>
      </D.Portal>
    </D.Root>
  );
}
