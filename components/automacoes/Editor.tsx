"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Plus, ShieldCheck, X } from "lucide-react";
import { listConversations, listProducts, listSellers, listStages, listTags, listTemplates, saveAutomation, testAutomation } from "@/lib/data/repositories";
import { ORIGINS, type Automation, type RuleItem } from "@/lib/data/types";
import { newId } from "@/lib/data/db";
import { useQuery } from "@/lib/useQuery";
import { attempt } from "@/store/app";
import { Button, Dialog, Field, IconButton, Input, MoneyInput, Select, Textarea, type Option } from "@/components/ui";
import { ACTIONS, CONDITIONS, TRIGGERS, defOf, problems, sentence, type Draft, type RuleDef } from "./catalog";

const named = (l: { name: string }[] | undefined): Option[] => (l ?? []).map((x) => ({ value: x.name, label: x.name }));
const plain = (l: readonly string[]): Option[] => l.map((x) => ({ value: x, label: x }));
export function ValueInput({ def, value, onChange }: { def: RuleDef; value: string; onChange: (v: string) => void }) {
  const stages = useQuery(listStages).data, tags = useQuery(listTags).data, sellers = useQuery(listSellers).data, products = useQuery(listProducts).data, templates = useQuery(listTemplates).data;
  const sel = (o: Option[], placeholder = def.optional ? "Qualquer" : "Escolher") => <Select aria-label={def.label} placeholder={placeholder} options={o} value={value} onChange={(e) => onChange(e.target.value)} />;
  switch (def.input) {
    case "nada": return null;
    case "etapa": return sel(named(stages)); case "tag": return sel(named(tags)); case "produto": return sel(named(products)); case "origem": return sel(plain(ORIGINS));
    case "responsavel": return sel(named(sellers)); case "responsavel_rodizio": return sel([{ value: "Rodízio", label: "Rodízio da equipe" }, ...named(sellers)]);
    case "canal": return sel(plain(["WhatsApp", "Instagram"])); case "horario": return sel(plain(["Dentro do horário", "Fora do horário"])); case "avisar": return sel(plain(["Responsável", "Gestor"]));
    case "anuncio": return sel(plain([...new Set(products?.map((p) => p.category) ?? []), "Sauna"]));
    case "modelo": return sel((templates ?? []).filter((t) => t.status === "Aprovado").map((t) => ({ value: t.name, label: `${t.name} · ${t.category}` })));
    case "valor": return <MoneyInput aria-label={def.label} value={Number(value)} onValue={(n) => onChange(n ? String(n) : "")} />;
    case "longo": return <Textarea aria-label="Texto da mensagem" maxLength={600} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Texto enviado ao cliente" />;
    case "horas": case "dias": return <div className="flex items-center gap-2"><Input aria-label={def.label} type="number" min={1} max={999} className="!w-24" value={value} onChange={(e) => onChange(e.target.value)} /><span className="t-sec">{def.input}</span></div>;
    case "espera": { const [n = "", u = "horas"] = value.split(" "); return <div className="flex gap-2"><Input aria-label="Tempo" type="number" min={1} className="!w-24" value={n} onChange={(e) => onChange(e.target.value ? `${e.target.value} ${u}` : "")} /><Select aria-label="Unidade" className="!w-28" options={plain(["horas", "dias"])} value={u} onChange={(e) => onChange(`${n || 1} ${e.target.value}`)} /></div>; }
    default: return <Input aria-label={def.label} value={value} maxLength={80} placeholder={def.optional ? "Palavra-chave (opcional)" : ""} onChange={(e) => onChange(e.target.value)} />;
  }
}
function Item({ item, list, onChange, onRemove, sortable }: { item: RuleItem; list: RuleDef[]; onChange: (i: RuleItem) => void; onRemove: () => void; sortable?: boolean }) {
  const s = useSortable({ id: item.id, disabled: !sortable }), def = defOf(list, item.type);
  return (
    <li ref={s.setNodeRef} style={{ transform: CSS.Translate.toString(s.transform), transition: s.transition }} className={`flex items-start gap-2 rounded-card border bg-bg p-2.5 ${s.isDragging ? "relative z-10 shadow-pop" : ""}`}>
      {sortable && <button type="button" aria-label="Reordenar ação" {...s.attributes} {...s.listeners} className="flex h-[34px] w-5 cursor-grab touch-none items-center text-tx2"><GripVertical size={15} strokeWidth={1.5} /></button>}
      <div className="grid flex-1 gap-2 sm:grid-cols-2"><Select aria-label="Tipo" options={list.map((d) => ({ value: d.type, label: d.label }))} value={item.type} onChange={(e) => onChange({ ...item, type: e.target.value, value: "" })} /><ValueInput def={def} value={item.value} onChange={(value) => onChange({ ...item, value })} /></div>
      <IconButton icon={X} label="Remover" onClick={onRemove} />
    </li>
  );
}
function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return <section className="border-t py-6 first:border-0 first:pt-0"><header className="mb-3.5 flex items-baseline gap-3"><span className="tnum flex size-6 shrink-0 items-center justify-center self-center rounded-full border border-tx text-[12px] font-semibold">{n}</span><h2 className="t-block">{title}</h2><p className="t-sec">{hint}</p></header><div className="pl-0 sm:pl-9">{children}</div></section>;
}
type Result = Awaited<ReturnType<typeof testAutomation>>;
function TestDialog({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const convs = useQuery(listConversations).data ?? [];
  const [id, setId] = useState(""), [r, setR] = useState<Result | null>(null);
  const pass = r?.conditions.every((c) => c.ok);
  const outcome = (a: RuleItem): string | null => {
    if (a.type === "mensagem" && !r?.inWindow) return "não seria enviada: janela de 24h encerrada, use um modelo";
    if ((a.type === "mensagem" || a.type === "modelo") && r?.autoRecent) return "não seria enviada: já houve mensagem automática em 24 h";
    return null;
  };
  return (
    <Dialog open onClose={onClose} title="Testar automação" description="Nada é enviado nem alterado." footer={<><Button onClick={onClose}>Fechar</Button><Button variant="primary" disabled={!id} onClick={() => void attempt(testAutomation(draft, id).then(setR))}>Testar</Button></>}>
      <Field label="Lead"><Select placeholder="Escolher lead" options={convs.map((v) => ({ value: v.id, label: `${v.contact.name}${v.deal ? ` · ${v.deal.title}` : ""}` }))} value={id} onChange={(e) => { setId(e.target.value); setR(null); }} /></Field>
      {r && <div className="flex flex-col gap-3" aria-live="polite">
        {r.conditions.length > 0 && <div><p className="t-label mb-1.5">Condições</p>{r.conditions.map((c) => <p key={c.id} className={`flex items-center gap-2 py-0.5 ${c.ok ? "" : "text-alert"}`}>{c.ok ? <Check size={14} strokeWidth={1.75} aria-label="Atende" /> : <X size={14} strokeWidth={1.75} aria-label="Não atende" />}{defOf(CONDITIONS, c.type).say(c.value)}</p>)}</div>}
        {pass ? <div><p className="t-label mb-1.5">O que aconteceria com {r.name}</p><ol className="flex flex-col gap-1.5">{draft.actions.map((a, i) => { const o = outcome(a); return <li key={a.id} className="flex gap-2.5"><span className="tnum text-tx2">{i + 1}.</span><span>{defOf(ACTIONS, a.type).say(a.value)}{o && <span className="block text-alert">{o}</span>}</span></li>; })}</ol></div> : <p className="font-medium">{r.name} não atende às condições. Nada aconteceria.</p>}
      </div>}
    </Dialog>
  );
}
export function Editor({ initial, automation }: { initial: Draft; automation?: Automation }) {
  const router = useRouter();
  const withIds = (l: RuleItem[]) => l.map((x) => ({ ...x, id: x.id || newId("i") }));
  const [d, setD] = useState<Draft>({ name: initial.name, trigger: initial.trigger, conditions: withIds(initial.conditions), actions: withIds(initial.actions) });
  const [test, setTest] = useState(false), [tried, setTried] = useState(false), [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const errs = problems(d), trig = defOf(TRIGGERS, d.trigger.type);
  const list = (k: "conditions" | "actions") => ({ change: (i: RuleItem) => setD({ ...d, [k]: d[k].map((x) => (x.id === i.id ? i : x)) }), remove: (id: string) => setD({ ...d, [k]: d[k].filter((x) => x.id !== id) }), add: (type: string) => setD({ ...d, [k]: [...d[k], { id: newId("i"), type, value: "" }] }) });
  const cond = list("conditions"), act = list("actions");
  const save = async (active: boolean) => {
    setTried(true);
    if (errs.length) return;
    setBusy(true);
    if (await attempt(saveAutomation({ ...d, id: automation?.id, active }), active ? "Automação ativada" : "Automação salva como pausada")) router.push("/automacoes");
    setBusy(false);
  };
  return (
    <div className="grid gap-8 px-4 py-6 md:px-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="max-w-3xl">
        <Field label="Nome" className="mb-7"><Input value={d.name} maxLength={60} placeholder="Ex.: Retomar proposta parada" onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
        <Step n={1} title="Quando" hint="o que dispara a regra"><div className="grid gap-2 sm:grid-cols-2"><Select aria-label="Gatilho" options={TRIGGERS.map((t) => ({ value: t.type, label: t.label }))} value={d.trigger.type} onChange={(e) => setD({ ...d, trigger: { type: e.target.value, value: "" } })} /><ValueInput def={trig} value={d.trigger.value} onChange={(value) => setD({ ...d, trigger: { ...d.trigger, value } })} /></div></Step>
        <Step n={2} title="Se" hint="opcional, todas precisam valer">
          <DndContext><SortableContext items={d.conditions}><ul className="flex flex-col gap-2">{d.conditions.map((c, i) => <div key={c.id} className="contents">{i > 0 && <li className="t-label pl-1">e</li>}<Item item={c} list={CONDITIONS} onChange={cond.change} onRemove={() => cond.remove(c.id)} /></div>)}</ul></SortableContext></DndContext>
          <Button size="sm" icon={Plus} className="mt-2.5" onClick={() => cond.add("canal")}>Adicionar condição</Button>
        </Step>
        <Step n={3} title="Faça" hint="na ordem abaixo, arraste para mudar">
          <DndContext id="acoes" sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => { const a = d.actions.findIndex((x) => x.id === e.active.id), b = d.actions.findIndex((x) => x.id === e.over?.id); if (a >= 0 && b >= 0 && a !== b) setD({ ...d, actions: arrayMove(d.actions, a, b) }); }}>
            <SortableContext items={d.actions} strategy={verticalListSortingStrategy}><ul className="flex flex-col gap-2">{d.actions.map((a) => <Item key={a.id} sortable item={a} list={ACTIONS} onChange={act.change} onRemove={() => act.remove(a.id)} />)}</ul></SortableContext>
          </DndContext>
          <Button size="sm" icon={Plus} className="mt-2.5" onClick={() => act.add("tarefa")}>Adicionar ação</Button>
        </Step>
      </div>
      <aside className="flex flex-col gap-5 xl:sticky xl:top-6 xl:self-start">
        <div className="border-t border-tx pt-4"><p className="t-label mb-2">Resumo da regra</p><p className="text-[15px] leading-6" aria-live="polite">{sentence(d)}</p></div>
        <p className="flex gap-2.5 border-y py-3.5"><ShieldCheck size={16} strokeWidth={1.5} className="mt-px shrink-0 text-tx2" aria-hidden /><span className="t-sec">No máximo 1 mensagem automática por lead a cada 24 h. Repetição em laço é bloqueada.</span></p>
        {tried && errs.length > 0 && <ul role="alert" className="flex flex-col gap-1 text-alert">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
        <div className="flex flex-col gap-2"><Button variant="primary" disabled={busy} onClick={() => void save(true)}>Ativar</Button><Button disabled={busy} onClick={() => void save(false)}>Salvar como pausada</Button><Button variant="ghost" disabled={!d.actions.length} onClick={() => setTest(true)}>Testar</Button></div>
      </aside>
      {test && <TestDialog draft={d} onClose={() => setTest(false)} />}
    </div>
  );
}
