"use client";
import { FileText, ImageIcon } from "lucide-react";
import type { CampaignView } from "@/lib/data/repositories";
import type { CampaignDraft } from "@/lib/data/types";
import { Dot } from "@/components/ui";

export function CampaignStatusLabel({ c }: { c: CampaignView }) {
  const k = c.stats.total ? c.stats.sent / c.stats.total : 0;
  if (c.status === "Enviando") return <span className="inline-flex items-center gap-2"><Dot tone="info" />Enviando<span role="progressbar" aria-label="Progresso do envio" aria-valuenow={Math.round(k * 100)} aria-valuemin={0} aria-valuemax={100} className="h-1 w-16 rounded-full bg-line"><span className="block h-full rounded-full bg-inv transition-all" style={{ width: `${k * 100}%` }} /></span><span className="tnum t-meta text-tx2">{c.stats.sent}/{c.stats.total}</span></span>;
  return <span className={`inline-flex items-center gap-2 whitespace-nowrap ${c.status === "Cancelada" || c.status === "Rascunho" ? "text-tx2" : ""}`}><Dot tone={c.status === "Concluída" ? "positive" : c.status === "Pausada" || c.status === "Agendada" ? "warning" : "line3"} />{c.status}</span>;
}
/** Mensagem como aparece no celular, com as cores do CRM. */
export function PhonePreview({ body, header, buttons }: { body: string; header: CampaignDraft["header"]; buttons: CampaignDraft["buttons"] }) {
  return (
    <div aria-label="Pré-visualização no celular" className="mx-auto w-full max-w-[290px] self-start overflow-hidden rounded-[26px] border border-line2 bg-bg">
      <div className="flex h-12 items-center gap-2.5 border-b bg-bg px-4"><span className="flex size-7 items-center justify-center rounded-full bg-inv text-[9px] font-semibold text-oninv">TCH</span><span className="font-semibold">TCH Experiência</span></div>
      <div className="flex min-h-[380px] flex-col justify-end gap-1 bg-bg2 p-3">
        <div className="overflow-hidden rounded-card border bg-bg">
          {header.type !== "nenhum" && <div className="flex h-28 flex-col items-center justify-center gap-1.5 border-b bg-sel text-tx2">{header.type === "imagem" ? <ImageIcon size={20} strokeWidth={1.5} aria-hidden /> : <FileText size={20} strokeWidth={1.5} aria-hidden />}<span className="t-meta max-w-full truncate px-3">{header.name || (header.type === "imagem" ? "Imagem" : "PDF")}</span></div>}
          <p className="whitespace-pre-wrap px-3 py-2.5">{body || <span className="text-tx2">Escolha um modelo aprovado.</span>}</p>
          <p className="t-meta tnum px-3 pb-2 text-right text-tx2">14:32</p>
        </div>
        {buttons.map((b, i) => <div key={i} className="rounded-card border bg-bg py-2 text-center font-medium">{b.text || "Botão"}</div>)}
      </div>
    </div>
  );
}
