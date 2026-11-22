"use client";
import * as T from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

export interface TabDef { id: string; label: string; count?: number }
/** Abas com fio dourado. O conteúdo é de quem chama. */
export function Tabs({ tabs, value, onChange, label, className = "" }: { tabs: TabDef[]; value: string; onChange: (id: string) => void; label: string; className?: string }) {
  return (
    <T.Root value={value} onValueChange={onChange} activationMode="manual">
      <T.List aria-label={label} className={`flex gap-5 overflow-x-auto border-b ${className}`}>
        {tabs.map((t) => (
          <T.Trigger key={t.id} value={t.id} className="relative flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] text-tx2 outline-offset-[-2px] transition-colors hover:text-tx data-[state=active]:font-semibold data-[state=active]:text-tx data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-gold">
            {t.label}{t.count !== undefined && <span className="tnum t-meta text-tx2">{t.count}</span>}
          </T.Trigger>
        ))}
      </T.List>
    </T.Root>
  );
}
export function Segmented<V extends string>({ options, value, onChange, label }: { options: { value: V; label: ReactNode; aria?: string }[]; value: V; onChange: (v: V) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-ctl border bg-bg2 p-0.5">
      {options.map((o) => <button key={o.value} type="button" aria-label={o.aria} aria-pressed={o.value === value} onClick={() => onChange(o.value)} className={`inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-tag px-2.5 text-[12px] transition-colors ${o.value === value ? "bg-bg font-semibold text-tx outline-1 outline-line" : "text-tx2 hover:text-tx"}`}>{o.label}</button>)}
    </div>
  );
}
