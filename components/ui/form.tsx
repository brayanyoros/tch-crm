"use client";
import { useId, type ComponentProps, type ReactNode } from "react";
import { Check, Search } from "lucide-react";

export interface Option { value: string; label: string }
export const opts = <T extends { id: string; name: string }>(list: T[] | undefined): Option[] => (list ?? []).map((x) => ({ value: x.id, label: x.name }));

export function Field({ label, error, hint, children, className = "" }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="t-label">{label}</span>
      {children}
      {error ? <span role="alert" className="t-meta text-alert">{error}</span> : hint && <span className="t-meta text-tx2">{hint}</span>}
    </label>
  );
}
export const Input = ({ className = "", ...p }: ComponentProps<"input">) => <input className={`field ${className}`} {...p} />;
export const Textarea = ({ className = "", ...p }: ComponentProps<"textarea">) => <textarea className={`field ${className}`} rows={3} {...p} />;
export function Select({ options, placeholder, className = "", ...p }: ComponentProps<"select"> & { options: Option[]; placeholder?: string }) {
  return (
    <select className={`field ${className}`} {...p}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
export function SearchInput({ className = "", ...p }: ComponentProps<"input">) {
  return (
    <div className={`relative ${className}`}>
      <Search size={15} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tx2" />
      <input type="search" className="field pl-8" style={{ paddingLeft: 32 }} aria-label={p.placeholder} {...p} />
    </div>
  );
}
/** Campo de dinheiro em reais inteiros. */
export function MoneyInput({ value, onValue, ...p }: Omit<ComponentProps<"input">, "value" | "onChange"> & { value: number; onValue: (n: number) => void }) {
  return (
    <div className="field flex items-center gap-1.5">
      <span className="text-tx2">R$</span>
      <input {...p} inputMode="numeric" className="tnum w-full bg-transparent outline-none" value={value ? value.toLocaleString("pt-BR") : ""} placeholder="0" onChange={(e) => onValue(Number(e.target.value.replace(/\D/g, "").slice(0, 9)))} />
    </div>
  );
}
export function Checkbox({ checked, onChange, label, children, className = "" }: { checked: boolean; onChange: (v: boolean) => void; label?: string; children?: ReactNode; className?: string }) {
  return (
    <label className={`flex w-fit cursor-pointer items-start gap-2.5 ${className}`}>
      <span className="relative mt-px inline-flex size-[18px] shrink-0">
        <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer absolute inset-0 cursor-pointer appearance-none rounded-tag border border-line3 bg-bg transition-colors checked:border-inv checked:bg-inv" />
        <Check size={13} strokeWidth={2} aria-hidden className="pointer-events-none absolute left-[2.5px] top-[2.5px] text-oninv opacity-0 peer-checked:opacity-100" />
      </span>
      {children}
    </label>
  );
}
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${checked ? "border-inv bg-inv" : "border-line3 bg-bg2"}`}>
      <span className={`absolute top-[3px] size-3 rounded-full transition-all ${checked ? "left-[19px] bg-oninv" : "left-[3px] bg-line3"}`} />
    </button>
  );
}
export function Radio({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className={`flex cursor-pointer items-start gap-3 rounded-card border p-4 transition-colors ${checked ? "border-gold bg-bg" : "border-line hover:border-line2"}`}>
      <input id={id} type="radio" name={name} checked={checked} onChange={onChange} className="mt-0.5 size-4 accent-[var(--inv)]" />
      <span className="flex-1">{children}</span>
    </label>
  );
}
