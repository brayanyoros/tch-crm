"use client";
import { Sparkle } from "lucide-react";
import { useApp } from "@/store/app";

export function AiButton({ compact }: { compact: boolean }) {
  const { aiOpen, set } = useApp();
  return (
    <button type="button" aria-expanded={aiOpen} aria-label="Perguntar à IA" title={compact ? "Perguntar à IA (Ctrl J)" : undefined} onClick={() => set({ aiOpen: !aiOpen, mobileNav: false })} className={`ai-border flex h-10 items-center rounded-pill text-sidetx ${compact ? "w-10 justify-center" : "w-full gap-2.5 px-3.5"}`}>
      <Sparkle size={16} strokeWidth={1.5} className="text-gold" aria-hidden />
      {!compact && <><span className="flex-1 text-left font-medium">Perguntar à IA</span><span className="t-meta text-sidetx2">Ctrl J</span></>}
    </button>
  );
}
