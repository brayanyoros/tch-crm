"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import type { CampaignDraft } from "@/lib/data/types";
import { confirmCampaign, evaluateAudience, getSettings, listAudiences, listAutomations, listContacts, listSellers, listSenders, listTags, listTemplates, readiness, saveCampaignDraft } from "@/lib/data/repositories";
import { describe } from "@/lib/campaign/audience";
import { hhmm, longLabel, shortLabel, TZ_LABEL } from "@/lib/campaign/schedule";
import { useQuery } from "@/lib/useQuery";
import { attempt, toast } from "@/store/app";
import { int, moneyCents, plural } from "@/lib/format";
import { Button, Checkbox, Dialog, Dot } from "@/components/ui";
import { AudienceSummary, RecipientsDialog, StepAudience, useOptions } from "./StepAudience";
import { MessagePreview, Personalize, pickTemplate, Replies, TemplateLibrary } from "./StepMessage";
import { StepReview } from "./StepReview";
import { FIELD, GHOST, GOLD, H, Labeled, Note } from "./shared";

const STEPS = [{ key: "configuracao", label: "Configuração" }, { key: "publico", label: "Público" }, { key: "mensagem", label: "Mensagem" }, { key: "envio", label: "Revisar e enviar" }] as const;
const NEXT = ["Continuar para público", "Continuar para mensagem", "Revisar campanha"];
const snap = (d: CampaignDraft) => JSON.stringify({ ...d, id: undefined });

