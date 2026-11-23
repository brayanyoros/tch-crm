"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { CampaignDraft, Contact, Template } from "@/lib/data/types";
import type { AudienceResult } from "@/lib/campaign/audience";
import { REASONS } from "@/lib/campaign/audience";
import { SOURCES } from "@/lib/campaign/message";
import { fromInput, longLabel, realNow, shortLabel, suggestFrom, toInput, TZ_LABEL, WINDOW } from "@/lib/campaign/schedule";
import { dailyLimit, type Readiness, type Sender } from "@/lib/data/repositories";
import { int, moneyCents, plural } from "@/lib/format";
import { can } from "@/lib/permissions";
import { useApp } from "@/store/app";
import { MessagePreview } from "./StepMessage";
import { FIELD, LINK, Note } from "./shared";

function Block({ title, onEdit, children, problems }: { title: string; onEdit?: () => void; children: ReactNode; problems?: string[] }) {
  return (
    <section className={`rounded-[12px] border bg-surface p-5 ${problems?.length ? "border-alert" : "border-line"}`}>
      <header className="mb-3 flex items-center gap-3"><h2 className="flex-1 text-[16px] font-semibold">{title}</h2>{onEdit && <button type="button" className={LINK} onClick={onEdit}>Editar</button>}</header>
      {problems?.map((p) => <p key={p} role="alert" className="mb-2 text-[13px] text-alert">{p}</p>)}
      {children}
    </section>
  );
}
const Row = ({ k, children }: { k: string; children: ReactNode }) => <div className="grid gap-1 py-1.5 text-[14px] sm:grid-cols-[160px_minmax(0,1fr)]"><dt className="text-tx2">{k}</dt><dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd></div>;

