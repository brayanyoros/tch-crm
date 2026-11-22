"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, CheckSquare, ChevronsLeft, ChevronsRight, Kanban, LogOut, Megaphone, MessageSquare, Moon, Settings, Sun, User as UserIcon, Users, Workflow, type LucideIcon } from "lucide-react";
import { useApp } from "@/store/app";
import { useQuery } from "@/lib/useQuery";
import { listConversations, listTasks } from "@/lib/data/repositories";
import { can, type Action } from "@/lib/permissions";
import { agoMs } from "@/lib/format";
import { Avatar, Badge, Dropdown, Segmented, Tooltip } from "@/components/ui";
import { AiButton } from "./AiButton";

interface Item { href: string; label: string; icon: LucideIcon; action?: Action; badge?: "unread" | "late" }
export const NAV: Item[] = [
  { href: "/insights", label: "Insights", icon: BarChart3 }, { href: "/funil", label: "Funil", icon: Kanban },
  { href: "/conversas", label: "Conversas", icon: MessageSquare, badge: "unread" }, { href: "/contatos", label: "Contatos", icon: Users },
  { href: "/tarefas", label: "Tarefas", icon: CheckSquare, badge: "late" }, { href: "/automacoes", label: "Automações", icon: Workflow, action: "automations" },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone, action: "campaigns" }, { href: "/configuracoes/perfil", label: "Configurações", icon: Settings },
];
export function Sidebar({ compact }: { compact: boolean }) {
  const { user, dark, setDark, signOut, signIn, set, setCollapsed } = useApp();
  const path = usePathname(), router = useRouter();
  const unread = useQuery(listConversations, [user?.id]).data?.filter((v) => v.waitingSince).length ?? 0;
  const late = useQuery(listTasks, [user?.id]).data?.filter((t) => !t.doneAt && agoMs(t.dueAt) > 0).length ?? 0;
  if (!user) return null;
  const count = { unread, late };
  return (
    <aside className={`flex h-full flex-col bg-side text-sidetx ${compact ? "w-16" : "w-60"}`}>
      <div className={`flex h-16 shrink-0 items-center ${compact ? "justify-center" : "px-5"}`}>
        <Image src="/brand/simbolo-tch.png" alt="TCH Experiência" width={789} height={704} priority style={{ height: 34, width: "auto" }} />
      </div>
      <div className={compact ? "flex justify-center px-3 pb-4" : "px-3 pb-4"}><AiButton compact={compact} /></div>
      {!compact && <p className="t-label px-5 pb-2 text-sidetx2">Menu principal</p>}
      <nav aria-label="Menu principal" className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {NAV.filter((i) => !i.action || can(user, i.action)).map((i) => {
          const active = path.startsWith("/" + i.href.split("/")[1]), n = i.badge ? count[i.badge] : 0;
          const link = (
            <Link href={i.href} aria-current={active ? "page" : undefined} onClick={() => set({ mobileNav: false })} className={`relative flex h-9 items-center gap-3 text-[13px] outline-offset-[-2px] transition-colors hover:bg-sidehover ${compact ? "justify-center" : "px-5"} ${active ? "bg-sidehover font-semibold text-sidetx before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-gold" : "text-sidetx2 hover:text-sidetx"}`}>
              <i.icon size={17} strokeWidth={1.5} aria-hidden />
              {compact ? <><span className="sr-only">{i.label}</span>{n > 0 && <span className="absolute right-3.5 top-1.5 size-2 rounded-full bg-alert" />}</> : <><span className="flex-1">{i.label}</span><Badge n={n} label={i.badge === "late" ? `${n} atrasadas` : `${n} sem resposta`} /></>}
            </Link>
          );
          return compact ? <Tooltip key={i.href} text={i.label}>{link}</Tooltip> : <div key={i.href}>{link}</div>;
        })}
      </nav>
      {process.env.NODE_ENV === "development" && !compact && (
        <div className="border-t border-sideline px-3 py-3">
          <p className="t-label px-2 pb-1.5 text-sidetx2">Ver como</p>
          <div className="dark"><Segmented label="Ver como" value={user.role} onChange={(r) => { signIn({ vendedor: "ana", gestor: "rafael", admin: "brayan" }[r]); router.push("/insights"); }} options={[{ value: "vendedor", label: "Vendedor" }, { value: "gestor", label: "Gestor" }, { value: "admin", label: "Admin" }]} /></div>
        </div>
      )}
      <div className={`flex items-center border-t border-sideline p-2 ${compact ? "flex-col gap-1" : "gap-1"}`}>
        <Dropdown side="top" align="start" trigger={
          <button type="button" aria-label="Menu do usuário" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-ctl p-1.5 text-left hover:bg-sidehover">
            <span className="dark contents"><Avatar user={user} size={30} /></span>
            {!compact && <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{user.name}</span><span className="t-meta block truncate text-sidetx2">{user.title}</span></span>}
          </button>
        } items={[
          { label: "Perfil", icon: UserIcon, run: () => router.push("/configuracoes/perfil") },
          { label: dark ? "Tema claro" : "Tema escuro", icon: dark ? Sun : Moon, run: () => setDark(!dark) },
          { label: "Sair", icon: LogOut, run: () => { signOut(); router.push("/login"); } },
        ]} />
        <button type="button" onClick={() => setCollapsed(!compact)} aria-label={compact ? "Expandir menu" : "Recolher menu"} className="hidden size-8 items-center justify-center rounded-ctl text-sidetx2 hover:bg-sidehover hover:text-sidetx lg:inline-flex">
          {compact ? <ChevronsRight size={16} strokeWidth={1.5} /> : <ChevronsLeft size={16} strokeWidth={1.5} />}
        </button>
      </div>
    </aside>
  );
}
