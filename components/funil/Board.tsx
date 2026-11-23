"use client";
import { useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type KeyboardCoordinateGetter } from "@dnd-kit/core";
import type { DealView, Stage } from "@/lib/data/types";
import { money } from "@/lib/format";
import { stageColor } from "@/lib/stages";
import type { MenuItem } from "@/components/ui";
import { DealCard } from "./DealCard";

interface Props { stages: Stage[]; deals: DealView[]; selectedId?: string; onOpen: (d: DealView) => void; onMove: (d: DealView, stageId: string) => void; menuFor: (d: DealView) => MenuItem[] | undefined; canMove: (d: DealView) => boolean }
const collide: CollisionDetection = (a) => { const p = pointerWithin(a); return p.length ? p : rectIntersection(a); };
/** Teclado: setas pulam de coluna em coluna. */
const byColumn: KeyboardCoordinateGetter = (e, { currentCoordinates, context }) => {
  const dir = e.code === "ArrowRight" ? 1 : e.code === "ArrowLeft" ? -1 : 0;
  const w = context.droppableRects.values().next().value?.width ?? 264;
  if (!dir) return undefined;
  e.preventDefault();
  return { ...currentCoordinates, x: currentCoordinates.x + dir * (w + 12) };
};
function Draggable({ d, children, disabled }: { d: DealView; children: React.ReactNode; disabled: boolean }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: d.id, disabled });
  return <div ref={setNodeRef} {...listeners} {...attributes} role="group" aria-label={`${d.contact.name}, ${d.title}. Espaço para mover.`} tabIndex={disabled ? -1 : 0} className={isDragging ? "rounded-card border border-dashed border-line3 [&>*]:invisible" : ""}>{children}</div>;
}
function Column({ s, deals, dragging, index, total, ...p }: Omit<Props, "stages"> & { s: Stage; dragging: DealView | null; index: number; total: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: s.id });
  const target = isOver && dragging && dragging.stageId !== s.id;
  return (
    <section ref={setNodeRef} aria-label={s.name} className="flex h-full min-w-[248px] max-w-[320px] flex-1 flex-col">
      <header className="mb-2.5 border-t-2 px-1 pt-2.5" style={{ borderColor: stageColor(s.id, index, total) }}>
        <div className="flex items-center gap-2"><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: stageColor(s.id, index, total) }} /><h2 className="text-[13px] font-semibold">{s.name}</h2><span className="tnum t-meta text-tx2">{deals.length}</span><span className="t-meta tnum ml-auto text-tx3">{money(deals.reduce((a, d) => a + d.value, 0))}</span></div>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-1 pb-6">
        {target && <div className="flex h-16 shrink-0 items-center justify-center rounded-card border border-dashed border-gold"><span className="t-meta text-tx2">Soltar em {s.name}</span></div>}
        {deals.map((d) => <Draggable key={d.id} d={d} disabled={!p.canMove(d)}><DealCard d={d} selected={d.id === p.selectedId} menu={p.menuFor(d)} onOpen={() => p.onOpen(d)} /></Draggable>)}
        {deals.length === 0 && !target && <p className="t-sec rounded-card border border-dashed border-line3 px-3 py-6 text-center">Nenhum negócio em {s.name.toLowerCase()}</p>}
      </div>
    </section>
  );
}
export function Board(p: Props) {
  const [drag, setDrag] = useState<DealView | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: byColumn, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] } }));
  const end = (e: DragEndEvent) => { const d = drag, to = e.over?.id; setDrag(null); if (d && to && d.stageId !== to) p.onMove(d, String(to)); };
  return (
    <DndContext id="funil" sensors={sensors} collisionDetection={collide} onDragStart={(e) => setDrag(p.deals.find((d) => d.id === e.active.id) ?? null)} onDragEnd={end} onDragCancel={() => setDrag(null)} accessibility={{ screenReaderInstructions: { draggable: "Pressione espaço para levantar, setas para trocar de etapa e espaço para soltar." } }}>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto bg-bg px-4 pt-4 md:px-6">
        {p.stages.map((s, i) => <Column key={s.id} {...p} s={s} index={i} total={p.stages.length} dragging={drag} deals={p.deals.filter((d) => d.stageId === s.id)} />)}
      </div>
      <DragOverlay dropAnimation={null}>{drag && <div className="drag-lift rounded-card"><DealCard d={drag} /></div>}</DragOverlay>
    </DndContext>
  );
}
