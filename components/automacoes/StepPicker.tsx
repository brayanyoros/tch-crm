"use client";
import { useState } from "react";
import { ArrowRightLeft, Bell, Bot, CheckSquare, FileText, GitBranch, ListPlus, MessageSquare, Plus, Search, Tag, Tags, Timer, UserRound, Zap, type LucideIcon } from "lucide-react";
import type { FlowNode, NodeKind } from "@/lib/data/types";
import { ACTIONS, CONDITION, DELAY } from "@/lib/automation/catalog";
import { norm } from "@/lib/format";
import { Popover } from "@/components/ui";

const ACTION_ICON: Record<string, LucideIcon> = { mensagem: MessageSquare, modelo: FileText, tarefa: CheckSquare, atribuir: UserRound, etapa: ArrowRightLeft, tag_add: Tag, tag_del: Tags, notificar: Bell, lista: ListPlus, resumo: Bot };
export const iconOf = (n: Pick<FlowNode, "kind" | "type">): LucideIcon => (n.kind === "gatilho" ? Zap : n.kind === "condicao" ? GitBranch : n.kind === "atraso" ? Timer : ACTION_ICON[n.type] ?? Zap);

const GROUPS: { name: string; items: { kind: NodeKind; type: string; label: string }[] }[] = [
  { name: "Ações", items: ACTIONS.map((a) => ({ kind: "acao", type: a.type, label: a.label })) },
  { name: "Condições", items: [{ kind: "condicao", type: "condicao", label: CONDITION.label }] },
  { name: "Atrasos", items: [{ kind: "atraso", type: "aguardar", label: DELAY.label }] },
];
function List({ onPick }: { onPick: (kind: NodeKind, type: string) => void }) {
  const [q, setQ] = useState("");
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => norm(i.label + g.name).includes(norm(q))) })).filter((g) => g.items.length);
  return (
    <div>
      <div className="flex items-center gap-2 border-b px-3"><Search size={14} strokeWidth={1.5} className="text-tx2" aria-hidden /><input autoFocus aria-label="Buscar etapa" placeholder="Buscar etapa" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { const f = groups[0]?.items[0]; if (e.key === "Enter" && q && f) onPick(f.kind, f.type); }} className="h-10 flex-1 bg-transparent text-[14px] outline-none" /></div>
      <div className="max-h-[320px] overflow-y-auto p-1.5">
        {!groups.length && <p className="t-sec px-2 py-5 text-center">Nenhuma etapa com esse nome</p>}
        {groups.map((g) => (
          <div key={g.name} className="pb-1">
            <p className="px-2 pb-1 pt-1.5 text-[12px] font-medium text-tx2">{g.name}</p>
            {g.items.map((i) => { const Icon = iconOf(i); return <button key={i.type} type="button" onClick={() => onPick(i.kind, i.type)} className="flex h-9 w-full items-center gap-2.5 rounded-ctl px-2 text-left text-[14px] hover:bg-sel"><Icon size={16} strokeWidth={1.5} className="text-tx2" aria-hidden />{i.label}</button>; })}
          </div>
        ))}
      </div>
    </div>
  );
}
export function AddButton({ label, onPick }: { label: string; onPick: (kind: NodeKind, type: string) => void }) {
  return (
    <Popover width={264} trigger={<button type="button" aria-label={label} title={label} className="nodrag nopan pointer-events-auto inline-flex size-7 items-center justify-center rounded-full border border-line2 bg-bg2 text-tx transition-colors hover:border-gold data-[state=open]:border-gold"><Plus size={15} strokeWidth={1.75} aria-hidden /></button>}>
      {(close) => <List onPick={(k, t) => { close(); onPick(k, t); }} />}
    </Popover>
  );
}
