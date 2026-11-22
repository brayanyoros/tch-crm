"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Plus, Send, X } from "lucide-react";
import { getSettings, inSendWindow, listAutomations, listCities, listProducts, listSellers, listStages, listTags, listTemplates, nextWindow, previewAudience, saveCampaign, sendTest } from "@/lib/data/repositories";
import type { CampaignDraft, Template } from "@/lib/data/types";
import { useQuery } from "@/lib/useQuery";
import { attempt } from "@/store/app";
import { dateTime, fmt, int, moneyCents, now, plural, toLocalInput } from "@/lib/format";
import { tomorrow9 } from "@/components/tarefas/TaskDialog";
import { Button, Checkbox, Dialog, Field, IconButton, Input, Radio, Row, Section, Segmented, Select, opts, Skeleton } from "@/components/ui";
import { PhonePreview } from "./parts";

const STEPS = ["Público", "Modelo", "Agendamento", "Revisão", "Acompanhamento"];
const VARS = ["Primeiro nome", "Nome completo", "Produto de interesse", "Cidade", "Texto fixo"];
export const blankDraft = (): CampaignDraft => ({ name: "", filter: { stageId: "", tagId: "", productId: "", city: "", ownerId: "", lastDays: "" }, listName: "", templateId: "", vars: {}, header: { type: "nenhum", name: "" }, buttons: [{ text: "Quero saber mais", automationId: "" }, { text: "Não tenho interesse", automationId: "" }], when: "agendar", scheduledAt: nextWindow(tomorrow9()).toISOString(), batch: 50 });
const varsIn = (t?: Template) => [...new Set([...(t?.body.matchAll(/\{\{(\w+)\}\}/g) ?? [])].map((m) => m[1]))];
interface Sample { name: string; city: string; product: string }
function fill(t: Template | undefined, vars: Record<string, string>, s?: Sample) {
  return (t?.body ?? "").replace(/\{\{(\w+)\}\}/g, (m, k: string) => {
    const v = vars[k];
    if (!v) return m;
    if (v === "Primeiro nome") return s?.name.split(" ")[0] ?? "Marcelo";
    if (v === "Nome completo") return s?.name ?? "Marcelo Tavares";
    if (v === "Produto de interesse") return (s?.product ?? "sauna a vapor").toLowerCase();
    if (v === "Cidade") return s?.city ?? "Teresópolis";
    return v.replace(/^Texto fixo:?/, "") || m;
  });
}
export function Wizard({ initial }: { initial: CampaignDraft }) {
  const router = useRouter();
  const [d, setD] = useState(initial), [step, setStep] = useState(0), [confirm, setConfirm] = useState(false), [checked, setChecked] = useState(false), [busy, setBusy] = useState(false);
  const patch = (p: Partial<CampaignDraft>) => setD({ ...d, ...p });
  const stages = useQuery(listStages).data, tags = useQuery(listTags).data, products = useQuery(listProducts).data, cities = useQuery(listCities).data, sellers = useQuery(listSellers).data, settings = useQuery(getSettings).data;
  const templates = useQuery(listTemplates).data?.filter((t) => t.category === "Marketing" && t.status === "Aprovado"), autos = useQuery(listAutomations).data;
  const aud = useQuery(() => previewAudience(d.filter), [d.filter]), a = aud.data;
  const t = templates?.find((x) => x.id === d.templateId), vars = varsIn(t), body = fill(t, d.vars, a?.sample[0]);
  const out = a ? [a.noConsent && `${plural(a.noConsent, "contato")} fora: sem autorização`, a.left && `${plural(a.left, "contato")} fora: ${a.left === 1 ? "pediu" : "pediram"} para sair`, a.noPhone && `${plural(a.noPhone, "contato")} fora: sem WhatsApp`].filter(Boolean) : [];
  const cost = (a?.ok ?? 0) * (settings?.costs.marketing ?? 0);
  const badDate = d.when === "agendar" && (!d.scheduledAt || new Date(d.scheduledAt) < now() || !inSendWindow(new Date(d.scheduledAt)));
  const blocked = [!d.name.trim() ? "Dê um nome à campanha." : !a?.ok ? "O público está vazio." : "", !t ? "Escolha um modelo." : vars.some((v) => !d.vars[v] || /^Texto fixo:?$/.test(d.vars[v])) ? "Preencha as variáveis." : d.buttons.some((b) => !b.text.trim()) ? "Dê um texto a cada botão." : "", badDate ? "Escolha uma data futura, entre 8h e 20h, de segunda a sábado." : "", ""];
  const firstBlocked = blocked.findIndex(Boolean);
  const startAt = d.when === "agora" ? nextWindow(now()) : new Date(d.scheduledAt);
  const save = async (mode: "rascunho" | "enviar") => {
    setBusy(true);
    let id = "";
    const ok = await attempt(saveCampaign({ ...d, name: d.name.trim() || "Campanha sem nome" }, mode).then((x) => { id = x; }), mode === "rascunho" ? "Rascunho salvo" : "Campanha confirmada");
    setBusy(false);
    if (ok) router.push(mode === "rascunho" ? "/campanhas" : `/campanhas/${id}`);
  };
  const f = (k: keyof CampaignDraft["filter"]) => ({ value: d.filter[k], onChange: (e: React.ChangeEvent<HTMLSelectElement>) => patch({ filter: { ...d.filter, [k]: e.target.value } }) });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label="Passos" className="flex shrink-0 gap-6 overflow-x-auto border-b px-4 md:px-6">
        {STEPS.map((s, i) => <button key={s} type="button" disabled={i > 3 || (firstBlocked >= 0 && i > firstBlocked)} aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)} className={`relative flex h-12 shrink-0 items-center gap-2 outline-offset-[-2px] ${i === step ? "font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-gold" : "text-tx2"}`}><span className={`tnum flex size-5 items-center justify-center rounded-full border text-[11px] ${i < step ? "border-inv bg-inv text-oninv" : i === step ? "border-tx" : "border-line3"}`}>{i < step ? <Check size={12} strokeWidth={2} aria-label="Concluído" /> : i + 1}</span>{s}</button>)}
      </nav>
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
        {step === 0 && (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex max-w-2xl flex-col gap-5">
              <Field label="Nome da campanha"><Input autoFocus maxLength={60} value={d.name} placeholder="Ex.: Linha de verão no showroom" onChange={(e) => patch({ name: e.target.value })} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Etapa"><Select placeholder="Qualquer" options={opts(stages)} {...f("stageId")} /></Field><Field label="Tag"><Select placeholder="Qualquer" options={opts(tags)} {...f("tagId")} /></Field>
                <Field label="Produto"><Select placeholder="Qualquer" options={opts(products)} {...f("productId")} /></Field><Field label="Cidade"><Select placeholder="Qualquer" options={(cities ?? []).map((c) => ({ value: c, label: c }))} {...f("city")} /></Field>
                <Field label="Responsável"><Select placeholder="Qualquer" options={opts(sellers)} {...f("ownerId")} /></Field><Field label="Último contato"><Select placeholder="Qualquer data" options={[{ value: "7", label: "Últimos 7 dias" }, { value: "30", label: "Últimos 30 dias" }, { value: "60", label: "Últimos 60 dias" }]} {...f("lastDays")} /></Field>
              </div>
              <Field label="Salvar como lista" hint="Opcional. Guarda este público para usar de novo."><Input maxLength={40} value={d.listName} onChange={(e) => patch({ listName: e.target.value })} /></Field>
            </div>
            <aside className="border-t border-tx pt-4" aria-live="polite"><p className="t-label">Vão receber</p>{a ? <><p className={`t-num mt-1 ${aud.loading ? "opacity-40" : ""}`}>{int(a.ok)}</p><p className="t-sec tnum">de {plural(a.total, "contato")} no filtro</p><ul className="mt-4 flex flex-col gap-1.5 border-t pt-3">{out.map((o) => <li key={String(o)} className="t-sec tnum">{o}</li>)}</ul>{a.sample.length > 0 && <><p className="t-label mt-4 border-t pt-3">Alguns deles</p>{a.sample.map((s) => <p key={s.id} className="flex justify-between py-0.5"><span>{s.name}</span><span className="t-sec">{s.city}</span></p>)}</>}</> : <Skeleton className="mt-2 h-9 w-20" />}</aside>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex max-w-2xl flex-col gap-7">
              <Section title="Modelo aprovado"><div className="flex flex-col gap-2">{templates?.map((x) => <Radio key={x.id} name="modelo" checked={x.id === d.templateId} onChange={() => patch({ templateId: x.id, vars: { nome: "Primeiro nome", produto: "Produto de interesse" } })}><span className="block font-medium">{x.name}</span><span className="t-sec">{x.body}</span></Radio>) ?? <Skeleton className="h-20" />}</div></Section>
              {vars.length > 0 && <Section title="Variáveis"><div className="flex flex-col gap-3">{vars.map((v) => { const cur = d.vars[v] ?? "", fixed = cur.startsWith("Texto fixo"); return <div key={v} className="grid items-center gap-2 sm:grid-cols-[110px_1fr_1fr]"><code className="font-sans font-medium">{`{{${v}}}`}</code><Select aria-label={`Valor de ${v}`} placeholder="Escolher" options={VARS.map((o) => ({ value: o, label: o }))} value={fixed ? "Texto fixo" : cur} onChange={(e) => patch({ vars: { ...d.vars, [v]: e.target.value } })} />{fixed && <Input aria-label="Texto fixo" maxLength={60} value={cur.replace(/^Texto fixo:?/, "")} onChange={(e) => patch({ vars: { ...d.vars, [v]: `Texto fixo:${e.target.value}` } })} />}</div>; })}</div></Section>}
              <Section title="Topo da mensagem"><div className="flex flex-wrap items-center gap-3"><Segmented label="Topo" value={d.header.type} onChange={(type) => patch({ header: { type, name: "" } })} options={[{ value: "nenhum", label: "Sem anexo" }, { value: "imagem", label: "Imagem" }, { value: "pdf", label: "PDF" }]} />{d.header.type !== "nenhum" && <input key={d.header.type} type="file" aria-label="Arquivo do topo" accept={d.header.type === "imagem" ? "image/*" : "application/pdf"} className="t-sec max-w-full" onChange={(e) => patch({ header: { ...d.header, name: e.target.files?.[0]?.name ?? "" } })} />}</div></Section>
              <Section title="Botões de resposta" aside={d.buttons.length < 3 && <Button size="sm" icon={Plus} onClick={() => patch({ buttons: [...d.buttons, { text: "", automationId: "" }] })}>Botão</Button>}><div className="flex flex-col gap-2">{d.buttons.map((b, i) => { const ch = (p: Partial<typeof b>) => patch({ buttons: d.buttons.map((x, k) => (k === i ? { ...x, ...p } : x)) }); return <div key={i} className="flex gap-2"><Input aria-label={`Texto do botão ${i + 1}`} maxLength={20} value={b.text} onChange={(e) => ch({ text: e.target.value })} /><Select aria-label={`Automação do botão ${i + 1}`} placeholder="Sem automação" options={opts(autos)} value={b.automationId} onChange={(e) => ch({ automationId: e.target.value })} /><IconButton icon={X} label="Remover botão" onClick={() => patch({ buttons: d.buttons.filter((_, k) => k !== i) })} /></div>; })}</div></Section>
            </div>
            <aside className="lg:sticky lg:top-0 lg:self-start"><p className="t-label mb-3 text-center">Como o cliente vê</p><PhonePreview body={body} header={d.header} buttons={d.buttons} /></aside>
          </div>
        )}
        {step === 2 && (
          <div className="flex max-w-xl flex-col gap-4">
            <div role="radiogroup" aria-label="Quando enviar" className="flex flex-col gap-2">
              <Radio name="quando" checked={d.when === "agora"} onChange={() => patch({ when: "agora" })}><span className="block font-medium">Agora</span><span className="t-sec">{inSendWindow(now()) ? "Começa assim que o gestor confirmar." : `Fora do horário de envio. Sai em ${fmt(nextWindow(now()), "dd/MM 'às' HH:mm")}.`}</span></Radio>
              <Radio name="quando" checked={d.when === "agendar"} onChange={() => patch({ when: "agendar" })}><span className="block font-medium">Data e hora</span><span className="t-sec">Escolha o melhor momento.</span></Radio>
            </div>
            {d.when === "agendar" && <Field label="Enviar em" error={badDate ? blocked[2] : undefined}><Input type="datetime-local" min={toLocalInput(now())} value={d.scheduledAt ? toLocalInput(d.scheduledAt) : ""} onChange={(e) => patch({ scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : "" })} /></Field>}
            <Field label="Tamanho do lote" hint={`Um lote a cada 10 minutos: ${plural(Math.ceil((a?.ok ?? 0) / d.batch), "lote")}, cerca de ${Math.max(0, Math.ceil((a?.ok ?? 0) / d.batch) - 1) * 10} min no total.`}><Select options={["20", "50", "100"].map((n) => ({ value: n, label: `${n} mensagens` }))} value={String(d.batch)} onChange={(e) => patch({ batch: Number(e.target.value) })} /></Field>
            <p className="t-sec border-t pt-3">As mensagens só saem entre 8h e 20h, de segunda a sábado. O que não couber no dia continua no próximo dia permitido.</p>
          </div>
        )}
        {step === 3 && (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="max-w-xl">
              <div className="border-t border-tx pt-4"><p className="t-label">Custo estimado</p><p className="t-num mt-1">{moneyCents(cost)}</p><p className="t-sec tnum">{plural(a?.ok ?? 0, "contato")} × {moneyCents(settings?.costs.marketing ?? 0)} por mensagem de marketing</p></div>
              <div className="mt-6 border-y py-2"><Row label="Campanha">{d.name}</Row><Row label="Público">{d.listName || "Filtros aplicados"} · {plural(a?.ok ?? 0, "contato")}</Row><Row label="Fora do público"><span className="tnum">{(a?.noConsent ?? 0) + (a?.left ?? 0) + (a?.noPhone ?? 0)}</span></Row><Row label="Modelo">{t?.name}</Row><Row label="Topo">{d.header.type === "nenhum" ? "Sem anexo" : d.header.name || d.header.type}</Row><Row label="Botões">{d.buttons.map((b) => b.text).join(", ") || "Nenhum"}</Row><Row label="Envio">{d.when === "agora" && inSendWindow(now()) ? "Agora" : fmt(startAt, "dd/MM/yyyy 'às' HH:mm")} · lotes de {d.batch}</Row></div>
              <Button icon={Send} className="mt-5" onClick={() => void attempt(sendTest(), "Teste enviado para o seu número")}>Enviar teste para o meu número</Button>
            </div>
            <PhonePreview body={body} header={d.header} buttons={d.buttons} />
          </div>
        )}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-3 md:px-6">
        <Button variant="ghost" onClick={() => (step ? setStep(step - 1) : router.push("/campanhas"))}>{step ? "Voltar" : "Cancelar"}</Button>
        <span className="t-sec ml-auto hidden sm:inline">{blocked[step]}</span>
        <Button disabled={busy} onClick={() => void save("rascunho")}>Salvar rascunho</Button>
        {step < 3 ? <Button variant="primary" disabled={!!blocked[step]} onClick={() => setStep(step + 1)}>Avançar</Button> : <Button variant="primary" disabled={firstBlocked >= 0 || busy} onClick={() => { setChecked(false); setConfirm(true); }}>{d.when === "agora" ? "Enviar campanha" : "Agendar campanha"}</Button>}
      </footer>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Confirmação do gestor" description={`${plural(a?.ok ?? 0, "mensagem", "mensagens")} · ${moneyCents(cost)} · ${d.when === "agora" && inSendWindow(now()) ? "agora" : dateTime(startAt.toISOString())}`} width={420} footer={<><Button onClick={() => setConfirm(false)}>Voltar</Button><Button variant="primary" disabled={!checked || busy} onClick={() => void save("enviar")}>Confirmar</Button></>}><Checkbox checked={checked} onChange={setChecked}><span>Revisei público, texto e custo</span></Checkbox></Dialog>
    </div>
  );
}
