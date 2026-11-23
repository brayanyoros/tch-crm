"use client";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import { useApp, toast } from "@/store/app";
import { simulateIncoming } from "@/lib/data/repositories";
import { onNotify, tick } from "@/lib/automation/engine";
import { can, type Action } from "@/lib/permissions";
import { Toaster, TooltipProvider } from "@/components/ui";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Palette } from "@/components/layout/Palette";
import { AiPanel } from "@/components/layout/AiPanel";

const GUARD: Record<string, Action> = { automacoes: "automations", campanhas: "campaigns" };

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, ready, boot, collapsed, mobileNav, set, aiOpen } = useApp();
  const router = useRouter(), path = usePathname();
  const guard = GUARD[path.split("/")[1]], blocked = !!user && !!guard && !can(user, guard);
  const editor = /^\/automacoes\/.+/.test(path) || path === "/campanhas/nova"; // editor de fluxos: barra própria e menu recolhido
  useEffect(() => { boot(); }, [boot]);
  useEffect(() => { if (ready && !user) router.replace("/login"); else if (blocked) router.replace("/insights"); }, [ready, user, blocked, router]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) { if (e.key === "Escape" && !e.defaultPrevented && useApp.getState().mobileNav) set({ mobileNav: false }); return; }
      const k = e.key.toLowerCase();
      if (k === "k") { e.preventDefault(); set({ palette: !useApp.getState().palette }); }
      if (k === "j") { e.preventDefault(); set({ aiOpen: !useApp.getState().aiOpen }); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [set]);
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      const m = simulateIncoming();
      if (!m) return;
      const href = `/conversas/${m.conversationId}`;
      useApp.getState().notify(`${m.name} enviou uma mensagem`, href);
      if (!location.pathname.startsWith(href) && user.notify.mensagens) toast(`${m.name}: ${m.text}`, { action: { label: "Abrir", run: () => router.push(href) } });
    }, 75_000);
    return () => clearInterval(t);
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    onNotify((id, text, href) => { if (id === user.id) { useApp.getState().notify(text, href); toast(text, { action: { label: "Abrir", run: () => router.push(href) } }); } });
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, [user, router]);

  if (!user || blocked) return <div className="h-full bg-bg" aria-busy="true" />;
  return (
    <TooltipProvider delayDuration={200}>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[99] focus:bg-bg focus:p-3">Pular para o conteúdo</a>
      <div className="print-full flex h-dvh overflow-hidden">
        <div className={`no-print hidden shrink-0 ${editor ? "xl:block" : "lg:block"} ${collapsed ? "w-16" : "w-60"}`}><Sidebar compact={collapsed} /></div>
        <div className={`no-print hidden w-16 shrink-0 md:block ${editor ? "xl:hidden" : "lg:hidden"}`}><Sidebar compact /></div>
        {mobileNav && <div className="fixed inset-0 z-50 flex md:hidden"><Sidebar compact={false} /><button type="button" aria-label="Fechar menu" className="flex-1 bg-scrim" onClick={() => set({ mobileNav: false })} /></div>}
        <div className="print-full flex min-w-0 flex-1 flex-col">
          {!editor && <Topbar />}
          <main id="conteudo" key={user.id} className="print-full flex min-h-0 flex-1 flex-col overflow-y-auto"><Suspense>{children}</Suspense></main>
        </div>
        {aiOpen && <AiPanel />}
      </div>
      <Palette />
      <Toaster />
    </TooltipProvider>
  );
}
