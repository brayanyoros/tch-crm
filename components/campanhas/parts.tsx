"use client";
import type { CampaignView } from "@/lib/data/repositories";
import { Dot } from "@/components/ui";

export function CampaignStatusLabel({ c }: { c: CampaignView }) {
  if (c.status === "Enviando") { const k = c.stats.total ? c.stats.sent / c.stats.total : 0; return <span className="inline-flex items-center gap-2"><Dot tone="info" />Enviando<span role="progressbar" aria-label="Progresso do envio" aria-valuenow={Math.round(k * 100)} aria-valuemin={0} aria-valuemax={100} className="h-1 w-16 rounded-full bg-line"><span className="block h-full rounded-full bg-info" style={{ width: `${k * 100}%` }} /></span><span className="tnum t-meta text-tx2">{c.stats.sent}/{c.stats.total}</span></span>; }
  return <span className={`inline-flex items-center gap-2 whitespace-nowrap ${c.status === "Cancelada" || c.status === "Rascunho" ? "text-tx2" : ""}`}><Dot tone={c.status === "Concluída" ? "positive" : c.status === "Pausada" || c.status === "Agendada" ? "warning" : "line3"} />{c.status}</span>;
}
