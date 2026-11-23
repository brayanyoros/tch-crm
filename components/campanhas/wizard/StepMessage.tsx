"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { Automation, CampaignDraft, Channel, Contact, Tag, Template, User } from "@/lib/data/types";
import { checkVars, guess, render, SOURCES, templateBlock, varsOf } from "@/lib/campaign/message";
import { norm, plural } from "@/lib/format";
import { can } from "@/lib/permissions";
import { useApp } from "@/store/app";
import { Dot } from "@/components/ui";
import { ChatPreview, FIELD, H, Labeled, LINK, Note } from "./shared";

export function TemplateLibrary({ templates, senderId, value, onPick }: { templates: Template[]; senderId: string; value: string; onPick: (t: Template) => void }) {
  const [q, setQ] = useState(""), user = useApp((s) => s.user);
  const list = templates.filter((t) => norm(`${t.label ?? ""} ${t.name} ${t.body}`).includes(norm(q))).sort((a, b) => Number(!!templateBlock(a, senderId)) - Number(!!templateBlock(b, senderId)));
  return (
    <section>
      <H n="A" title="Escolher modelo" text="Campanhas só podem usar modelos de marketing aprovados pela Meta para este número." aside={can(user, "templates") && <Link href="/configuracoes/modelos" className={LINK}>Gerenciar modelos</Link>} />
      <div className="relative mb-3"><Search size={15} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx2" aria-hidden /><input aria-label="Buscar modelo" placeholder="Buscar modelo" value={q} onChange={(e) => setQ(e.target.value)} className={`${FIELD} !pl-9`} /></div>
      <ul role="radiogroup" aria-label="Modelos" className="grid gap-2 sm:grid-cols-2">
        {list.map((t) => { const block = templateBlock(t, senderId), on = t.id === value; return (
          <li key={t.id}><button type="button" role="radio" aria-checked={on} aria-disabled={!!block} onClick={() => !block && onPick(t)} className={`flex h-full w-full flex-col gap-1.5 rounded-card border bg-surface p-3.5 text-left transition-colors ${on ? "border-gold" : block ? "cursor-not-allowed border-line opacity-70" : "border-line hover:border-line2"}`}>
            <span className="flex items-start gap-2"><span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold">{t.label ?? t.name}</span><span className="block font-mono text-[12px] text-tx2">{t.name}</span></span><span className="inline-flex shrink-0 items-center gap-1.5 text-[12px]"><Dot tone={t.status === "Aprovado" ? "positive" : t.status === "Rejeitado" ? "alert" : "warning"} />{t.status}</span></span>
            <span className="line-clamp-2 text-[13px] leading-[19px] text-tx2">{t.body}</span>
            <span className="text-[12px] text-tx2">{t.category} · {t.language.replace("_", "-")}{t.header ? ` · ${t.header.type === "imagem" ? "imagem" : "PDF"} no topo` : ""}{t.buttons.length ? ` · ${plural(t.buttons.length, "botão", "botões")}` : ""}</span>
            {block && <span className="text-[12.5px] leading-[18px] text-alert">{block}</span>}
          </button></li>); })}
      </ul>
    </section>
  );
}
export function Personalize({ t, d, patch, eligibleIds }: { t: Template; d: CampaignDraft; patch: (p: Partial<CampaignDraft>) => void; eligibleIds: string[] }) {
  const checks = useMemo(() => checkVars(t, d.vars, eligibleIds), [t, d.vars, eligibleIds]);
  const set = (k: string, p: Partial<CampaignDraft["vars"][string]>) => patch({ vars: { ...d.vars, [k]: { ...(d.vars[k] ?? { source: "" }), ...p } } });
  return (
    <section>
      <H n="B" title="Personalizar" text="Só as variáveis do modelo podem mudar. Texto, imagem e botões fazem parte da aprovação." />
      <p className="mb-5 rounded-card border border-line bg-surface p-3.5 text-[14px] leading-[21px]">{t.body.split(/(\{\{\w+\}\})/g).map((p, i) => (/^\{\{/.test(p) ? <code key={i} className="rounded-tag bg-surface2 px-1 font-sans font-semibold">{p}</code> : p))}</p>
      {!checks.length && <Note>Este modelo não tem variáveis.</Note>}
      <div className="flex flex-col gap-5">
        {checks.map((c) => { const v = d.vars[c.name] ?? { source: "" }; return (
          <fieldset key={c.name} className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-[14px] font-medium">{`{{${c.name}}}`}</legend>
            <Labeled label="Valor vem de">{(id) => <select id={id} className={FIELD} value={v.source} onChange={(e) => set(c.name, { source: e.target.value })}><option value="">Escolher</option>{SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>}</Labeled>
            {v.source === "fixo" ? <Labeled label="Texto fixo">{(id) => <input id={id} className={FIELD} maxLength={60} value={v.fixed ?? ""} onChange={(e) => set(c.name, { fixed: e.target.value })} />}</Labeled>
              : <Labeled label="Valor alternativo" hint={v.source ? (c.missing ? `${plural(c.missing, "destinatário")} sem este dado ${c.missing === 1 ? "recebe" : "recebem"} o valor alternativo.` : "Todos os elegíveis têm este dado.") : undefined} error={c.problem && v.source ? c.problem : undefined}>{(id, dsc) => <input id={id} aria-describedby={dsc} className={FIELD} maxLength={60} placeholder="Ex.: nossa linha outdoor" value={v.fallback ?? ""} onChange={(e) => set(c.name, { fallback: e.target.value })} />}</Labeled>}
          </fieldset>); })}
      </div>
      {(t.header || t.buttons.length > 0) && <div className="mt-5"><Note>{t.header ? `O topo (${t.header.type === "imagem" ? "imagem" : "PDF"} “${t.header.name}”)` : "O conteúdo"}{t.buttons.length ? ` e os botões “${t.buttons.join("”, “")}”` : ""} vêm do modelo aprovado. Para mudar, crie um novo modelo e aguarde a aprovação.</Note></div>}
    </section>
  );
}
export function Replies({ t, d, patch, tags, sellers, automations }: { t: Template; d: CampaignDraft; patch: (p: Partial<CampaignDraft>) => void; tags: Tag[]; sellers: User[]; automations: Automation[] }) {
  const r = d.replies, set = (p: Partial<CampaignDraft["replies"]>) => patch({ replies: { ...r, ...p } });
  const flows = automations.filter((a) => (a.published ?? a.draft).nodes.some((n) => n.kind === "gatilho" && n.type === "botao"));
  return (
    <details className="group rounded-card border border-line bg-surface" open={r.owner !== "manter" || !!r.replyTagId || r.buttons.some((b) => b.action !== "nada")}>
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden"><span className="flex-1"><span className="block text-[12px] font-medium text-tx2">C · opcional</span><span className="block text-[16px] font-semibold">O que acontece quando o cliente responde?</span></span><ChevronDown size={18} strokeWidth={1.5} className="text-tx2 transition-transform group-open:rotate-180" aria-hidden /></summary>
      <div className="flex flex-col gap-6 border-t border-line p-4">
        <Note>Estas regras ficam salvas na campanha e serão aplicadas quando a integração com o WhatsApp receber respostas. Hoje ela não existe, então nada é executado.</Note>
        <div>
          <h3 className="mb-2 text-[14px] font-semibold">Resposta comum</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled label="Responsável pela conversa">{(id) => <select id={id} className={FIELD} value={r.owner === "manter" ? "manter" : r.ownerId} onChange={(e) => set(e.target.value === "manter" ? { owner: "manter", ownerId: "" } : { owner: "transferir", ownerId: e.target.value })}><option value="manter">Manter o responsável atual</option>{sellers.map((u) => <option key={u.id} value={u.id}>Encaminhar para {u.name}</option>)}</select>}</Labeled>
            <Labeled label="Adicionar tag a quem responder">{(id) => <select id={id} className={FIELD} value={r.replyTagId} onChange={(e) => set({ replyTagId: e.target.value })}><option value="">Nenhuma</option>{tags.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</Labeled>
          </div>
          <p className="mt-2 text-[13px] text-tx2">Nenhum negócio novo é criado: a resposta entra na conversa existente do contato.</p>
        </div>
        {t.buttons.length > 0 && <div>
          <h3 className="mb-2 text-[14px] font-semibold">Clique em um botão</h3>
          <div className="flex flex-col gap-3">{r.buttons.map((b, i) => { const upd = (p: Partial<typeof b>) => set({ buttons: r.buttons.map((x, k) => (k === i ? { ...x, ...p } : x)) }); return (
            <div key={b.text} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)] sm:items-end">
              <span className="pb-3 text-[14px] font-medium">“{b.text}”</span>
              <Labeled label="Ação">{(id) => <select id={id} className={FIELD} value={b.action} onChange={(e) => upd({ action: e.target.value as typeof b.action, value: "" })}><option value="nada">Nenhuma</option><option value="tag">Adicionar tag</option><option value="automacao">Acionar automação</option></select>}</Labeled>
              {b.action === "tag" ? <Labeled label="Tag">{(id) => <select id={id} className={FIELD} value={b.value} onChange={(e) => upd({ value: e.target.value })}><option value="">Escolher</option>{tags.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</Labeled>
                : b.action === "automacao" ? <Labeled label="Automação" hint={!flows.length ? "Nenhuma automação com o gatilho “Botão de campanha clicado”." : undefined}>{(id) => <select id={id} className={FIELD} value={b.value} onChange={(e) => upd({ value: e.target.value })}><option value="">Escolher</option>{flows.map((a) => <option key={a.id} value={a.id}>{a.name}{a.status === "ativa" ? "" : " (não ativa)"}</option>)}</select>}</Labeled> : <span />}
            </div>); })}</div>
          {t.buttons.some((b) => /interesse/i.test(b)) && <p className="mt-2 text-[13px] text-tx2">“Não tenho interesse” não descadastra o contato. Só o pedido de saída faz isso.</p>}
        </div>}
        <div><h3 className="mb-1 text-[14px] font-semibold">Pedido para deixar de receber</h3><p className="text-[13px] leading-[19px] text-tx2">Quando o cliente pedir para sair, o contato é marcado como “pediu para sair” e fica fora das próximas campanhas. Hoje o registro é feito à mão na ficha do contato, em Consentimento.</p></div>
      </div>
    </details>
  );
}
export function MessagePreview({ sender, t, d, sample }: { sender?: Channel; t?: Template; d: CampaignDraft; sample: Contact[] }) {
  const [i, setI] = useState(0), c = sample[Math.min(i, sample.length - 1)];
  const missing = t && c ? varsOf(t).filter((k) => /\[.+\]/.test(render({ ...t, body: `{{${k}}}` }, d.vars, c))) : [];
  return (
    <ChatPreview sender={sender} template={t} text={render(t, d.vars, c)}>
      {t && <div className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2">
        <button type="button" aria-label="Destinatário anterior" disabled={!c || i === 0} onClick={() => setI(i - 1)} className="inline-flex size-8 items-center justify-center rounded-ctl text-tx2 hover:bg-sel disabled:opacity-40"><ChevronLeft size={16} /></button>
        <span className="min-w-0 flex-1 truncate text-center text-[12.5px]">{c ? `${c.name} · ${i + 1} de ${sample.length}` : "Sem destinatários elegíveis"}</span>
        <button type="button" aria-label="Próximo destinatário" disabled={!c || i >= sample.length - 1} onClick={() => setI(i + 1)} className="inline-flex size-8 items-center justify-center rounded-ctl text-tx2 hover:bg-sel disabled:opacity-40"><ChevronRight size={16} /></button>
      </div>}
      {missing.length > 0 && <p className="border-t border-line bg-surface px-3 py-2 text-[12.5px] text-alert">Para este contato falta {missing.map((m) => `{{${m}}}`).join(", ")}.</p>}
    </ChatPreview>
  );
}
export const pickTemplate = (t: Template, d: CampaignDraft): Partial<CampaignDraft> => ({
  templateId: t.id,
  vars: Object.fromEntries(varsOf(t).map((k) => [k, d.vars[k] ?? { source: guess(k) }])),
  replies: { ...d.replies, buttons: t.buttons.map((text) => d.replies.buttons.find((b) => b.text === text) ?? { text, action: "nada", value: "" }) },
});