export function Wizard({ initial, savedAt: firstSaved }: { initial: CampaignDraft; savedAt?: string }) {
  const router = useRouter();
  const [d, setD] = useState(initial), [step, setStep] = useState(0), [saved, setSaved] = useState(initial.id ? snap(initial) : ""), [savedAt, setSavedAt] = useState(firstSaved);
  const [saving, setSaving] = useState(false), [failed, setFailed] = useState(false), [list, setList] = useState(false), [leave, setLeave] = useState<string | null>(null), [confirm, setConfirm] = useState(false), [checked, setChecked] = useState(false), [sending, setSending] = useState(false);
  const lock = useRef(false), skip = useRef(false), main = useRef<HTMLDivElement>(null);
  const patch = (p: Partial<CampaignDraft>) => setD((x) => ({ ...x, ...p }));
  const dirty = snap(d) !== saved;

  const senders = useQuery(listSenders).data, saved_ = useQuery(listAudiences).data, templates = useQuery(listTemplates).data ?? [], tags = useQuery(listTags).data ?? [], sellers = useQuery(listSellers).data ?? [], automations = useQuery(listAutomations).data ?? [], settings = useQuery(getSettings).data, contacts = useQuery(listContacts).data ?? [];
  const audKey = JSON.stringify(d.audience), aud = useQuery(() => evaluateAudience(d.audience), [audKey]);
  const { label } = useOptions();
  const sender = senders?.find((s) => s.id === d.senderId), t = templates.find((x) => x.id === d.templateId);
  const eligibleIds = useMemo(() => aud.data?.rows.filter((r) => r.eligible).map((r) => r.contactId) ?? [], [aud.data]);
  const sample = useMemo(() => eligibleIds.slice(0, 30).flatMap((id) => contacts.find((c) => c.id === id) ?? []), [eligibleIds, contacts]);
  const ready = useMemo(() => readiness(d), [d, aud.data, templates, senders]); // eslint-disable-line react-hooks/exhaustive-deps
  const issues = (k: (typeof STEPS)[number]["key"]) => ready.problems.filter((p) => p.step === k);
  const stepIssues = step < 3 ? issues(STEPS[step].key) : ready.problems;
  const firstBad = STEPS.findIndex((s) => issues(s.key).length && s.key !== "envio");

  /* remetente único fica escolhido */
  useEffect(() => { if (senders?.length === 1 && !d.senderId) patch({ senderId: senders[0].id }); }, [senders]); // eslint-disable-line react-hooks/exhaustive-deps
  /* trocar o remetente pode invalidar o modelo */
  const prevSender = useRef(d.senderId);
  useEffect(() => { if (prevSender.current && prevSender.current !== d.senderId && t?.channelId !== d.senderId && d.templateId) toast("O modelo escolhido não serve para este número. Revise a etapa Mensagem.", { alert: true }); prevSender.current = d.senderId; }, [d.senderId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { main.current?.scrollTo({ top: 0 }); main.current?.querySelector<HTMLElement>("h1, h2")?.focus({ preventScroll: true }); }, [step]);

  /* saída com alterações */
  const live = useRef(dirty); live.current = dirty;
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (live.current && !skip.current) e.preventDefault(); };
    const click = (e: MouseEvent) => { const a = (e.target as Element).closest?.("a[href]"); const href = a?.getAttribute("href"); if (!a || !href?.startsWith("/") || !live.current || skip.current || e.ctrlKey || e.metaKey) return; e.preventDefault(); e.stopPropagation(); setLeave(href); };
    addEventListener("beforeunload", unload); document.addEventListener("click", click, true);
    return () => { removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, []);

  const save = async (): Promise<string | null> => {
    setSaving(true); setFailed(false);
    let res: { id: string; savedAt: string } | undefined;
    const s = snap(d), ok = await attempt(saveCampaignDraft(d).then((r) => { res = r; }));
    setSaving(false);
    if (!ok || !res) { setFailed(true); return null; }
    setSaved(s); setSavedAt(res.savedAt);
    if (!d.id) { setD((x) => ({ ...x, id: res!.id })); router.replace(`/campanhas/nova?rascunho=${res.id}`, { scroll: false }); }
    return res.id;
  };
  const go = (to: number) => { if (to <= Math.max(step, firstBad < 0 ? 3 : firstBad)) setStep(to); };
  const send = async () => {
    if (lock.current) return;
    lock.current = true; setSending(true);
    const fresh = readiness(d);
    if (fresh.problems.length || !fresh.plan.sendAt) { toast(fresh.problems[0]?.text ?? "Revise a campanha.", { alert: true }); lock.current = false; setSending(false); setConfirm(false); return; }
    const id = dirty || !d.id ? await save() : d.id;
    if (id && (await attempt(confirmCampaign(id, { eligible: fresh.eligible, sendAt: fresh.plan.sendAt.toISOString() })))) {
      skip.current = true;
      toast(fresh.plan.immediate ? "Campanha confirmada e na fila de envio" : `Campanha agendada para ${shortLabel(fresh.plan.sendAt)}`);
      router.push(`/campanhas/${id}`);
      return;
    }
    lock.current = false; setSending(false); setConfirm(false);
  };
  const plan = ready.plan, eligible = aud.data?.eligible ?? 0, rate = settings?.costs.marketing ?? null;
  const finalLabel = !plan.ok ? "Revise o envio" : plan.immediate ? `Enviar para ${plural(eligible, "contato")}` : `Agendar para ${shortLabel(plan.sendAt!)}`;
  const state = saving ? "Salvando…" : failed ? "Falha ao salvar" : dirty ? "Alterações não salvas" : savedAt ? (shortLabel(new Date(savedAt)).slice(0, 5) === shortLabel(new Date()).slice(0, 5) ? `Salvo às ${hhmm(new Date(savedAt))}` : `Salvo em ${shortLabel(new Date(savedAt))}`) : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line bg-bg">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 md:px-6">
          <button type="button" aria-label="Voltar para Campanhas" onClick={() => (dirty ? setLeave("/campanhas") : router.push("/campanhas"))} className="inline-flex size-9 items-center justify-center rounded-ctl text-tx2 hover:bg-sel hover:text-tx"><ArrowLeft size={18} strokeWidth={1.5} /></button>
          <h1 className="min-w-0 flex-1 truncate text-[18px] font-semibold">{d.name.trim() || "Nova campanha"}</h1>
          <span className="inline-flex items-center gap-1.5 text-[13px] text-tx2"><Dot />Rascunho</span>
          <span role="status" aria-live="polite" className={`text-[13px] ${failed ? "text-alert" : "text-tx2"}`}>{state}</span>
        </div>
        <nav aria-label="Etapas" className="mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-4 md:px-6">
          {STEPS.map((s, i) => { const done = i < step && !issues(s.key).length, allowed = i <= Math.max(step, firstBad < 0 ? 3 : firstBad); return (
            <button key={s.key} type="button" disabled={!allowed} aria-current={i === step ? "step" : undefined} onClick={() => go(i)} className={`relative flex h-12 shrink-0 items-center gap-2 px-2 text-[14px] outline-offset-[-2px] disabled:cursor-not-allowed disabled:opacity-50 ${i === step ? "font-semibold after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-gold" : "text-tx2 hover:text-tx"}`}>
              <span className={`tnum flex size-6 items-center justify-center rounded-full border text-[12px] ${done ? "border-inv bg-inv text-oninv" : i === step ? "border-tx" : "border-line3"}`}>{done ? <Check size={13} strokeWidth={2} aria-label="Concluída" /> : i + 1}</span>{s.label}
            </button>); })}
        </nav>
      </header>
      <div ref={main} className="min-h-0 flex-1 overflow-y-auto">
        <div className={`mx-auto max-w-[1200px] px-4 pb-10 pt-6 md:px-6 ${step === 0 ? "" : "grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]"}`}>
          {step === 0 && (
            <div className="flex max-w-[640px] flex-col gap-8">
              <Labeled label="Nome da campanha" hint="Nome interno, para a equipe. O cliente não vê.">{(id, dsc) => <input id={id} aria-describedby={dsc} autoFocus className={FIELD} maxLength={80} placeholder="Ex.: Convite ao showroom · Linha de verão" value={d.name} onChange={(e) => patch({ name: e.target.value })} />}</Labeled>
              <section>
                <H title="Número remetente" text="Os clientes recebem a mensagem deste número." />
                {!senders ? <p className="text-tx2">Carregando…</p> : !senders.length ? <Note tone="alert">Nenhum número de WhatsApp cadastrado. Cadastre em Configurações › Canais.</Note> : (
                  <ul role="radiogroup" aria-label="Número remetente" className="flex flex-col gap-2">{senders.map((s) => { const on = s.id === d.senderId; return (
                    <li key={s.id}><button type="button" role="radio" aria-checked={on} onClick={() => patch({ senderId: s.id })} className={`flex w-full items-start gap-3 rounded-card border bg-surface p-4 text-left transition-colors ${on ? "border-gold" : "border-line hover:border-line2"}`}>
                      <span className={`mt-1 size-4 shrink-0 rounded-full border ${on ? "border-[5px] border-gold" : "border-line3"}`} aria-hidden />
                      <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">{s.account}</span><span className="tnum block text-[14px]">{s.handle}</span><span className="mt-1 block text-[13px] text-tx2">Qualidade {s.quality.toLowerCase()} · limite de {s.limit}</span>{s.problem && <span className="mt-1 block text-[13px] text-alert">{s.problem} Resolva em Configurações › Canais antes de continuar.</span>}</span>
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px]"><Dot tone={s.status === "Conectado" ? "positive" : s.status === "Erro" ? "alert" : "warning"} />{s.status}</span>
                    </button></li>); })}</ul>
                )}
                <div className="mt-4"><Note>Estado, qualidade e limite são os cadastrados em Configurações › Canais. A conexão com a API do WhatsApp ainda não existe neste ambiente: nenhuma mensagem sai até ela ser feita.</Note></div>
              </section>
            </div>
          )}
          {step === 1 && <>
            <StepAudience audience={d.audience} onChange={(audience) => patch({ audience })} saved={saved_} result={aud.data} onOpen={() => setList(true)} />
            <aside aria-label="Resumo do público" className="h-fit rounded-[12px] border border-line bg-surface p-5 lg:sticky lg:top-0"><AudienceSummary result={aud.data} loading={aud.loading} onOpen={() => setList(true)} /><p className="mt-4 border-t border-line pt-3 text-[12.5px] leading-[18px] text-tx2">A lista é recalculada até a confirmação e fica fixa a partir dela, inclusive em campanhas agendadas.</p></aside>
          </>}
          {step === 2 && <>
            <div className="flex min-w-0 flex-col gap-10">
              <TemplateLibrary templates={templates} senderId={d.senderId} value={d.templateId} onPick={(x) => { if (x.id !== d.templateId && d.templateId) toast("Modelo trocado: revise as variáveis e as ações dos botões."); patch(pickTemplate(x, d)); }} />
              {t && <Personalize t={t} d={d} patch={patch} eligibleIds={eligibleIds} />}
              {t && <Replies t={t} d={d} patch={patch} tags={tags} sellers={sellers} automations={automations} />}
            </div>
            <aside aria-label="Prévia" className="flex h-fit flex-col gap-3 lg:sticky lg:top-0">
              <MessagePreview sender={sender} t={t} d={d} sample={sample} />
              {t && <p className="text-[12.5px] leading-[18px] text-tx2">A prévia mostra um destinatário por vez. A validação das variáveis considera os {int(eligibleIds.length)} elegíveis.</p>}
            </aside>
          </>}
          {step === 3 && <StepReview d={d} patch={patch} sender={sender} t={t} aud={aud.data} rate={rate} rateAt={settings?.costs.updatedAt} ready={ready} describe={describe(d.audience, label)} audienceName={saved_?.find((s) => s.id === d.audience.savedId)?.name} onEdit={setStep} onList={() => setList(true)} sample={sample} />}
        </div>
      </div>
      <footer className="shrink-0 border-t border-line bg-bg">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-2 px-4 py-3 md:px-6">
          <Button className="!h-11 !rounded-card" disabled={step === 0} onClick={() => setStep(step - 1)}>Voltar</Button>
          <span className="order-last w-full text-[13px] text-alert sm:order-none sm:ml-3 sm:w-auto sm:flex-1" role="status">{stepIssues[0] && step < 3 ? stepIssues[0].text : ""}</span>
          <div className="ml-auto flex gap-2">
            <button type="button" className={GHOST} disabled={saving || !dirty || !d.name.trim()} title={!d.name.trim() ? "Dê um nome para salvar" : undefined} onClick={() => void save()}>Salvar rascunho</button>
            {step < 3 ? <button type="button" className={GOLD} disabled={!!stepIssues.length} onClick={() => setStep(step + 1)}>{NEXT[step]}</button>
              : <button type="button" className={GOLD} disabled={!!ready.problems.length || sending} onClick={() => { setChecked(false); setConfirm(true); }}>{finalLabel}</button>}
          </div>
        </div>
      </footer>
      {list && aud.data && <RecipientsDialog result={aud.data} audience={d.audience} onExclude={step === 1 || step === 3 ? (excludeContacts) => patch({ audience: { ...d.audience, excludeContacts } }) : undefined} onClose={() => setList(false)} />}
      <Dialog open={!!leave} onClose={() => setLeave(null)} title="Sair sem salvar?" width={420} footer={<><Button onClick={() => setLeave(null)}>Continuar editando</Button><Button variant="danger" onClick={() => { skip.current = true; router.push(leave!); }}>Sair sem salvar</Button></>}><p className="text-tx3">As alterações desde o último salvamento serão perdidas.</p></Dialog>
      <Dialog open={confirm} onClose={() => !sending && setConfirm(false)} title={plan.immediate ? "Confirmar envio" : "Confirmar agendamento"} width={460} footer={<><Button disabled={sending} onClick={() => setConfirm(false)}>Voltar</Button><button type="button" className={`${GOLD} !h-10`} disabled={!checked || sending} onClick={() => void send()}>{sending ? "Confirmando…" : finalLabel}</button></>}>
        <dl className="flex flex-col gap-2 text-[14px]">
          <div className="flex justify-between gap-4"><dt className="text-tx2">Destinatários</dt><dd className="tnum font-medium">{int(eligible)} contatos elegíveis</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-tx2">Remetente</dt><dd className="tnum font-medium">{sender?.handle}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-tx2">Quando</dt><dd className="text-right font-medium">{plan.sendAt ? (plan.immediate ? "Agora" : longLabel(plan.sendAt)) : "—"}<span className="block text-[12px] font-normal text-tx2">{TZ_LABEL}</span></dd></div>
          <div className="flex justify-between gap-4"><dt className="text-tx2">Custo estimado</dt><dd className="tnum text-right font-medium">{rate === null ? "Não estimado" : moneyCents(eligible * rate)}</dd></div>
        </dl>
        <Note>Neste ambiente a integração com o WhatsApp não existe: a campanha fica registrada com os destinatários fixados, e nada é enviado.</Note>
        <Checkbox checked={checked} onChange={setChecked}><span>Revisei público, mensagem, horário e custo</span></Checkbox>
      </Dialog>
    </div>
  );
}
export const blankCampaign = (): CampaignDraft => ({ name: "", senderId: "", audience: { match: "todas", rules: [], excludeTags: [], excludeAudiences: [], excludeContacts: [] }, templateId: "", vars: {}, replies: { owner: "manter", ownerId: "", replyTagId: "", buttons: [] }, when: "agora", scheduledAt: "" });

