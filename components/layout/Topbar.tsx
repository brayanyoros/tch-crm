"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Menu, Search } from "lucide-react";
import { useApp } from "@/store/app";
import { useQuery } from "@/lib/useQuery";
import { listConversations } from "@/lib/data/repositories";
import { ago } from "@/lib/format";
import { Badge, Dot, IconButton, Kbd, Popover } from "@/components/ui";
import { ThemeToggle } from "./ThemeToggle";

const TITLES: Record<string, [string, string]> = {
  insights: ["Insights", "Vendas e atendimento do showroom"], funil: ["Funil", "Negócios em andamento"], conversas: ["Conversas", "WhatsApp e Instagram"], contatos: ["Contatos", "Leads e clientes"],
  tarefas: ["Tarefas", "Retornos, visitas e orçamentos"], automacoes: ["Automações", "Regras que cuidam do repetitivo"], campanhas: ["Campanhas", "Disparos pelo WhatsApp"], configuracoes: ["Configurações", "Preferências do CRM"],
};
export function Topbar() {
  const { user, set, notifications } = useApp();
  const router = useRouter();
  const [title, sub] = TITLES[usePathname().split("/")[1]] ?? ["", ""];
  const waiting = useQuery(listConversations, [user?.id]).data?.filter((v) => v.waitingSince).length ?? 0;
  const fresh = notifications.filter((n) => !n.read).length;
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-bg px-4 md:px-6">
      <IconButton icon={Menu} label="Abrir menu" className="-ml-2 md:hidden" onClick={() => set({ mobileNav: true })} />
      <div className="min-w-0 flex-1"><h1 className="t-page truncate">{title}</h1><p className="t-sec hidden truncate sm:block">{sub}</p></div>
      <button type="button" onClick={() => set({ palette: true })} aria-label="Buscar contato, conversa ou negócio" className="no-print hidden h-[34px] w-80 items-center gap-2 rounded-ctl border px-2.5 text-left text-tx2 transition-colors hover:border-line2 lg:flex">
        <Search size={15} strokeWidth={1.5} aria-hidden /><span className="flex-1 truncate">Buscar contato, conversa ou negócio</span><Kbd>Ctrl K</Kbd>
      </button>
      <div className="no-print flex items-center gap-1">
        <IconButton icon={Search} label="Buscar" className="lg:hidden" onClick={() => set({ palette: true })} />
        {waiting > 0 && <Link href="/conversas?aba=nao-lidas" aria-label={`${waiting} conversas sem resposta`} className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-ctl px-2 text-tx3 hover:bg-sel"><Dot tone="alert" /><span><b className="tnum font-semibold text-alert">{waiting}</b><span className="hidden sm:inline"> sem resposta</span></span></Link>}
        <ThemeToggle />
        <Popover align="end" width={340} trigger={<button type="button" aria-label={`Notificações, ${fresh} novas`} className="relative inline-flex size-8 items-center justify-center rounded-ctl text-tx3 hover:bg-sel"><Bell size={16} strokeWidth={1.5} /><span className="absolute -right-0.5 -top-0.5"><Badge n={fresh} /></span></button>}>
          {(close) => (
            <div>
              <div className="flex items-center border-b px-4 py-2.5"><span className="t-block flex-1">Notificações</span>{fresh > 0 && <button type="button" className="t-meta text-tx2 hover:text-tx" onClick={() => set({ notifications: notifications.map((n) => ({ ...n, read: true })) })}>Marcar como lidas</button>}</div>
              {notifications.length === 0 && <p className="t-sec px-4 py-8 text-center">Nada novo por aqui.</p>}
              {notifications.map((n) => (
                <button key={n.id} type="button" onClick={() => { set({ notifications: notifications.map((x) => x.id === n.id ? { ...x, read: true } : x) }); close(); router.push(n.href); }} className="flex w-full items-start gap-2.5 border-b px-4 py-2.5 text-left outline-offset-[-2px] last:border-0 hover:bg-bg2">
                  <span className="pt-1.5">{n.read ? <Dot /> : <Dot tone="alert" />}</span><span className="flex-1">{n.text}<span className="t-meta block text-tx2">{ago(n.at)}</span></span>
                </button>
              ))}
            </div>
          )}
        </Popover>
      </div>
    </header>
  );
}
