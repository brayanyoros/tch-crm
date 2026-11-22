"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, FileText, Lock, Paperclip, X } from "lucide-react";
import type { Attachment, ConversationView } from "@/lib/data/types";
import { claimContact, listQuickReplies, listTemplates, sendMessage } from "@/lib/data/repositories";
import { useQuery } from "@/lib/useQuery";
import { attempt, toast, useApp } from "@/store/app";
import { duration, norm, now } from "@/lib/format";
import { can } from "@/lib/permissions";
import { Button, IconButton, Segmented, Select } from "@/components/ui";

const drafts = new Map<string, string>(); // rascunho por conversa enquanto a aba está aberta

export function WindowBar({ endsAt }: { endsAt?: string }) {
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(i); }, []);
  const left = endsAt ? new Date(endsAt).getTime() - now().getTime() : 0;
  return left > 0
    ? <p className="flex items-center gap-2 border-t px-4 py-2 md:px-6"><Clock size={14} strokeWidth={1.5} className="text-gold" aria-hidden /><span className="t-sec"><b className="font-semibold text-tx">Janela de 24h</b> · Responde livre por mais <span className="tnum">{duration(left)}</span></span></p>
    : <p className="flex items-center gap-2 border-t px-4 py-2 text-alert md:px-6"><Clock size={14} strokeWidth={1.5} aria-hidden /><span className="text-[12.5px]"><b className="font-semibold">Janela de 24h</b> · encerrada. Só modelos aprovados podem ser enviados.</span></p>;
}
function TemplatePicker({ v }: { v: ConversationView }) {
  const list = useQuery(listTemplates).data?.filter((t) => t.status === "Aprovado") ?? [];
  const [id, setId] = useState(""), [busy, setBusy] = useState(false);
  const t = list.find((x) => x.id === id);
  const text = t?.body.replace("{{nome}}", v.contact.name.split(" ")[0]).replace("{{produto}}", (v.deal?.title ?? "nossa linha outdoor").toLowerCase());
  return (
    <div className="flex flex-col gap-2.5">
      <Select aria-label="Modelo aprovado" placeholder="Escolher modelo aprovado" options={list.map((x) => ({ value: x.id, label: `${x.name} · ${x.category}` }))} value={id} onChange={(e) => setId(e.target.value)} />
      {text && <p className="rounded-card bg-bg2 px-3.5 py-2.5">{text}</p>}
      <div className="flex items-center justify-end"><Button variant="primary" disabled={!text || busy} onClick={async () => { setBusy(true); if (await attempt(sendMessage(v.id, { kind: "equipe", text: text!, templateId: id }), "Modelo enviado")) setId(""); setBusy(false); }}>Enviar modelo</Button></div>
    </div>
  );
}
export function Composer({ v }: { v: ConversationView }) {
  const { user, composerDraft, set } = useApp();
  const mayReply = can(user, "lead.reply", { ownerId: v.contact.ownerId });
  const [mode, setMode] = useState<"equipe" | "nota">(mayReply ? "equipe" : "nota");
  const [text, setTextState] = useState(drafts.get(v.id) ?? ""), [file, setFile] = useState<Attachment | null>(null), [hi, setHi] = useState(0), [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null), picker = useRef<HTMLInputElement>(null);
  const setText = (t: string) => { drafts.set(v.id, t); setTextState(t); };
  const quick = useQuery(listQuickReplies).data;
  const slash = mode === "equipe" && /^\/\S*$/.test(text) ? norm(text) : null;
  const hits = useMemo(() => (slash === null ? [] : quick?.filter((q) => (q.who === "todos" || user?.role !== "vendedor") && norm(q.shortcut).startsWith(slash)) ?? []), [slash, quick, user]);
  useEffect(() => setHi(0), [slash]);
  useEffect(() => {
    if (composerDraft?.conversationId !== v.id) return;
    setMode("equipe"); drafts.set(v.id, composerDraft.text); setTextState(composerDraft.text); set({ composerDraft: null }); box.current?.focus();
  }, [composerDraft, v.id, set]);
  const expired = !v.windowEndsAt || new Date(v.windowEndsAt) <= now();
  const send = async () => {
    const t = text.trim();
    if ((!t && !file) || busy) return;
    setBusy(true);
    if (await attempt(sendMessage(v.id, { kind: mode, text: t, attachment: mode === "equipe" ? file ?? undefined : undefined }))) { setText(""); setFile(null); }
    setBusy(false);
    box.current?.focus();
  };
  const pick = (f?: File) => {
    if (!f) return;
    if (f.size > 16 * 1024 * 1024) return toast("O arquivo passa de 16 MB.", { alert: true });
    setFile({ type: f.type.startsWith("image/") ? "imagem" : f.type.startsWith("audio/") ? "audio" : "pdf", name: f.name, size: f.size > 1048576 ? `${(f.size / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.ceil(f.size / 1024)} KB`, url: URL.createObjectURL(f) });
  };
  if (!mayReply && !v.contact.ownerId) return <div className="flex flex-wrap items-center gap-3 border-t px-4 py-4 md:px-6"><p className="t-sec flex-1">Este lead ainda não tem responsável.</p><Button variant="primary" onClick={() => void attempt(claimContact(v.contactId), "Conversa assumida")}>Assumir conversa</Button></div>;
  return (
    <div>
      <WindowBar endsAt={v.windowEndsAt} />
      <div className={`relative border-t px-4 pb-4 pt-2.5 md:px-6 ${mode === "nota" ? "bg-notebg" : ""}`}>
        {hits.length > 0 && (
          <ul role="listbox" aria-label="Respostas rápidas" className="absolute inset-x-4 bottom-full z-20 mb-1 max-h-64 overflow-y-auto rounded-card border bg-bg p-1 shadow-pop md:inset-x-6">
            {hits.map((q, i) => <li key={q.id} role="option" aria-selected={i === hi} onMouseMove={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); setText(q.text); }} className={`flex cursor-pointer gap-3 rounded-tag px-3 py-2 ${i === hi ? "bg-sel" : ""}`}><span className="w-24 shrink-0 font-semibold">{q.shortcut}</span><span className="t-sec truncate">{q.text}</span></li>)}
          </ul>
        )}
        <div className="mb-2 flex items-center">
          <Segmented label="Tipo de mensagem" value={mode} onChange={setMode} options={[...(mayReply ? [{ value: "equipe" as const, label: "Mensagem" }] : []), { value: "nota" as const, label: <><Lock size={12} strokeWidth={1.5} />Nota interna</> }]} />
          {mode === "equipe" && !expired && <span className="t-meta ml-auto hidden text-tx2 sm:inline">Digite / para respostas rápidas</span>}
        </div>
        {mode === "equipe" && expired ? <TemplatePicker v={v} /> : (
          <>
            {file && mode === "equipe" && <p className="t-meta mb-2 inline-flex items-center gap-1.5 rounded-tag border px-2 py-1"><FileText size={13} strokeWidth={1.5} aria-hidden />{file.name} · {file.size}<button type="button" aria-label="Remover anexo" onClick={() => setFile(null)}><X size={12} /></button></p>}
            <div className="field flex items-end gap-1 p-1" style={{ height: "auto" }}>
              {mode === "equipe" && <IconButton icon={Paperclip} label="Anexar arquivo" onClick={() => picker.current?.click()} />}
              <input ref={picker} type="file" accept="image/*,audio/*,application/pdf" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
              <textarea ref={box} rows={1} aria-label={mode === "nota" ? "Nota interna" : "Mensagem"} placeholder={mode === "nota" ? "Só a equipe vê esta nota" : `Responder ${v.contact.name.split(" ")[0]}`} value={text} onChange={(e) => setText(e.target.value)} className="max-h-40 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 outline-none [field-sizing:content]"
                onKeyDown={(e) => {
                  if (hits.length) {
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setHi((hi + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length); return; }
                    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); setText(hits[hi].text); return; }
                    if (e.key === "Escape") { setText(""); return; }
                  }
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
                }} />
              <Button variant="primary" size="md" className="!h-8" disabled={(!text.trim() && !file) || busy} onClick={() => void send()}>{mode === "nota" ? "Salvar nota" : "Enviar"}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
