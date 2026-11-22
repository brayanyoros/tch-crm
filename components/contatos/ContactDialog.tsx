"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Contact } from "@/lib/data/types";
import { createContact, updateContact } from "@/lib/data/repositories";
import { attempt, useApp } from "@/store/app";
import { can } from "@/lib/permissions";
import { Button, Dialog, Field, Input } from "@/components/ui";

const schema = z.object({ name: z.string().trim().min(2, "Informe o nome."), phone: z.string(), instagram: z.string(), email: z.union([z.literal(""), z.email("E-mail inválido.")]), city: z.string().trim().min(2, "Informe a cidade.") })
  .refine((v) => v.phone.replace(/\D/g, "").length >= 10 || v.instagram.length > 1, { path: ["phone"], message: "Informe telefone com DDD ou Instagram." });
export function ContactDialog({ contact, onClose }: { contact?: Contact; onClose: () => void }) {
  const user = useApp((s) => s.user);
  const f = useForm({ resolver: zodResolver(schema), defaultValues: { name: contact?.name ?? "", phone: contact?.phone ?? "", instagram: contact?.instagram ?? "", email: contact?.email ?? "", city: contact?.city ?? "Teresópolis" } });
  const { errors, isSubmitting } = f.formState;
  const save = f.handleSubmit(async (v) => {
    const opt = { phone: v.phone || undefined, instagram: v.instagram || undefined, email: v.email || undefined };
    const job = contact ? updateContact(contact.id, { name: v.name, city: v.city, ...opt })
      : createContact({ name: v.name, city: v.city, email: opt.email, channel: opt.phone ? "whatsapp" : "instagram", handle: opt.phone ?? v.instagram, ownerId: can(user, "lead.transfer") ? null : user!.id }).then((c) => updateContact(c.id, opt));
    if (await attempt(job, contact ? "Contato atualizado" : "Contato criado")) onClose();
  });
  return (
    <Dialog open onClose={onClose} title={contact ? "Editar contato" : "Novo contato"} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={isSubmitting} onClick={save}>Salvar</Button></>}>
      <Field label="Nome" error={errors.name?.message}><Input autoFocus aria-invalid={!!errors.name} {...f.register("name")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Telefone" error={errors.phone?.message}><Input placeholder="(21) 90000-0000" {...f.register("phone")} /></Field>
        <Field label="Instagram"><Input placeholder="@perfil" {...f.register("instagram")} /></Field>
        <Field label="E-mail" error={errors.email?.message}><Input type="email" {...f.register("email")} /></Field>
        <Field label="Cidade" error={errors.city?.message}><Input {...f.register("city")} /></Field>
      </div>
    </Dialog>
  );
}
