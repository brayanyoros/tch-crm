"use client";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { FlowEditor } from "@/components/automacoes/FlowEditor";
import { fromReady } from "@/components/automacoes/ready";
import { blankFlow } from "@/lib/automation/flow";

export default function NovaAutomacaoPage() {
  const m = useSearchParams().get("modelo");
  const initial = useMemo(() => (m !== null && fromReady(Number(m))) || { name: "Nova automação", flow: blankFlow() }, [m]);
  return <FlowEditor key={m} initial={initial} />;
}
