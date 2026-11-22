"use client";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { DealView } from "@/lib/data/types";
import { createDeal, getSettings, listContacts, listProducts, listSellers, listStages, listTags, loseDeal, moveDeal } from "@/lib/data/repositories";
import { useQuery } from "@/lib/useQuery";
import { attempt, useApp } from "@/store/app";
import { norm } from "@/lib/format";
import { can } from "@/lib/permissions";
import { Button, Dialog, Field, Input, MoneyInput, Radio, SearchInput, Segmented, Select, opts } from "@/components/ui";

export function WonDialog({ d, stageId, onClose }: { d: DealView; stageId: string; onClose: () => void }) {
  const [v, setV] = useState(d.value);
  return (
    <Dialog open onClose={onClose} title={`Fechar negócio com ${d.contact.name}`} description={d.title} width={400} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={v <= 0} onClick={async () => { if (await attempt(moveDeal(d.id, stageId, v), "Negócio fechado")) onClose(); }}>Confirmar fechamento</Button></>}>
      <Field label="Valor final" hint="É o valor que entra nas metas e nos Insights."><MoneyInput autoFocus value={v} onValue={setV} /></Field>
    </Dialog>
  );
}
export function LostDialog({ d, onClose }: { d: DealView; onClose: () => void }) {
  const reasons = useQuery(getSettings).data?.lossReasons ?? [];
  const [r, setR] = useState("");
  return (
    <Dialog open onClose={onClose} title={`Marcar ${d.contact.name} como perdido`} description={d.title} width={400} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="danger" disabled={!r} onClick={async () => { if (await attempt(loseDeal(d.id, r), "Negócio marcado como perdido")) onClose(); }}>Marcar como perdido</Button></>}>
      <div role="radiogroup" aria-label="Motivo" className="flex flex-col gap-2">{reasons.map((x) => <Radio key={x} name="motivo" checked={r === x} onChange={() => setR(x)}>{x}</Radio>)}</div>
    </Dialog>
  );
}

