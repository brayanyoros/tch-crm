"use client";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@/lib/useQuery";
import { getCampaign } from "@/lib/data/repositories";
import { Loaded } from "@/components/ui";
import { blankDraft, Wizard } from "@/components/campanhas/Wizard";

export default function NovaCampanhaPage() {
  const id = useSearchParams().get("rascunho");
  const q = useQuery(async () => {
    if (!id) return blankDraft();
    const c = await getCampaign(id), b = blankDraft();
    return { ...b, id: c.id, name: c.name, filter: c.filter, listName: c.listName, templateId: c.templateId, vars: c.vars, header: c.header, buttons: c.buttons, scheduledAt: c.scheduledAt || b.scheduledAt, when: c.when, batch: c.batch };
  }, [id]);
  return <Loaded q={q}>{(d) => <Wizard key={id} initial={d} />}</Loaded>;
}
