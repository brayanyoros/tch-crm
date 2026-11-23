"use client";
import { useState } from "react";
import { Check, FlaskConical, X } from "lucide-react";
import type { Flow } from "@/lib/data/types";
import type { SimResult } from "@/lib/automation/engine";
import { titleOf } from "@/lib/automation/catalog";
import { nodeOf, OUT_LABEL, triggerOf } from "@/lib/automation/flow";
import { listConversations, simulateAutomation } from "@/lib/data/repositories";
import { useQuery } from "@/lib/useQuery";
import { attempt } from "@/store/app";
import { now, toLocalInput } from "@/lib/format";
import { GHOST, GOLD, Labeled, Note, PanelShell } from "./ConfigPanel";

/** Simulação: usa o mesmo motor da execução, sem aplicar nada. */
export function TestPanel({ name, flow, result, onResult, onGo, onClose }: { name: string; flow: Flow; result: SimResult | null; onResult: (r: SimResult | null) => void; onGo: (id: string) => void; onClose: () => void }) {
  const convs = useQuery(listConversations).data ?? [];
  const [contactId, setContact] = useState(""), [at, setAt] = useState(toLocalInput(now())), [text, setText] = useState("Olá, qual o prazo de entrega?"), [busy, setBusy] = useState(false);
  const t = triggerOf(flow), asks = t?.type === "mensagem";
  const run = async () => { setBusy(true); await attempt(simulateAutomation(name, flow, { contactId, at: new Date(at), text }).then(onResult)); setBusy(false); };
  return (
    <PanelShell icon={FlaskConical} kind="Simulação" title="Testar automação" onClose={onClose} footer={<><button type="button" className={GHOST} onClick={onClose}>Fechar</button><button type="button" className={GOLD} disabled={!contactId || !at || busy} onClick={() => void run()}>{busy ? "Simulando…" : "Simular"}</button></>}>
      <Note>Nada é enviado, criado ou alterado. O teste usa o fluxo como está na tela, mesmo sem salvar.</Note>
      <Labeled label="Lead">{(id) => <select id={id} className="field flow-input" value={contactId} onChange={(e) => { setContact(e.target.value); onResult(null); }}><option value="">Escolher lead</option>{convs.map((v) => <option key={v.id} value={v.contactId}>{v.contact.name}{v.deal ? ` · ${v.deal.stage.name}` : ""}</option>)}</select>}</Labeled>
      <Labeled label="Momento" hint="Muda o resultado de horário comercial, prazos e janela de 24h.">{(id) => <input id={id} type="datetime-local" className="field flow-input" value={at} onChange={(e) => { setAt(e.target.value); onResult(null); }} />}</Labeled>
      {asks ? <Labeled label="Mensagem do cliente">{(id) => <input id={id} className="field flow-input" value={text} maxLength={300} onChange={(e) => { setText(e.target.value); onResult(null); }} />}</Labeled> : t && <Note>O teste supõe que o evento “{titleOf(t)}” acabou de acontecer com este lead.</Note>}
      {result && (
        <div aria-live="polite" className="border-t border-line pt-5">
          <h3 className="mb-3 text-[13px] font-semibold">Resultado com {result.name}</h3>
          {!result.triggered ? <p className="text-[14px]">A automação não começaria. {result.reason}</p> : (
            <ol className="flex flex-col gap-1">
              {result.steps.map((s, i) => { const n = nodeOf(flow, s.nodeId); return (
                <li key={s.nodeId}><button type="button" onClick={() => onGo(s.nodeId)} className="-mx-2 flex w-[calc(100%+16px)] gap-2.5 rounded-ctl px-2 py-2 text-left hover:bg-bg2">
                  {s.ok ? <Check size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-gold" aria-label="Percorrida" /> : <X size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-alert" aria-label="Não executada" />}
                  <span className="min-w-0"><span className="block text-[14px] font-medium leading-5">{i + 1}. {n ? titleOf(n) : "Etapa"}{s.out === "sim" || s.out === "nao" ? ` → ${OUT_LABEL[s.out]}` : ""}</span><span className={`block text-[12.5px] leading-[18px] [overflow-wrap:anywhere] ${s.ok ? "text-tx2" : "text-alert"}`}>{s.text}</span></span>
                </button></li>
              ); })}
            </ol>
          )}
        </div>
      )}
    </PanelShell>
  );
}
