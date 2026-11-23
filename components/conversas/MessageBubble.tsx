"use client";
import { useEffect, useState } from "react";
import { Check, CheckCheck, Download, FileText, ImageIcon, Lock, Pause, Play } from "lucide-react";
import type { Attachment, Message } from "@/lib/data/types";
import { time } from "@/lib/format";
import { toast } from "@/store/app";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
/** Player simulado: o mock não tem arquivo de áudio. */
function Audio({ seconds }: { seconds: number }) {
  const [on, setOn] = useState(false), [t, setT] = useState(0);
  useEffect(() => { if (!on) return; const i = setInterval(() => setT((x) => x + 0.25), 250); return () => clearInterval(i); }, [on]);
  useEffect(() => { if (t >= seconds) { setOn(false); setT(0); } }, [t, seconds]);
  return (
    <div className="flex w-60 items-center gap-3">
      <button type="button" aria-label={on ? "Pausar áudio" : "Ouvir áudio"} onClick={() => setOn(!on)} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-current">{on ? <Pause size={14} strokeWidth={1.5} /> : <Play size={14} strokeWidth={1.5} />}</button>
      <input type="range" aria-label="Posição do áudio" min={0} max={seconds} step={0.25} value={t} onChange={(e) => setT(Number(e.target.value))} className="h-1 min-w-0 flex-1 accent-[var(--gold)]" />
      <span className="t-meta tnum">{mmss(on || t ? t : seconds)}</span>
    </div>
  );
}
function File({ a }: { a: Attachment }) {
  if (a.type === "audio") return <Audio seconds={a.seconds ?? 10} />;
  const download = () => { if (!a.url) return toast("Arquivo de demonstração: o download real virá com o armazenamento."); const el = document.createElement("a"); el.href = a.url; el.download = a.name; el.click(); };
  if (a.type === "imagem") {
    // eslint-disable-next-line @next/next/no-img-element
    if (a.url) return <img src={a.url} alt={a.name} className="max-h-64 max-w-full rounded-ctl" />;
    return <div className="flex h-36 w-60 flex-col items-center justify-center gap-2 rounded-ctl border border-current/20"><ImageIcon size={20} strokeWidth={1.5} aria-hidden /><span className="t-meta">{a.name} · {a.size}</span></div>;
  }
  return (
    <div className="flex items-center gap-3 rounded-ctl border border-current/25 p-2.5">
      <FileText size={22} strokeWidth={1.25} aria-hidden /><div className="min-w-0 flex-1"><p className="truncate font-medium">{a.name}</p><p className="t-meta tnum opacity-80">{a.pages ? `${a.pages} páginas · ` : ""}{a.size}</p></div>
      <button type="button" aria-label={`Baixar ${a.name}`} onClick={download} className="inline-flex size-8 items-center justify-center rounded-ctl hover:bg-current/10"><Download size={16} strokeWidth={1.5} /></button>
    </div>
  );
}
export function MessageBubble({ m, author }: { m: Message; author?: string }) {
  const own = m.kind === "equipe";
  if (m.kind === "nota") return (
    <div className="ml-auto w-fit max-w-[85%] rounded-card border border-dashed border-gold bg-notebg px-3.5 py-2.5 md:max-w-[68%]">
      <p className="t-meta flex items-center gap-1.5 font-semibold text-notetx"><Lock size={12} strokeWidth={1.75} aria-hidden />Nota interna · {author ?? "Assistente"}</p><p className="mt-1 whitespace-pre-wrap">{m.text}</p><p className="t-meta tnum mt-1 text-right text-notetx">{time(m.at)}</p>
    </div>
  );
  return (
    <div className={`w-fit max-w-[85%] rounded-card px-3.5 py-2.5 md:max-w-[68%] ${own ? "ml-auto bg-inv text-oninv" : "bg-bg2"}`}>
      {m.attachment && <div className={m.text ? "mb-2" : ""}><File a={m.attachment} /></div>}
      {m.text && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.text}</p>}
      <p className={`t-meta tnum mt-1 flex items-center justify-end gap-1.5 ${own ? "opacity-85" : "text-tx2"}`}>
        {own && <span>{author ?? "Automação"} ·</span>}{time(m.at)}
        {own && (m.status === "enviada" ? <Check size={13} strokeWidth={1.75} aria-label="Enviada" /> : <CheckCheck size={14} strokeWidth={m.status === "lida" ? 2.25 : 1.5} className={m.status === "lida" ? "" : "opacity-60"} aria-label={m.status === "lida" ? "Lida" : "Entregue"} />)}
      </p>
    </div>
  );
}
