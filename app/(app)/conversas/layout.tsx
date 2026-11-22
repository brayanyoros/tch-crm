"use client";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { Conversas } from "@/components/conversas/Conversas";

/** Fica no layout para a lista não remontar ao trocar de conversa. */
export default function ConversasLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id?: string }>();
  return <><Conversas id={id} />{children}</>;
}
