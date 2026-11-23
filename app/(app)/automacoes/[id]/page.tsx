"use client";
import { useParams } from "next/navigation";
import { useQuery } from "@/lib/useQuery";
import { getAutomation } from "@/lib/data/repositories";
import { Loaded } from "@/components/ui";
import { FlowEditor } from "@/components/automacoes/FlowEditor";

export default function AutomacaoPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery(() => getAutomation(id), [id]);
  return <Loaded q={q} skeleton={<div role="status" aria-label="Carregando" className="flow-editor flex-1 bg-side" />}>{(a) => (a.id === id ? <FlowEditor key={a.id} automation={a} initial={{ name: a.name, flow: a.draft }} /> : null)}</Loaded>;
}
