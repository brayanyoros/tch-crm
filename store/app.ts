"use client";
import { create } from "zustand";
import type { AiThread, User } from "@/lib/data/types";
import { nowIso, setSession } from "@/lib/data/db";
import { getUserSync } from "@/lib/data/repositories";
import { REMOTE } from "@/lib/supabase/client";
import { hydrate, onRemoteNotification, signOut as remoteSignOut } from "@/lib/data/remote";

export interface Toast { id: number; text: string; alert?: boolean; action?: { label: string; run: () => void } }
export interface Notification { id: string; text: string; at: string; href: string; read: boolean }
export type Period = "7" | "30" | "mes" | "custom";
export interface InsightFilters { period: Period; from: string; to: string; ownerId: string; channel: string; productId: string; tagId: string; origin: string; compare: boolean }
interface AppState {
  user: User | null; ready: boolean; dark: boolean; collapsed: boolean; mobileNav: boolean; palette: boolean; toasts: Toast[]; notifications: Notification[];
  aiOpen: boolean; aiThreads: AiThread[]; aiThreadId: string | null; aiConversationId: string | null; aiContactId: string | null;
  composerDraft: { conversationId: string; text: string } | null;
  insights: InsightFilters;
  boot: () => void; signIn: (id: string) => void; signOut: () => void; refreshUser: () => void; setDark: (d: boolean) => void; setCollapsed: (c: boolean) => void;
  set: (p: Partial<AppState>) => void; toast: (text: string, o?: Omit<Toast, "id" | "text">) => void; dismiss: (id: number) => void; notify: (text: string, href: string) => void;
}
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  put: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* armazenamento bloqueado */ } },
};
const paint = (d: boolean) => document.documentElement.classList.toggle("dark", d);
const minutesAgo = (min: number) => new Date(new Date(nowIso()).getTime() - min * 60000).toISOString();
let seq = 0, booting = false;

export const useApp = create<AppState>((set, get) => ({
  user: null, ready: false, dark: false, collapsed: false, mobileNav: false, palette: false, toasts: [], notifications: [],
  aiOpen: false, aiThreads: [], aiThreadId: null, aiConversationId: null, aiContactId: null, composerDraft: null,
  insights: { period: "mes", from: "2026-11-01", to: "2026-11-22", ownerId: "", channel: "", productId: "", tagId: "", origin: "", compare: true },
  boot: () => {
    if (get().ready || booting) return;
    const id = ls.get("tch-user");
    set({ collapsed: ls.get("tch-collapsed") === "1" });
    if (REMOTE) { // sessão do Supabase Auth: carrega os dados permitidos pela RLS e liga o Realtime
      booting = true;
      onRemoteNotification((text, href) => { get().notify(text, href); if (get().user?.notify.mensagens) get().toast(text); });
      hydrate().then((u) => { booting = false; if (u) get().signIn(u.id); else { paint(false); set({ ready: true }); } })
        .catch(() => { booting = false; paint(false); set({ ready: true }); });
      return;
    }
    if (id && getUserSync(id)) get().signIn(id);
    else { paint(false); set({ ready: true }); }
  },
  signIn: (id) => {
    setSession(id);
    ls.put("tch-user", id);
    const dark = ls.get("tch-theme-" + id) === "dark", u = getUserSync(id);
    paint(dark);
    set({
      user: u && { ...u }, ready: true, dark, aiThreads: [], aiThreadId: null, aiConversationId: null, aiContactId: null, composerDraft: null, insights: { ...get().insights, ownerId: "" },
      notifications: REMOTE ? [] : [
        { id: "nt1", text: "Daniela Rocha enviou a primeira mensagem", at: minutesAgo(18), href: "/conversas", read: false },
        ...(u?.role !== "vendedor" || id === "ana" ? [{ id: "nt2", text: "Gustavo Rezende saiu da janela de 24h", at: minutesAgo(142), href: "/conversas", read: false }] : []),
        { id: "nt3", text: "Há tarefas de ontem em atraso", at: minutesAgo(330), href: "/tarefas", read: true },
      ],
    });
  },
  signOut: () => { if (REMOTE) void remoteSignOut(); setSession(null); ls.put("tch-user", null); paint(false); set({ user: null, dark: false, aiOpen: false, notifications: [], aiThreads: [], aiThreadId: null, composerDraft: null }); },
  refreshUser: () => { const cur = get().user, u = cur && getUserSync(cur.id); if (u) set({ user: { ...u } }); },
  setDark: (dark) => { paint(dark); ls.put("tch-theme-" + get().user?.id, dark ? "dark" : "light"); set({ dark }); },
  setCollapsed: (collapsed) => { ls.put("tch-collapsed", collapsed ? "1" : "0"); set({ collapsed }); },
  set: (p) => set(p),
  toast: (text, o) => { const id = ++seq; set({ toasts: [...get().toasts.slice(-2), { id, text, ...o }] }); setTimeout(() => get().dismiss(id), 6000); },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  notify: (text, href) => set({ notifications: [{ id: "n" + ++seq, text, at: nowIso(), href, read: false }, ...get().notifications] }),
}));
export const toast = (text: string, o?: Omit<Toast, "id" | "text">) => useApp.getState().toast(text, o);
/** Executa uma ação do repositório e mostra o resultado em toast. Devolve false se falhar. */
export async function attempt(p: Promise<unknown>, ok?: string): Promise<boolean> {
  try { await p; if (ok) toast(ok); return true; }
  catch (e) { toast(e instanceof Error ? e.message : "Não foi possível concluir.", { alert: true }); return false; }
}
