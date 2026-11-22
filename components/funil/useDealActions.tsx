"use client";
import { useState } from "react";
import { ArrowRight, ThumbsDown, Trash2, UserRound } from "lucide-react";
import type { DealView, Stage, User } from "@/lib/data/types";
import { assignContacts, deleteDeal, moveDeal } from "@/lib/data/repositories";
import { can } from "@/lib/permissions";
import { attempt, toast, useApp } from "@/store/app";
import { Confirm, type MenuItem } from "@/components/ui";
import { LostDialog, WonDialog } from "./DealDialogs";

/** Mover, ganhar, perder, transferir e excluir: usado no quadro, na lista e no painel. */
export function useDealActions(stages: Stage[], sellers: User[], onMoved?: (id: string, stageId: string | null) => void) {
  const user = useApp((s) => s.user);
  const [won, setWon] = useState<DealView | null>(null), [lost, setLost] = useState<DealView | null>(null), [del, setDel] = useState<DealView | null>(null);
  const last = stages[stages.length - 1]?.id;
  const canMove = (d: DealView) => can(user, "lead.reply", { ownerId: d.ownerId });
  const move = async (d: DealView, stageId: string) => {
    if (stageId === last) return setWon(d);
    onMoved?.(d.id, stageId);
    const from = d.stageId;
    if (await attempt(moveDeal(d.id, stageId))) toast(`${d.contact.name} em ${stages.find((s) => s.id === stageId)?.name}`, d.status === "aberto" ? { action: { label: "Desfazer", run: () => void attempt(moveDeal(d.id, from)) } } : undefined);
    onMoved?.(d.id, null);
  };
  const menuFor = (d: DealView): MenuItem[] | undefined => {
    const items: MenuItem[] = [];
    if (canMove(d)) items.push({ label: "Mover etapa", icon: ArrowRight, sub: stages.map((s) => ({ label: s.name, checked: s.id === d.stageId, run: () => { if (s.id !== d.stageId) void move(d, s.id); } })) });
    if (can(user, "lead.transfer")) items.push({ label: "Transferir", icon: UserRound, sub: sellers.map((s) => ({ label: s.name, checked: s.id === d.ownerId, run: () => void attempt(assignContacts([d.contactId], s.id), `Transferido para ${s.name}`) })) });
    if (canMove(d) && d.status === "aberto") items.push({ label: "Marcar como perdido", icon: ThumbsDown, run: () => setLost(d) });
    if (can(user, "lead.delete")) items.push({ label: "Excluir negócio", icon: Trash2, alert: true, run: () => setDel(d) });
    return items.length ? items : undefined;
  };
  const dialogs = (
    <>
      {won && last && <WonDialog d={won} stageId={last} onClose={() => setWon(null)} />}
      {lost && <LostDialog d={lost} onClose={() => setLost(null)} />}
      <Confirm open={!!del} onClose={() => setDel(null)} title="Excluir negócio" text={`O negócio de ${del?.contact.name ?? ""} e seu histórico serão apagados. Esta ação não pode ser desfeita.`} action="Excluir" onConfirm={() => del && void attempt(deleteDeal(del.id), "Negócio excluído")} />
    </>
  );
  return { move, menuFor, canMove, dialogs };
}
