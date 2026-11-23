"use client";
import { createContext, memo, useContext } from "react";
import { BaseEdge, EdgeLabelRenderer, Handle, Position, getSmoothStepPath, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Check, MoreHorizontal, OctagonX, Settings2, Trash2, X } from "lucide-react";
import type { FlowNode, NodeKind, Out } from "@/lib/data/types";
import { KIND_LABEL, summaryOf, titleOf } from "@/lib/automation/catalog";
import { OUT_LABEL, type Issue } from "@/lib/automation/flow";
import { Dropdown, type MenuItem } from "@/components/ui";
import { AddButton, iconOf } from "./StepPicker";

export interface Mark { order: number; ok: boolean; text: string }
export interface StepData extends Record<string, unknown> { node: FlowNode; issues: Issue[]; mark?: Mark; dim: boolean; active: boolean; open: Out[] }
export interface PathData extends Record<string, unknown> { out: Out; hot: boolean; dim: boolean; source: string; from: string }
export type StepNode = Node<StepData>;
export type PathEdge = Edge<PathData>;
interface Actions { open: (id: string) => void; add: (source: string, out: Out, kind: NodeKind, type: string) => void; askDelete: (id: string) => void }
export const EditorCtx = createContext<Actions>({ open: () => {}, add: () => {}, askDelete: () => {} });

const HANDLE = "!size-3 !rounded-full !border-2 !border-[var(--line2)] !bg-bg";
function Result({ mark }: { mark: Mark }) {
  return <p className={`mt-2.5 flex gap-1.5 border-t border-line pt-2 text-[12px] leading-4 ${mark.ok ? "text-tx" : "text-alert"}`}>{mark.ok ? <Check size={13} strokeWidth={1.75} className="mt-px shrink-0 text-gold" aria-label="Percorrida" /> : <X size={13} strokeWidth={1.75} className="mt-px shrink-0" aria-label="Não executada" />}<span className="line-clamp-2"><b className="font-semibold">{mark.order}.</b> {mark.text}</span></p>;
}
export const Step = memo(function Step({ data, id }: NodeProps<StepNode>) {
  const { open, askDelete, add } = useContext(EditorCtx);
  const { node: n, issues, mark } = data, Icon = iconOf(n), cond = n.kind === "condicao", err = issues[0];
  const menu: MenuItem[] = [{ label: "Configurar", icon: Settings2, run: () => open(id) }, ...(n.kind === "gatilho" ? [] : [{ label: "Excluir", icon: Trash2, alert: true, run: () => askDelete(id) }])];
  const border = data.active || mark ? "border-gold" : err && !err.incomplete ? "border-alert" : "border-line hover:border-line2";
  return (
    <div className={`relative w-[300px] rounded-[11px] border bg-bg2 px-3.5 py-3 text-tx transition-[border-color,opacity] ${border} ${data.dim ? "opacity-40" : ""}`}>
      {n.kind !== "gatilho" && <Handle type="target" position={Position.Top} className={HANDLE} aria-label="Entrada" />}
      <div className="flex items-center gap-2">
        <span className="inline-flex size-6 items-center justify-center rounded-ctl border border-line bg-bg"><Icon size={14} strokeWidth={1.5} aria-hidden /></span>
        <span className="flex-1 text-[12px] leading-4 text-tx2">{KIND_LABEL[n.kind]}</span>
        <span className="nodrag nopan -my-1 -mr-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><Dropdown items={menu} trigger={<button type="button" aria-label={`Opções de ${titleOf(n)}`} title="Opções" className="inline-flex size-7 items-center justify-center rounded-ctl text-tx2 hover:bg-bg hover:text-tx"><MoreHorizontal size={16} strokeWidth={1.5} /></button>} /></span>
      </div>
      <p className="mt-2 text-[14px] font-semibold leading-5 [overflow-wrap:anywhere]">{titleOf(n)}</p>
      {!(cond && (n.rules?.length ?? 0) < 2) && <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-[18px] text-tx2 [overflow-wrap:anywhere]">{summaryOf(n)}</p>}
      {err && <p className="mt-2 flex gap-1.5 text-[12px] leading-4 text-alert">{err.incomplete ? <AlertTriangle size={13} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden /> : <OctagonX size={13} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden />}<span><b className="font-semibold">{err.incomplete ? "Incompleto" : "Erro"}:</b> {err.text}{issues.length > 1 ? ` (+${issues.length - 1})` : ""}</span></p>}
      {mark && <Result mark={mark} />}
      {cond ? (["sim", "nao"] as const).map((o) => (
        <div key={o}>
          <span className={`absolute top-full mt-2 -translate-x-1/2 rounded-tag border border-line bg-bg px-1.5 text-[12px] font-medium leading-[18px] ${o === "sim" ? "left-1/4" : "left-3/4"}`}>{OUT_LABEL[o]}</span>
          <Handle id={o} type="source" position={Position.Bottom} style={{ left: o === "sim" ? "25%" : "75%" }} className={HANDLE} aria-label={`Saída ${OUT_LABEL[o]}`} />
        </div>
      )) : <Handle id="next" type="source" position={Position.Bottom} className={HANDLE} aria-label="Saída" />}
      {data.open.map((o) => <span key={o} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className={`absolute top-full mt-9 -translate-x-1/2 ${o === "sim" ? "left-1/4" : o === "nao" ? "left-3/4" : "left-1/2"}`}><AddButton label={`Adicionar etapa em ${OUT_LABEL[o]}`} onPick={(k, t) => add(id, o, k, t)} /></span>)}
    </div>
  );
});
export const End = memo(function End({ data }: NodeProps<StepNode>) {
  return (
    <div className={`relative flex h-9 w-[116px] items-center justify-center rounded-[10px] border bg-bg2 text-[13px] text-tx2 transition-opacity ${data.mark ? "border-gold text-tx" : "border-line"} ${data.dim ? "opacity-40" : ""}`}>
      <Handle type="target" position={Position.Top} className={HANDLE} aria-label="Entrada" />Encerrar
    </div>
  );
});
export const Path = memo(function Path({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<PathEdge>) {
  const { add } = useContext(EditorCtx);
  if (!data) return null;
  const { source, out } = data;
  /* o "+" fica no trecho vertical perto da saída, abaixo do rótulo Sim/Não */
  const y = sourceY + (out === "next" ? Math.max(24, Math.min(38, (targetY - sourceY) / 2)) : 46);
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10, centerY: targetY - sourceY > 90 ? Math.max(y + 24, targetY - 30) : undefined });
  return (
    <>
      <BaseEdge path={path} interactionWidth={16} style={{ stroke: data.hot ? "var(--gold)" : "var(--line2)", strokeWidth: data.hot ? 2 : 1.5, opacity: data.dim ? 0.35 : 1 }} />
      <EdgeLabelRenderer><div className="absolute" style={{ transform: `translate(-50%,-50%) translate(${sourceX}px,${y}px)` }}><AddButton label={`Adicionar etapa após ${data.from}${out === "next" ? "" : `, caminho ${OUT_LABEL[out]}`}`} onPick={(k, t) => add(source, out, k, t)} /></div></EdgeLabelRenderer>
    </>
  );
});
