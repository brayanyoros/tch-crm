"use client";
import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import { createTag, deleteQuickReply, getSettings, listProducts, listQuickReplies, listStages, listTags, listTemplates, saveProduct, saveQuickReply, saveStages, saveTemplate, tagUsage, updateSettings, updateTag } from "@/lib/data/repositories";
import type { Product, QuickReply, Stage, Tag as TagT, TagColor, Template } from "@/lib/data/types";
import { newId } from "@/lib/data/db";
import { useQuery } from "@/lib/useQuery";
import { attempt } from "@/store/app";
import { money, plural } from "@/lib/format";
import { Button, Confirm, Dialog, Dot, EmptyState, Field, IconButton, Input, Loaded, MoneyInput, Popover, Section, Select, Table, Tag, Textarea, type Col } from "@/components/ui";
import { ColorPalette } from "@/components/contatos/TagPicker";

function StageRow({ s, fixed, onChange, onRemove }: { s: Stage; fixed: boolean; onChange: (s: Stage) => void; onRemove: () => void }) {
  const d = useSortable({ id: s.id, disabled: fixed });
  return (
    <li ref={d.setNodeRef} style={{ transform: CSS.Translate.toString(d.transform), transition: d.transition }} className={`flex items-center gap-2 border-b bg-bg py-2 ${d.isDragging ? "relative z-10 shadow-pop" : ""}`}>
      {fixed ? <span className="w-5" /> : <button type="button" aria-label={`Reordenar ${s.name}`} {...d.attributes} {...d.listeners} className="flex h-8 w-5 cursor-grab touch-none items-center text-tx2"><GripVertical size={15} strokeWidth={1.5} /></button>}
      <Input aria-label="Nome da etapa" maxLength={30} value={s.name} onChange={(e) => onChange({ ...s, name: e.target.value })} />
      <div className="flex shrink-0 items-center gap-1.5"><Input aria-label={`Chance de ${s.name}`} type="number" min={0} max={100} disabled={fixed} className="!w-20" value={s.chance} onChange={(e) => onChange({ ...s, chance: Math.min(100, Math.max(0, Number(e.target.value))) })} /><span className="t-sec">%</span></div>
      {fixed ? <span className="w-8" /> : <IconButton icon={Trash2} label={`Excluir ${s.name}`} onClick={onRemove} />}
    </li>
  );
}
function StagesForm({ initial }: { initial: Stage[] }) {
  const [l, setL] = useState(initial);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const last = l.length - 1;
  return (
    <>
      <p className="t-sec mb-1">A chance de fechamento alimenta a previsão nos Insights. A última etapa é sempre a de ganho.</p>
      <DndContext id="etapas" sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => { const a = l.findIndex((x) => x.id === e.active.id), b = l.findIndex((x) => x.id === e.over?.id); if (a >= 0 && b >= 0 && b !== last) setL(arrayMove(l, a, b)); }}>
        <SortableContext items={l} strategy={verticalListSortingStrategy}><ul>{l.map((s, i) => <StageRow key={s.id} s={s} fixed={i === last} onChange={(n) => setL(l.map((x) => (x.id === s.id ? n : x)))} onRemove={() => setL(l.filter((x) => x.id !== s.id))} />)}</ul></SortableContext>
      </DndContext>
      <div className="mt-3 flex gap-2"><Button size="sm" icon={Plus} onClick={() => setL([...l.slice(0, -1), { id: newId("st"), name: "", chance: 50 }, l[last]])}>Etapa</Button><Button size="sm" variant="primary" disabled={l.some((s) => !s.name.trim())} onClick={() => void attempt(saveStages(l), "Etapas salvas")}>Salvar etapas</Button></div>
    </>
  );
}
export function Funil() {
  const q = useQuery(listStages), s = useQuery(getSettings), [reason, setReason] = useState("");
  return (
    <div className="flex flex-col gap-9">
      <Section title="Etapas"><Loaded q={q}>{(l) => <StagesForm key={l.map((x) => x.id).join()} initial={l} />}</Loaded></Section>
      <Section title="Motivos de perda"><Loaded q={s}>{({ lossReasons: r }) => <><ul>{r.map((x) => <li key={x} className="flex items-center border-b py-1"><span className="flex-1">{x}</span><IconButton icon={X} label={`Remover ${x}`} disabled={r.length === 1} onClick={() => void attempt(updateSettings({ lossReasons: r.filter((y) => y !== x) }), "Motivo removido")} /></li>)}</ul><form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = reason.trim(); if (t && !r.includes(t)) void attempt(updateSettings({ lossReasons: [...r, t] }), "Motivo criado"); setReason(""); }}><Input aria-label="Novo motivo" className="max-w-60" maxLength={30} placeholder="Novo motivo" value={reason} onChange={(e) => setReason(e.target.value)} /><Button type="submit" disabled={!reason.trim()}>Adicionar</Button></form></>}</Loaded></Section>
    </div>
  );
}
export function Produtos() {
  const q = useQuery(listProducts), [p, setP] = useState<(Omit<Product, "id"> & { id?: string }) | null>(null);
  const cols: Col<Product>[] = [{ key: "n", label: "Produto", render: (x) => x.name, sort: (x) => x.name }, { key: "c", label: "Categoria", render: (x) => x.category, sort: (x) => x.category }, { key: "p", label: "Preço base", right: true, render: (x) => money(x.price), sort: (x) => x.price }];
  return (
    <Section title="Catálogo" aside={<Button size="sm" variant="primary" icon={Plus} onClick={() => setP({ name: "", category: "Saunas", price: 0 })}>Produto</Button>}>
      <Loaded q={q}>{(l) => <><Table caption="Produtos" cols={cols} rows={l} onRow={setP} /><datalist id="categorias">{[...new Set(l.map((x) => x.category))].map((c) => <option key={c} value={c} />)}</datalist></>}</Loaded>
      {p && <Dialog open onClose={() => setP(null)} title={p.id ? "Editar produto" : "Novo produto"} width={440} footer={<><Button onClick={() => setP(null)}>Cancelar</Button><Button variant="primary" disabled={!p.name.trim() || !p.category.trim() || p.price <= 0} onClick={async () => { if (await attempt(saveProduct(p), "Produto salvo")) setP(null); }}>Salvar</Button></>}><Field label="Nome"><Input autoFocus value={p.name} maxLength={80} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Categoria"><Input list="categorias" value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })} /></Field><Field label="Preço base"><MoneyInput value={p.price} onValue={(price) => setP({ ...p, price })} /></Field></div></Dialog>}
    </Section>
  );
}
function TagRow({ t, n }: { t: TagT; n: number }) {
  const [name, setName] = useState(t.name);
  const save = () => { const v = name.trim(); if (!v || v === t.name) return setName(t.name); void attempt(updateTag(t.id, { name: v }), "Tag renomeada").then((ok) => !ok && setName(t.name)); };
  return (
    <li className="grid grid-cols-[minmax(96px,160px)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(96px,160px)_1fr_auto_auto] items-center gap-3 border-b py-2">
      <span><Tag {...t} /></span><Input aria-label={`Nome da tag ${t.name}`} maxLength={24} value={name} onChange={(e) => setName(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} /><span className="t-sec tnum hidden w-20 text-right sm:block">{plural(n, "contato")}</span>
      <Popover align="end" trigger={<Button size="sm">Cor</Button>}><div className="p-3"><ColorPalette value={t.color} onChange={(color) => void attempt(updateTag(t.id, { color }))} /></div></Popover>
    </li>
  );
}
export function Tags() {
  const q = useQuery(listTags), use = useQuery(tagUsage).data ?? {}, [name, setName] = useState(""), [color, setColor] = useState<TagColor>("champanhe");
  return (
    <Section title="Tags">
      <form className="mb-4 flex flex-wrap items-center gap-3" onSubmit={async (e) => { e.preventDefault(); if (name.trim() && (await attempt(createTag(name, color), "Tag criada"))) setName(""); }}><Input aria-label="Nova tag" className="max-w-52" maxLength={24} placeholder="Nova tag" value={name} onChange={(e) => setName(e.target.value)} /><ColorPalette value={color} onChange={setColor} /><Button type="submit" variant="primary" disabled={!name.trim()}>Criar tag</Button></form>
      <Loaded q={q}>{(l) => <ul className="border-t">{l.map((t) => <TagRow key={t.id} t={t} n={use[t.id] ?? 0} />)}</ul>}</Loaded>
    </Section>
  );
}
const WHO = [{ value: "todos", label: "Toda a equipe" }, { value: "gestor", label: "Só gestores" }];
export function Respostas() {
  const q = useQuery(listQuickReplies), [r, setR] = useState<(Omit<QuickReply, "id"> & { id?: string }) | null>(null), [del, setDel] = useState<QuickReply | null>(null);
  const bad = !!r && !/^\/[a-z0-9_-]{2,20}$/.test(r.shortcut);
  return (
    <Section title="Respostas rápidas" aside={<Button size="sm" variant="primary" icon={Plus} onClick={() => setR({ shortcut: "/", text: "", who: "todos" })}>Resposta</Button>}>
      <Loaded q={q}>{(l) => l.length ? <ul>{l.map((x) => <li key={x.id} className="flex items-start gap-4 border-b py-3"><button type="button" className="w-28 shrink-0 text-left font-semibold underline-offset-4 hover:underline" onClick={() => setR(x)}>{x.shortcut}</button><span className="flex-1">{x.text}<span className="t-meta block text-tx2">{WHO.find((w) => w.value === x.who)?.label}</span></span><IconButton icon={Trash2} label={`Excluir ${x.shortcut}`} onClick={() => setDel(x)} /></li>)}</ul> : <EmptyState title="Nenhuma resposta rápida" text="Crie atalhos para prazos, instalação e endereço." />}</Loaded>
      {r && <Dialog open onClose={() => setR(null)} title={r.id ? "Editar resposta" : "Nova resposta"} footer={<><Button onClick={() => setR(null)}>Cancelar</Button><Button variant="primary" disabled={bad || !r.text.trim()} onClick={async () => { if (await attempt(saveQuickReply(r), "Resposta salva")) setR(null); }}>Salvar</Button></>}><div className="grid gap-4 sm:grid-cols-2"><Field label="Atalho" hint="Barra e letras minúsculas, sem espaço." error={bad && r.shortcut.length > 2 ? "Use só letras minúsculas e números." : undefined}><Input autoFocus value={r.shortcut} onChange={(e) => setR({ ...r, shortcut: "/" + e.target.value.replace(/^\/+/, "") })} /></Field><Field label="Quem pode usar"><Select options={WHO} value={r.who} onChange={(e) => setR({ ...r, who: e.target.value === "gestor" ? "gestor" : "todos" })} /></Field></div><Field label="Texto"><Textarea rows={4} maxLength={600} value={r.text} onChange={(e) => setR({ ...r, text: e.target.value })} /></Field></Dialog>}
      <Confirm open={!!del} onClose={() => setDel(null)} title="Excluir resposta" text={`O atalho ${del?.shortcut ?? ""} deixa de funcionar para todos.`} action="Excluir" onConfirm={() => del && void attempt(deleteQuickReply(del.id), "Resposta excluída")} />
    </Section>
  );
}
export function Modelos() {
  const q = useQuery(listTemplates), [t, setT] = useState<Pick<Template, "name" | "category" | "body"> | null>(null);
  const cols: Col<Template>[] = [{ key: "n", label: "Nome", render: (x) => <span className="font-medium">{x.name}</span>, sort: (x) => x.name }, { key: "c", label: "Categoria", render: (x) => x.category, sort: (x) => x.category }, { key: "s", label: "Status", sort: (x) => x.status, render: (x) => <span><span className="inline-flex items-center gap-1.5 whitespace-nowrap"><Dot tone={x.status === "Aprovado" ? "positive" : x.status === "Rejeitado" ? "alert" : "warning"} />{x.status}</span>{x.reason && <span className="t-meta block text-alert">{x.reason}</span>}</span> }, { key: "b", label: "Texto", render: (x) => <span className="text-tx2">{x.body}</span>, className: "min-w-64 py-2" }];
  const ok = t && /^[a-z0-9_]{3,40}$/.test(t.name) && t.body.trim().length > 9;
  return (
    <Section title="Modelos do WhatsApp" aside={<Button size="sm" variant="primary" icon={Plus} onClick={() => setT({ name: "", category: "Marketing", body: "" })}>Modelo</Button>}>
      <Loaded q={q}>{(l) => <Table caption="Modelos" cols={cols} rows={l} />}</Loaded>
      {t && <Dialog open onClose={() => setT(null)} title="Novo modelo" description="Segue para análise da Meta antes de poder ser usado." footer={<><Button onClick={() => setT(null)}>Cancelar</Button><Button variant="primary" disabled={!ok} onClick={async () => { if (await attempt(saveTemplate(t), "Modelo enviado para análise")) setT(null); }}>Enviar para análise</Button></>}><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome" hint="Letras minúsculas, números e _"><Input autoFocus value={t.name} onChange={(e) => setT({ ...t, name: e.target.value.toLowerCase().replace(/\s+/g, "_") })} /></Field><Field label="Categoria"><Select options={[{ value: "Marketing", label: "Marketing" }, { value: "Utilidade", label: "Utilidade" }]} value={t.category} onChange={(e) => setT({ ...t, category: e.target.value === "Utilidade" ? "Utilidade" : "Marketing" })} /></Field></div><Field label="Texto" hint="Use {{nome}} e {{produto}} como variáveis."><Textarea rows={5} maxLength={1024} value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })} /></Field></Dialog>}
    </Section>
  );
}
