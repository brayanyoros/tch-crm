"use client";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Checkbox } from "./form";
import { Button } from "./button";

export interface Col<T> { key: string; label: string; render: (r: T) => ReactNode; sort?: (r: T) => string | number; right?: boolean; className?: string }
const PAGE = 40;
export function Table<T extends { id: string }>({ cols, rows, onRow, selected, onSelect, initialSort, caption }: { cols: Col<T>[]; rows: T[]; onRow?: (r: T) => void; selected?: Set<string>; onSelect?: (s: Set<string>) => void; initialSort?: { key: string; desc: boolean }; caption: string }) {
  const [sort, setSort] = useState(initialSort);
  const [limit, setLimit] = useState(PAGE);
  const sorted = useMemo(() => {
    const f = cols.find((c) => c.key === sort?.key)?.sort;
    if (!f || !sort) return rows;
    return [...rows].sort((a, b) => { const x = f(a), y = f(b); return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR")) * (sort.desc ? -1 : 1); });
  }, [rows, sort, cols]);
  const toggle = (id: string, on: boolean) => { const s = new Set(selected); if (on) s.add(id); else s.delete(id); onSelect?.(s); };
  return (
    <div className="overflow-x-auto bg-surface">
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b bg-surface2">
            {onSelect && <th className="w-10 pl-4 text-left"><Checkbox label="Selecionar todos" checked={rows.length > 0 && selected?.size === rows.length} onChange={(v) => onSelect(v ? new Set(rows.map((r) => r.id)) : new Set())} /></th>}
            {cols.map((c) => (
              <th key={c.key} scope="col" aria-sort={sort?.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined} className={`t-label h-9 whitespace-nowrap px-3 first:pl-4 ${c.right ? "text-right" : "text-left"}`}>
                {c.sort ? <button type="button" onClick={() => setSort({ key: c.key, desc: sort?.key === c.key ? !sort.desc : !!c.right })} className="t-label inline-flex items-center gap-1 hover:text-tx">{c.label}{sort?.key === c.key && (sort.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}</button> : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, limit).map((r) => (
            <tr key={r.id} onClick={onRow && (() => onRow(r))} className={`border-b transition-colors ${onRow ? "cursor-pointer hover:bg-bg2" : ""} ${selected?.has(r.id) ? "bg-sel" : ""}`}>
              {onSelect && <td className="pl-4" onClick={(e) => e.stopPropagation()}><Checkbox label="Selecionar linha" checked={!!selected?.has(r.id)} onChange={(v) => toggle(r.id, v)} /></td>}
              {cols.map((c, i) => <td key={c.key} className={`h-11 px-3 first:pl-4 ${c.right ? "tnum whitespace-nowrap text-right" : ""} ${c.className ?? ""}`}>{i === 0 && onRow ? <button type="button" className="text-left font-medium" onClick={(e) => { e.stopPropagation(); onRow(r); }}>{c.render(r)}</button> : c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length > limit && <div className="flex items-center justify-center gap-3 py-3"><span className="t-sec tnum">{limit} de {sorted.length}</span><Button size="sm" onClick={() => setLimit(limit + PAGE)}>Mostrar mais</Button></div>}
    </div>
  );
}
