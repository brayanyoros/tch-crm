"use client";
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { TAG_COLORS, TAG_COLOR_LABEL, type Tag as TagT, type TagColor } from "@/lib/data/types";
import { createTag, listTags, setContactTags, updateTag } from "@/lib/data/repositories";
import { useQuery } from "@/lib/useQuery";
import { attempt } from "@/store/app";
import { Button, Input, Popover, Tag, tagVar } from "@/components/ui";

export function ColorPalette({ value, onChange }: { value: TagColor; onChange: (c: TagColor) => void }) {
  return (
    <div role="radiogroup" aria-label="Cor da tag" className="flex gap-1.5">
      {TAG_COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={c === value} aria-label={TAG_COLOR_LABEL[c]} title={TAG_COLOR_LABEL[c]} onClick={() => onChange(c)} style={tagVar(c)} className={`tag-dot flex size-6 items-center justify-center rounded-full ${c === value ? "outline-2 outline-offset-2 outline-gold" : ""}`}>{c === value && <Check size={13} strokeWidth={2} className="text-bg" aria-hidden />}</button>)}
    </div>
  );
}
function Body({ contactId, tagIds, focus }: { contactId: string; tagIds: string[]; focus?: TagT }) {
  const tags = useQuery(listTags).data ?? [];
  const [editing, setEditing] = useState<string | null>(focus?.id ?? null);
  const [name, setName] = useState(""), [color, setColor] = useState<TagColor>("champanhe"), [creating, setCreating] = useState(false);
  const toggle = (id: string) => attempt(setContactTags(contactId, tagIds.includes(id) ? tagIds.filter((t) => t !== id) : [...tagIds, id]));
  const cur = tags.find((t) => t.id === editing);
  return (
    <div className="flex flex-col">
      {cur && (
        <div className="flex flex-col gap-2 border-b p-3">
          <div className="flex items-center gap-2"><Tag {...cur} /><span className="t-meta text-tx2">cor da tag</span></div>
          <ColorPalette value={cur.color} onChange={(c) => attempt(updateTag(cur.id, { color: c }))} />
          <p className="t-meta text-tx2">A cor vale para todos os negócios com esta tag.</p>
        </div>
      )}
      <div className="max-h-52 overflow-y-auto p-1">
        {tags.map((t) => (
          <div key={t.id} className="flex items-center rounded-tag hover:bg-sel">
            <button type="button" aria-pressed={tagIds.includes(t.id)} onClick={() => toggle(t.id)} className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left"><Check size={14} strokeWidth={1.75} className={tagIds.includes(t.id) ? "" : "opacity-0"} aria-hidden /><Tag {...t} /></button>
            <button type="button" aria-label={`Mudar a cor de ${t.name}`} onClick={() => setEditing(editing === t.id ? null : t.id)} style={tagVar(t.color)} className="tag-dot mr-2 size-3.5 rounded-full" />
          </div>
        ))}
      </div>
      <div className="border-t p-3">
        {creating ? (
          <form className="flex flex-col gap-2.5" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await attempt(createTag(name, color).then((t) => setContactTags(contactId, [...tagIds, t.id]))); setName(""); setCreating(false); }}>
            <Input autoFocus aria-label="Nome da tag" placeholder="Nome da tag" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
            <ColorPalette value={color} onChange={setColor} />
            <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button><Button size="sm" variant="primary" type="submit" disabled={!name.trim()}>Criar tag</Button></div>
          </form>
        ) : <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 text-tx3 hover:text-tx"><Plus size={14} strokeWidth={1.5} aria-hidden />Criar tag nova</button>}
      </div>
    </div>
  );
}
/** Tags do contato; clicar abre a lista, a criação e as 8 cores. */
const CHIP = "inline-flex min-h-6 max-w-full items-center rounded-ctl border border-line bg-bg2 px-2 text-[12px] font-medium text-tx transition-colors hover:border-line2";
export function TagPicker({ contactId, tags, neutral }: { contactId: string; tags: TagT[]; neutral?: boolean }) {
  const tagIds = tags.map((t) => t.id);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => <Popover key={t.id} align="end" trigger={<button type="button" aria-label={`Tag ${t.name}: editar`} className={neutral ? CHIP : "max-w-full rounded-tag"}>{neutral ? <span className="truncate">{t.name}</span> : <Tag {...t} />}</button>}><Body contactId={contactId} tagIds={tagIds} focus={t} /></Popover>)}
      <Popover align="end" trigger={<button type="button" className={neutral ? "inline-flex min-h-6 items-center rounded-ctl px-1.5 text-[12px] text-tx2 transition-colors hover:bg-bg2 hover:text-tx" : "t-meta inline-flex items-center gap-1 rounded-tag border border-dashed border-line3 px-1.5 py-px text-tx2 hover:text-tx"}>{neutral ? "+ Adicionar" : <><Plus size={11} strokeWidth={1.75} aria-hidden />Tag</>}</button>}><Body contactId={contactId} tagIds={tagIds} /></Popover>
    </div>
  );
}
