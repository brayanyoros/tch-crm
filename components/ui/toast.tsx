"use client";
import { X } from "lucide-react";
import { useApp } from "@/store/app";

export function Toaster() {
  const { toasts, dismiss } = useApp();
  return (
    <div aria-live="polite" className="no-print pointer-events-none fixed bottom-4 left-1/2 z-[90] flex w-[min(440px,calc(100vw-24px))] -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} role={t.alert ? "alert" : "status"} className="rise pointer-events-auto flex items-center gap-3 rounded-card bg-inv px-4 py-2.5 text-oninv shadow-pop">
          {t.alert && <span className="size-1.5 shrink-0 rounded-full bg-alert" />}
          <span className="flex-1">{t.text}</span>
          {t.action && <button type="button" className="font-semibold underline underline-offset-4" onClick={() => { t.action?.run(); dismiss(t.id); }}>{t.action.label}</button>}
          <button type="button" aria-label="Dispensar aviso" onClick={() => dismiss(t.id)}><X size={14} strokeWidth={1.5} /></button>
        </div>
      ))}
    </div>
  );
}