const schema = z.object({
  mode: z.enum(["existente", "novo"]), contactId: z.string(), name: z.string(), channel: z.enum(["whatsapp", "instagram"]), handle: z.string(), city: z.string(),
  productId: z.string().min(1, "Escolha o produto."), value: z.number().positive("Informe o valor."), ownerId: z.string(), stageId: z.string().min(1), tagId: z.string(),
}).superRefine((v, c) => {
  if (v.mode === "existente" && !v.contactId) c.addIssue({ code: "custom", path: ["contactId"], message: "Escolha um contato." });
  if (v.mode === "novo" && v.name.trim().length < 2) c.addIssue({ code: "custom", path: ["name"], message: "Informe o nome." });
  if (v.mode === "novo" && (v.channel === "whatsapp" ? v.handle.replace(/\D/g, "").length < 10 : v.handle.trim().length < 2)) c.addIssue({ code: "custom", path: ["handle"], message: v.channel === "whatsapp" ? "Telefone com DDD." : "Informe o @." });
});
type Form = z.infer<typeof schema>;
export function NewDealDialog({ onClose, contactId = "", onCreated }: { onClose: () => void; contactId?: string; onCreated?: (id: string) => void }) {
  const user = useApp((s) => s.user)!;
  const contacts = useQuery(listContacts).data, products = useQuery(listProducts).data, stages = useQuery(listStages).data, tags = useQuery(listTags).data, sellers = useQuery(listSellers).data;
  const [q, setQ] = useState("");
  const f = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { mode: "existente", contactId, name: "", channel: "whatsapp", handle: "", city: "Teresópolis", productId: "", value: 0, ownerId: user.role === "vendedor" ? user.id : "ana", stageId: "novo", tagId: "" } });
  const { errors, isSubmitting } = f.formState;
  const mode = f.watch("mode"), chosen = contacts?.find((c) => c.id === f.watch("contactId")), channel = f.watch("channel");
  const hits = useMemo(() => (q ? contacts?.filter((c) => norm(c.name + (c.phone ?? "")).includes(norm(q))).slice(0, 5) : []) ?? [], [q, contacts]);
  const save = f.handleSubmit(async (v) => {
    let id = "";
    const ok = await attempt(createDeal({ ...(v.mode === "existente" ? { contactId: v.contactId } : { newContact: { name: v.name, channel: v.channel, handle: v.handle, city: v.city } }), productId: v.productId, value: v.value, ownerId: v.ownerId, stageId: v.stageId, tagId: v.tagId || undefined }).then((x) => { id = x; }), "Negócio criado");
    if (ok) { onCreated?.(id); onClose(); }
  });
  return (
    <Dialog open onClose={onClose} title="Novo negócio" width={540} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={isSubmitting} onClick={save}>Criar negócio</Button></>}>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between"><span className="t-label">Contato</span><Segmented label="Tipo de contato" value={mode} onChange={(m) => f.setValue("mode", m)} options={[{ value: "existente", label: "Buscar" }, { value: "novo", label: "Novo" }]} /></div>
        {mode === "existente" ? (
          chosen ? <div className="field flex items-center gap-2"><span className="flex-1 font-medium">{chosen.name}</span><span className="t-sec">{chosen.phone ?? chosen.instagram}</span><button type="button" className="underline underline-offset-4" onClick={() => f.setValue("contactId", "")}>Trocar</button></div>
            : <div><SearchInput autoFocus placeholder="Nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} />{hits.length > 0 && <ul className="mt-1 rounded-card border">{hits.map((c) => <li key={c.id} className="border-b last:border-0"><button type="button" className="flex w-full justify-between px-3 py-2 text-left hover:bg-bg2" onClick={() => { f.setValue("contactId", c.id, { shouldValidate: f.formState.isSubmitted }); setQ(""); }}><span>{c.name}</span><span className="t-sec">{c.phone ?? c.instagram}</span></button></li>)}</ul>}{q && contacts && !hits.length && <p className="t-sec mt-2">Nenhum contato com “{q}”. Use a opção Novo.</p>}{errors.contactId && <p role="alert" className="t-meta mt-1.5 text-alert">{errors.contactId.message}</p>}</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" error={errors.name?.message}><Input {...f.register("name")} /></Field>
            <Field label="Cidade"><Input {...f.register("city")} /></Field>
            <Field label="Canal"><Select options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "instagram", label: "Instagram" }]} {...f.register("channel")} /></Field>
            <Field label={channel === "whatsapp" ? "Telefone" : "Perfil"} error={errors.handle?.message}><Input placeholder={channel === "whatsapp" ? "(21) 90000-0000" : "@perfil"} {...f.register("handle")} /></Field>
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Produto" error={errors.productId?.message}><Controller control={f.control} name="productId" render={({ field }) => <Select placeholder="Escolher" options={opts(products)} value={field.value} onChange={(e) => { field.onChange(e); const p = products?.find((x) => x.id === e.target.value); if (p) f.setValue("value", p.price, { shouldValidate: f.formState.isSubmitted }); }} />} /></Field>
        <Field label="Valor" error={errors.value?.message}><Controller control={f.control} name="value" render={({ field }) => <MoneyInput value={field.value} onValue={field.onChange} />} /></Field>
        {can(user, "lead.transfer") && <Field label="Responsável"><Controller control={f.control} name="ownerId" render={({ field }) => <Select options={opts(sellers)} {...field} />} /></Field>}
        <Field label="Etapa"><Controller control={f.control} name="stageId" render={({ field }) => <Select options={opts(stages)} {...field} />} /></Field>
        <Field label="Tag"><Controller control={f.control} name="tagId" render={({ field }) => <Select placeholder="Sem tag" options={opts(tags)} {...field} />} /></Field>
      </div>
    </Dialog>
  );
}
