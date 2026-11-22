"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, type ComponentType } from "react";
import { can, type Action } from "@/lib/permissions";
import { useApp } from "@/store/app";
import { Canais, Custos, Distribuicao, Horario, Metas, Perfil, Usuarios } from "@/components/configuracoes/people";
import { Funil, Modelos, Produtos, Respostas, Tags } from "@/components/configuracoes/catalog";

const SECTIONS: { id: string; label: string; action?: Action; view: ComponentType }[] = [
  { id: "perfil", label: "Perfil", view: Perfil }, { id: "usuarios", label: "Usuários", action: "users", view: Usuarios }, { id: "canais", label: "Canais", action: "channels", view: Canais }, { id: "funil", label: "Funil", action: "stages", view: Funil },
  { id: "produtos", label: "Produtos", action: "products", view: Produtos }, { id: "tags", label: "Tags", action: "tag.create", view: Tags }, { id: "respostas", label: "Respostas rápidas", action: "quickReplies", view: Respostas }, { id: "modelos", label: "Modelos do WhatsApp", action: "templates", view: Modelos },
  { id: "distribuicao", label: "Distribuição", action: "distribution", view: Distribuicao }, { id: "horario", label: "Horário e alertas", action: "hours", view: Horario }, { id: "metas", label: "Metas", action: "goals", view: Metas }, { id: "custos", label: "Custos", action: "costs", view: Custos },
];
export default function ConfiguracoesPage() {
  const user = useApp((s) => s.user), router = useRouter(), { secao } = useParams<{ secao: string }>();
  const allowed = SECTIONS.filter((s) => !s.action || can(user, s.action)), cur = allowed.find((s) => s.id === secao);
  useEffect(() => { if (!cur) router.replace("/configuracoes/perfil"); }, [cur, router]);
  if (!cur) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <nav aria-label="Seções" className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 md:w-52 md:flex-col md:gap-0.5 md:border-b-0 md:border-r md:p-3">
        {allowed.map((s) => <Link key={s.id} href={`/configuracoes/${s.id}`} aria-current={s.id === cur.id ? "page" : undefined} className={`flex h-8 shrink-0 items-center whitespace-nowrap rounded-ctl px-3 ${s.id === cur.id ? "bg-sel font-semibold" : "text-tx2 hover:text-tx"}`}>{s.label}</Link>)}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8"><div className="max-w-4xl"><cur.view /></div></div>
    </div>
  );
}