export function StepReview({ d, patch, sender, t, aud, rate, rateAt, ready, describe, audienceName, onEdit, onList, sample }: { d: CampaignDraft; patch: (p: Partial<CampaignDraft>) => void; sender?: Sender; t?: Template; aud?: AudienceResult; rate: number | null; rateAt?: string; ready: Readiness; describe: string[]; audienceName?: string; onEdit: (step: number) => void; onList: () => void; sample: Contact[] }) {
  const user = useApp((s) => s.user), p = ready.plan, eligible = aud?.eligible ?? 0, limit = dailyLimit(sender);
  const probs = (k: string) => ready.problems.filter((x) => x.step === k).map((x) => x.text);
  const min = toInput(new Date(realNow().getTime() + 5 * 60_000));
  return <>
    <div className="flex min-w-0 flex-col gap-4">
      <Block title="Configuração" onEdit={() => onEdit(0)} problems={probs("configuracao")}><dl><Row k="Nome">{d.name}</Row><Row k="Remetente">{sender ? <>{sender.account} · <span className="tnum">{sender.handle}</span> · {sender.status}</> : "—"}</Row></dl></Block>
      <Block title="Público" onEdit={() => onEdit(1)} problems={probs("publico")}>
        <dl>
          <Row k="Origem">{audienceName ? `Público salvo “${audienceName}” (critérios dinâmicos)` : "Público criado para esta campanha"}</Row>
          <Row k="Critérios">{describe.map((x) => <span key={x} className="block">{x}</span>)}</Row>
          <Row k="Contatos elegíveis"><span className="tnum font-semibold">{int(eligible)}</span> de {int(aud?.found ?? 0)} encontrados</Row>
          {aud && aud.excluded > 0 && <Row k="Fora da campanha">{REASONS.filter((r) => aud.reasons[r]).map((r) => <span key={r} className="block tnum">{r}: {aud.reasons[r]}</span>)}</Row>}
        </dl>
        <button type="button" className={`${LINK} mt-2`} onClick={onList}>Ver destinatários</button>
        <p className="mt-2 text-[12.5px] text-tx2">A lista é fixada no momento da confirmação.</p>
      </Block>
      <Block title="Mensagem" onEdit={() => onEdit(2)} problems={probs("mensagem")}>
        <dl>
          <Row k="Modelo">{t ? <>{t.label ?? t.name} <span className="font-mono text-[12px] text-tx2">{t.name}</span> · {t.category} · {t.status}</> : "—"}</Row>
          {t && Object.entries(d.vars).map(([k, v]) => <Row key={k} k={`{{${k}}}`}>{SOURCES.find((s) => s.value === v.source)?.label ?? "—"}{v.source === "fixo" ? `: “${v.fixed}”` : ""}{v.fallback ? ` · se faltar: “${v.fallback}”` : ""}</Row>)}
          {t?.header && <Row k="Topo">{t.header.type === "imagem" ? "Imagem" : "PDF"} “{t.header.name}”, do modelo aprovado</Row>}
          {t && <Row k="Botões">{t.buttons.length ? d.replies.buttons.map((b) => <span key={b.text} className="block">“{b.text}”: {b.action === "nada" ? "sem ação" : b.action === "tag" ? "adiciona tag" : "aciona automação"}</span>) : "Nenhum"}</Row>}
          <Row k="Respostas">{d.replies.owner === "manter" ? "Mantém o responsável atual" : "Encaminha para outra pessoa"}{d.replies.replyTagId ? " · adiciona tag" : ""}<span className="block text-[12.5px] text-tx2">Aplicadas quando houver integração para receber respostas.</span></Row>
        </dl>
      </Block>
      <Block title="Envio" problems={probs("envio")}>
        <div role="radiogroup" aria-label="Quando enviar" className="grid gap-2 sm:grid-cols-2">
          {(["agora", "agendar"] as const).map((w) => { const on = d.when === w; return <button key={w} type="button" role="radio" aria-checked={on} onClick={() => patch({ when: w, ...(w === "agendar" && !d.scheduledAt ? { scheduledAt: suggestFrom(new Date(realNow().getTime() + 45 * 60_000)).toISOString() } : {}) })} className={`rounded-card border p-3.5 text-left ${on ? "border-gold" : "border-line hover:border-line2"}`}><span className="block text-[14px] font-semibold">{w === "agora" ? "Enviar agora" : "Agendar envio"}</span><span className="text-[13px] text-tx2">{w === "agora" ? "Assim que você confirmar" : "Escolha data e hora"}</span></button>; })}
        </div>
        {d.when === "agendar" && <div className="mt-4 max-w-80">
          <label htmlFor="quando" className="mb-1.5 block text-[14px] font-medium">Data e hora <span className="font-normal text-tx2">({TZ_LABEL})</span></label>
          <input id="quando" type="datetime-local" className={FIELD} min={min} value={d.scheduledAt ? toInput(new Date(d.scheduledAt)) : ""} onChange={(e) => { const x = fromInput(e.target.value); patch({ scheduledAt: x ? x.toISOString() : "" }); }} />
          {!p.ok && p.suggestion && <button type="button" className={`${LINK} mt-2`} onClick={() => patch({ scheduledAt: p.suggestion!.toISOString() })}>Usar {longLabel(p.suggestion)}</button>}
        </div>}
        <dl className="mt-4">
          <Row k="Início">{p.sendAt ? <>{p.immediate ? "Imediatamente após a confirmação" : longLabel(p.sendAt)} <span className="text-tx2">({TZ_LABEL})</span></> : "—"}</Row>
          {d.when === "agora" && p.reason && <Row k="Atenção"><span className="text-alert">{p.reason}</span></Row>}
          <Row k="Janela permitida">{WINDOW.text[0].toUpperCase() + WINDOW.text.slice(1)}, regra da operação TCH</Row>
          <Row k="Previsão de término">{limit ? (eligible <= limit ? `Cabe no limite cadastrado de ${int(limit)} conversas por dia. O tempo real depende da fila da Meta.` : `Passa do limite cadastrado de ${int(limit)} por dia: pode levar ${Math.ceil(eligible / limit)} dias.`) : "Não calculável: o limite diário do número não está cadastrado."}</Row>
        </dl>
      </Block>
      <Block title="Custo">
        {rate === null ? <Note>Não foi possível estimar: a tarifa por mensagem de marketing não está configurada. {can(user, "costs") ? <Link href="/configuracoes/custos" className={LINK}>Configurar tarifa</Link> : "Peça a um gestor para configurar."}</Note> : <dl>
          <Row k="Estimativa"><span className="tnum font-semibold">{moneyCents(eligible * rate)}</span></Row>
          <Row k="Premissas">{int(eligible)} contatos × {moneyCents(rate)} por mensagem de marketing{rateAt ? `, tarifa atualizada em ${shortLabel(new Date(rateAt))}` : ""}. A Meta cobra por mensagem entregue; o valor final pode ser menor e muda com a tarifa vigente.</Row>
        </dl>}
        <p className="mt-2 text-[13px] text-tx2">Saldo da conta: sem integração de faturamento com a Meta.</p>
      </Block>
      <Block title="Mensagem de teste">
        <Note>O envio de teste precisa de um telefone no seu perfil e da integração com o WhatsApp, que ainda não existem. Use a prévia ao lado: ela é local e não envia nada.</Note>
      </Block>
    </div>
    <aside aria-label="Prévia" className="flex h-fit flex-col gap-3 lg:sticky lg:top-0">
      <MessagePreview sender={sender} t={t} d={d} sample={sample} />
      <div className="rounded-[12px] border border-line bg-surface p-4 text-[14px]"><p className="text-tx2">Resumo</p><p className="tnum mt-1"><b className="font-semibold">{plural(eligible, "contato elegível", "contatos elegíveis")}</b></p><p className="mt-1 text-[13px] text-tx2">{ready.problems.length ? `${plural(ready.problems.length, "ponto a revisar", "pontos a revisar")} antes de confirmar.` : "Tudo pronto para confirmar."}</p></div>
    </aside>
  </>;
}
