"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@/lib/useQuery";
import { getCampaign } from "@/lib/data/repositories";
import { EmptyState, Loaded } from "@/components/ui";
import { blankCampaign, Wizard } from "@/components/campanhas/wizard/Wizard";

export default function NovaCampanhaPage() {
  /* lido uma vez: depois do primeiro salvamento a URL ganha o id sem recarregar o assistente */
  const [id] = useState(useSearchParams().get("rascunho"));
  const q = useQuery(async () => (id ? getCampaign(id) : null), [id]);
  return <Loaded q={q}>{(c) => (c && c.status !== "Rascunho" ? <EmptyState title="Esta campanha já foi confirmada" text="Campanhas confirmadas não podem ser editadas." /> : c ? <Wizard initial={{ id: c.id, name: c.name, senderId: c.senderId, audience: c.audience, templateId: c.templateId, vars: c.vars, replies: c.replies, when: c.when, scheduledAt: c.scheduledAt }} savedAt={c.savedAt} /> : <Wizard initial={blankCampaign()} />)}</Loaded>;
}
