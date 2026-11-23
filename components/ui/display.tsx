"use client";
import type { CSSProperties, ReactNode } from "react";
import { CloudOff } from "lucide-react";
import type { ChannelType, TagColor, User } from "@/lib/data/types";
import { initials } from "@/lib/format";
import { stageColor } from "@/lib/stages";
import type { Query } from "@/lib/useQuery";
import { Button } from "./button";

export const tagVar = (c: TagColor) => ({ "--tg": `var(--tag-${c})` }) as CSSProperties;
export function Tag({ name, color, className = "" }: { name: string; color: TagColor; className?: string }) {
  return <span style={tagVar(color)} className={`tag t-meta inline-flex max-w-full items-center gap-1.5 rounded-tag px-1.5 py-0.5 ${className}`}><span className="tag-dot size-1.5 shrink-0 rounded-full" /><span className="truncate">{name}</span></span>;
}
export function Avatar({ user, size = 24 }: { user: Pick<User, "name" | "avatar" | "photo"> | null; size?: number }) {
  const s = { width: size, height: size, fontSize: Math.max(9, size * 0.38) };
  if (!user) return <span title="Sem responsável" style={s} className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-line3 text-tx2">–</span>;
  // eslint-disable-next-line @next/next/no-img-element
  if (user.photo) return <img src={user.photo} alt={user.name} title={user.name} style={s} className="shrink-0 rounded-full object-cover" />;
  return <span title={user.name} style={{ ...s, ...tagVar(user.avatar) }} className="tint inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold">{initials(user.name)}</span>;
}
/** Iniciais neutras de um contato. */
export const Initials = ({ name, size = 36 }: { name: string; size?: number }) => <span aria-hidden style={{ width: size, height: size, fontSize: size * 0.34 }} className="inline-flex shrink-0 items-center justify-center rounded-full bg-sel font-semibold text-tx3">{initials(name)}</span>;
export function ChannelIcon({ type, size = 14 }: { type: ChannelType; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", role: "img" } as const;
  return type === "whatsapp"
    ? <svg {...p} className="shrink-0 text-wa" aria-label="WhatsApp"><path d="M3 21l1.7-5A9 9 0 1 1 8 19.3z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5.8 0 1.5-.7 1.5-1.4l-2-1-1 .9c-1-.4-2-1.4-2.4-2.4l.9-1-1-2C9.7 8.1 9 8.7 9 9.5z" /></svg>
    : <svg {...p} className="shrink-0 text-ig" aria-label="Instagram"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.2 6.8h.01" /></svg>;
}
export const CHANNEL: Record<ChannelType, string> = { whatsapp: "WhatsApp", instagram: "Instagram" };
export const Badge = ({ n, label }: { n: number; label?: string }) => n > 0 ? <span aria-label={label ?? String(n)} className="tnum inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-alert px-1 text-[10.5px] font-semibold text-onalert">{n}</span> : null;
export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="t-meta font-sans text-tx2">{children}</kbd>;
export const Pill = ({ children }: { children: ReactNode }) => <span className="t-meta inline-flex items-center whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-tx3">{children}</span>;
export type Tone = "line3" | "alert" | "gold" | "positive" | "warning" | "info";
export const Dot = ({ tone = "line3" }: { tone?: Tone }) => <span aria-hidden className={`inline-block size-1.5 shrink-0 rounded-full ${{ line3: "bg-line3", alert: "bg-alert", gold: "bg-gold", positive: "bg-positive", warning: "bg-warning", info: "bg-info" }[tone]}`} />;
/** Etapa: ponto na cor da etapa e texto normal. */
export const StagePill = ({ id, index, name }: { id: string; index: number; name: string }) => <span className="t-meta inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-tx3"><span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: stageColor(id, index) }} />{name}</span>;
export const Skeleton = ({ className = "" }: { className?: string }) => <div aria-hidden className={`skeleton ${className}`} />;
export const RowsSkeleton = ({ rows = 8, className = "h-11" }: { rows?: number; className?: string }) => <div role="status" aria-label="Carregando" className="flex flex-col gap-px">{Array.from({ length: rows }, (_, i) => <div key={i} className={`flex items-center gap-4 border-b px-4 ${className}`}><Skeleton className="h-3 w-1/4" /><Skeleton className="h-3 w-1/6" /><Skeleton className="h-3 w-1/5" /><Skeleton className="ml-auto h-3 w-16" /></div>)}</div>;
export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center"><p className="t-block">{title}</p>{text && <p className="t-sec max-w-sm">{text}</p>}{action && <div className="mt-2">{action}</div>}</div>;
}
export function ErrorState({ retry }: { retry: () => void }) {
  return <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center"><CloudOff size={20} strokeWidth={1.5} className="text-alert" aria-hidden /><p className="t-block">Não foi possível carregar</p><p className="t-sec">Verifique a conexão. Nada do que você fez foi perdido.</p><Button className="mt-2" onClick={retry}>Tentar de novo</Button></div>;
}
/** Carregando → erro → conteúdo. */
export function Loaded<T>({ q, skeleton, children }: { q: Query<T>; skeleton?: ReactNode; children: (data: T) => ReactNode }) {
  if (q.error) return <ErrorState retry={q.retry} />;
  if (q.data === undefined) return <>{skeleton ?? <RowsSkeleton />}</>;
  return <>{children(q.data)}</>;
}
export const Section = ({ title, aside, children, className = "", card }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; card?: boolean }) => <section className={`min-w-0 ${card ? "rounded-card border bg-surface p-5" : ""} ${className}`}><header className="mb-3 flex min-h-7 items-center gap-2 border-b pb-2"><h2 className="t-block">{title}</h2>{aside && <div className="ml-auto flex items-center gap-2">{aside}</div>}</header>{children}</section>;
export const Row = ({ label, children }: { label: string; children: ReactNode }) => <div className="flex items-baseline justify-between gap-4 py-1"><span className="t-sec shrink-0">{label}</span><span className="min-w-0 text-right">{children}</span></div>;
