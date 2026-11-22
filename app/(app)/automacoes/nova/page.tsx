"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Editor } from "@/components/automacoes/Editor";
import { BLANK, READY } from "@/components/automacoes/catalog";

export default function NovaAutomacaoPage() {
  const m = useSearchParams().get("modelo");
  return (
    <div>
      <div className="border-b px-4 py-3 md:px-6"><Link href="/automacoes" className="inline-flex items-center gap-1.5 text-tx2 hover:text-tx"><ArrowLeft size={14} strokeWidth={1.5} aria-hidden />Automações</Link></div>
      <Editor key={m} initial={(m !== null && READY[Number(m)]?.draft) || BLANK} />
    </div>
  );
}
