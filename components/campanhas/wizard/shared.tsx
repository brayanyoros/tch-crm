"use client";
import { useId, useState, type ReactNode } from "react";
import { Check, ChevronDown, FileText, ImageIcon, Info, Search, X } from "lucide-react";
import type { Channel, Template } from "@/lib/data/types";
import { norm } from "@/lib/format";
import { Popover, type Option } from "@/components/ui";

export const FIELD = "field !h-11 !rounded-card !px-3.5 !text-[14px]";
export const GOLD = "inline-flex h-11 items-center justify-center gap-2 rounded-card bg-gold px-5 text-[14px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--gold-lt)] disabled:cursor-not-allowed disabled:opacity-50";
export const GHOST = "inline-flex h-11 items-center justify-center gap-2 rounded-card border border-line bg-surface px-4 text-[14px] font-medium transition-colors hover:border-line2 disabled:cursor-not-allowed disabled:opacity-50";
export const LINK = "rounded-tag text-[13px] font-medium text-tx underline decoration-line2 underline-offset-4 hover:decoration-tx";

export function H({ n, title, text, aside }: { n?: string; title: string; text?: ReactNode; aside?: ReactNode }) {
  return <header className="mb-4 flex items-start gap-3"><div className="flex-1">{n && <p className="text-[12px] font-medium text-tx2">{n}</p>}<h2 className="text-[16px] font-semibold leading-6">{title}</h2>{text && <p className="mt-0.5 text-[13px] leading-[19px] text-tx2">{text}</p>}</div>{aside}</header>;
}
export function Note({ children, tone }: { children: ReactNode; tone?: "alert" }) {
  return <p className={`flex gap-2 text-[13px] leading-[19px] ${tone ? "text-alert" : "text-tx2"}`}><Info size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden /><span>{children}</span></p>;
}
export function Labeled({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId(), d = error || hint ? `${id}-d` : undefined;
  return <div><label htmlFor={id} className="mb-1.5 block text-[14px] font-medium">{label}</label>{children(id, d)}{error ? <p id={d} role="alert" className="mt-1.5 text-[13px] text-alert">{error}</p> : hint && <p id={d} className="mt-1.5 text-[13px] leading-[19px] text-tx2">{hint}</p>}</div>;
}
/** Seleção múltipla com busca. */
export function MultiSelect({ label, options, value, onChange, placeholder = "Escolher" }: { label: string; options: Option[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const chosen = options.filter((o) => value.includes(o.value)), shown = options.filter((o) => norm(o.label).includes(norm(q)));
  return (
    <Popover width={300} trigger={<button type="button" aria-label={`${label}: ${chosen.length ? chosen.map((c) => c.label).join(", ") : "nenhum"}`} className={`${FIELD} flex items-center gap-2 text-left`}><span className={`min-w-0 flex-1 truncate ${chosen.length ? "" : "text-tx2"}`}>{chosen.length ? chosen.map((c) => c.label).join(", ") : placeholder}</span>{chosen.length > 1 && <span className="tnum rounded-full bg-surface2 px-1.5 text-[12px]">{chosen.length}</span>}<ChevronDown size={16} strokeWidth={1.5} className="shrink-0 text-tx2" aria-hidden /></button>}>
      <div className="flex items-center gap-2 border-b px-3"><Search size={14} strokeWidth={1.5} className="text-tx2" aria-hidden /><input autoFocus aria-label={`Buscar ${label}`} placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 flex-1 bg-transparent text-[14px] outline-none" /></div>
      <ul role="listbox" aria-multiselectable aria-label={label} className="max-h-64 overflow-y-auto p-1">
        {!shown.length && <li className="px-3 py-4 text-center text-[13px] text-tx2">Nada encontrado</li>}
        {shown.map((o) => { const on = value.includes(o.value); return <li key={o.value}><button type="button" role="option" aria-selected={on} onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])} className="flex w-full items-center gap-2.5 rounded-ctl px-2.5 py-2 text-left text-[14px] hover:bg-sel"><span className={`inline-flex size-4 shrink-0 items-center justify-center rounded-tag border ${on ? "border-inv bg-inv text-oninv" : "border-line3"}`}>{on && <Check size={12} strokeWidth={2} />}</span>{o.label}</button></li>; })}
      </ul>
      {value.length > 0 && <div className="border-t p-2"><button type="button" onClick={() => onChange([])} className="inline-flex items-center gap-1 px-1 text-[13px] text-tx2 hover:text-tx"><X size={13} aria-hidden />Limpar seleção</button></div>}
    </Popover>
  );
}
/** Mensagem como chega no WhatsApp do cliente, nas cores do CRM. */
export function ChatPreview({ sender, template, text, children }: { sender?: Channel; template?: Template; text: string; children?: ReactNode }) {
  return (
    <div aria-label="Prévia da mensagem" className="overflow-hidden rounded-[12px] border border-line bg-bg">
      <div className="flex items-center gap-2.5 border-b border-line bg-surface px-3.5 py-2.5"><span className="flex size-8 items-center justify-center rounded-full bg-inv text-[10px] font-semibold text-oninv">TCH</span><span className="min-w-0"><span className="block truncate text-[14px] font-semibold">{sender?.account ?? "Remetente"}</span><span className="tnum block text-[12px] text-tx2">{sender?.handle ?? "Escolha o número"}</span></span></div>
      <div className="flex min-h-56 flex-col justify-end gap-1.5 p-3.5">
        {template ? <>
          <div className="max-w-[92%] overflow-hidden rounded-card rounded-tl-tag border border-line bg-surface">
            {template.header && <div className="flex h-28 flex-col items-center justify-center gap-1.5 border-b border-line bg-surface2 text-tx2">{template.header.type === "imagem" ? <ImageIcon size={20} strokeWidth={1.5} aria-hidden /> : <FileText size={20} strokeWidth={1.5} aria-hidden />}<span className="max-w-full truncate px-3 text-[12px]">{template.header.name}</span></div>}
            <p className="whitespace-pre-wrap px-3 py-2.5 text-[14px] leading-[21px] [overflow-wrap:anywhere]">{text}</p>
          </div>
          {template.buttons.map((b) => <div key={b} className="max-w-[92%] rounded-card border border-line bg-surface py-2 text-center text-[14px] font-medium text-info">{b}</div>)}
        </> : <p className="self-center pb-10 text-[13px] text-tx2">Escolha um modelo para ver a prévia.</p>}
      </div>
      {children}
    </div>
  );
}
