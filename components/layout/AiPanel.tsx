"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, CheckSquare, History, Paperclip, Plus, Sparkle, X } from "lucide-react";
import { attempt, toast, useApp } from "@/store/app";
import { ask, type AiContext } from "@/lib/ai/mockAssistant";
import { createTask, getContact, listConversations, listPipeline } from "@/lib/data/repositories";
import type { AiBlock, AiMessage, AiThread } from "@/lib/data/types";
import { newId, nowIso } from "@/lib/data/db";
import { useQuery } from "@/lib/useQuery";
import { dateTime, money, now, plural, time } from "@/lib/format";
import { can } from "@/lib/permissions";
import { Button, ChannelIcon, IconButton, Popover, Textarea } from "@/components/ui";
import { tomorrow9 } from "@/components/tarefas/TaskDialog";

const SUGGEST = { resumo: "Resuma esta conversa", resposta: "Sugira uma resposta para este cliente", parados: "Quais leads estão sem resposta há mais de 24h?", tarefa: "Crie uma tarefa de retorno para amanhã", funil: "Resuma o funil de vendas", vendas: "Quem mais vendeu neste mês?" };
const PERIOD = { "7": "Últimos 7 dias", "30": "Últimos 30 dias", mes: "Mês atual", custom: "Período personalizado" };

function useAiContext(): AiContext & { title: string; ideas: string[] } {
  const path = usePathname(), [, screen, id] = path.split("/");
  const { aiConversationId, insights, user } = useApp();
  const deals = useQuery(listPipeline, [user?.id]).data, convs = useQuery(listConversations, [user?.id]).data;
  const contact = useQuery(async () => (screen === "contatos" && id ? (await getContact(id)).contact : null), [screen, id]).data;
  const monthly = deals?.filter((d) => d.status === "aberto" || new Date(d.closedAt ?? 0) >= new Date(now().getFullYear(), now().getMonth(), 1)).length ?? 0;
  const v = screen === "conversas" ? convs?.find((x) => x.id === (id ?? aiConversationId)) : undefined;
  if (v) return { screen, chip: `Lead: ${v.contact.name}${v.deal ? ` · ${v.deal.title}` : ""}`, loading: `Lendo ${v.messages.length} mensagens da conversa`, conversationId: v.id, title: `Pergunte sobre ${v.contact.name}`, ideas: [SUGGEST.resumo, SUGGEST.resposta, SUGGEST.tarefa, SUGGEST.parados] };
  if (contact) return { screen, chip: `Contato: ${contact.name}`, loading: "Consultando o histórico do contato", contactId: contact.id, title: `Pergunte sobre ${contact.name}`, ideas: [SUGGEST.resumo, SUGGEST.resposta, SUGGEST.tarefa, SUGGEST.parados] };
  if (screen === "insights") return { screen, chip: PERIOD[insights.period], loading: "Consultando os números do período", title: "Pergunte sobre os números do período", ideas: [SUGGEST.vendas, SUGGEST.funil, SUGGEST.parados, SUGGEST.tarefa] };
  return { screen, chip: screen === "conversas" ? `Conversas · ${convs?.length ?? 0} leads` : `Funil · ${monthly} leads`, loading: `Consultando ${monthly} leads do funil`, title: screen === "conversas" ? "Escolha uma conversa ou pergunte sobre todas" : "Pergunte sobre os negócios do funil", ideas: [SUGGEST.parados, SUGGEST.funil, SUGGEST.resposta, SUGGEST.tarefa] };
}

function Suggested({ block, onSave }: { block: Extract<AiBlock, { type: "resposta" }>; onSave: (text: string) => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  const set = useApp((s) => s.set), router = useRouter();
  const use = () => {
    if (!block.conversationId) return;
    set({ composerDraft: { conversationId: block.conversationId, text: block.text }, ...(innerWidth < 768 ? { aiOpen: false } : {}) });
    router.push(`/conversas/${block.conversationId}`);
    toast("Texto colocado no compositor. Revise e envie.");
  };
  return (
    <div className="rounded-card border">
      <p className="t-label border-b px-3 py-2">Resposta sugerida</p>
      <div className="p-3">{edit === null ? <p className="whitespace-pre-wrap">{block.text}</p> : <Textarea autoFocus aria-label="Editar resposta" rows={5} value={edit} onChange={(e) => setEdit(e.target.value)} />}</div>
      <div className="flex gap-2 px-3 pb-3">
        {edit === null ? <><Button size="sm" variant="primary" onClick={use}>Usar na conversa</Button><Button size="sm" onClick={() => setEdit(block.text)}>Editar</Button></> : <><Button size="sm" variant="primary" disabled={!edit.trim()} onClick={() => { onSave(edit.trim()); setEdit(null); }}>Salvar</Button><Button size="sm" onClick={() => setEdit(null)}>Cancelar</Button></>}
      </div>
      <p className="t-meta border-t px-3 py-2 text-tx2">A IA pode errar. Revise antes de enviar.</p>
    </div>
  );
}
function Block({ block, onChange }: { block: AiBlock; onChange: (b: AiBlock) => void }) {
  const user = useApp((s) => s.user)!, router = useRouter();
  const [busy, setBusy] = useState(false);
  switch (block.type) {
    case "texto": return <p className="whitespace-pre-wrap">{block.text}</p>;
    case "topicos": return <ul className="flex flex-col gap-1">{block.items.map((i) => <li key={i} className="flex gap-2"><span aria-hidden className="mt-[9px] size-1 shrink-0 rounded-full bg-line3" /><span>{i}</span></li>)}</ul>;
    case "tabela": return <table className="tnum w-full text-[12.5px]"><thead><tr className="border-b">{block.head.map((h, i) => <th key={h} className={`t-label py-1.5 ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead><tbody>{block.rows.map((r) => <tr key={r[0]} className="border-b">{r.map((c, i) => <td key={i} className={`py-1.5 ${i ? "text-right" : ""}`}>{c}</td>)}</tr>)}</tbody></table>;
    case "tarefa": return <div className="flex items-center gap-2.5 rounded-card border p-3"><CheckSquare size={16} strokeWidth={1.5} className="text-tx2" aria-hidden /><span><span className="block font-medium">{block.title}</span><span className="t-meta text-tx2">Tarefa criada para {block.when}</span></span></div>;
    case "resposta": return <Suggested block={block} onSave={(text) => onChange({ ...block, text })} />;
    case "leads": return (
      <div className="rounded-card border">
        {block.items.map((l) => <button key={l.contactId} type="button" onClick={() => router.push(l.dealId ? `/funil?negocio=${l.dealId}` : `/contatos/${l.contactId}`)} className="flex w-full items-center gap-2.5 border-b px-3 py-2 text-left hover:bg-bg2"><ChannelIcon type={l.channel} /><span className="min-w-0 flex-1 truncate font-medium">{l.name}</span><span className="tnum t-meta text-alert">{l.wait}</span><span className="tnum w-[84px] text-right">{money(l.value)}</span></button>)}
        <div className="flex justify-between px-3 py-2"><span className="t-sec">Total</span><span className="tnum font-semibold">{money(block.items.reduce((a, l) => a + l.value, 0))}</span></div>
        <div className="border-t p-3">{block.done ? <p className="flex items-center gap-2"><CheckSquare size={15} strokeWidth={1.5} aria-hidden />{block.done}</p> : <Button size="sm" variant="primary" disabled={busy} onClick={async () => {
          setBusy(true);
          const ok = await attempt(Promise.all(block.items.map((l) => createTask({ title: `Retorno para ${l.name}`, type: "Retorno", dealId: l.dealId, contactId: l.contactId, dueAt: tomorrow9().toISOString(), ownerId: user.id }))));
          setBusy(false);
          if (ok) onChange({ ...block, done: `${plural(block.items.length, "tarefa criada", "tarefas criadas")} para amanhã, 09:00` });
        }}>Criar tarefas de retorno</Button>}</div>
      </div>
    );
  }
}

export function AiPanel() {
  const { set, aiThreads, aiThreadId, user } = useApp();
  const ctx = useAiContext();
  const thread = aiThreads.find((t) => t.id === aiThreadId);
  const [text, setText] = useState(""), [busyIn, setBusyIn] = useState<string | null>(null), [file, setFile] = useState("");
  const end = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null), picker = useRef<HTMLInputElement>(null);
  const count = thread?.messages.length ?? 0, busy = busyIn !== null && busyIn === aiThreadId;
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [count, busy]);

  const patch = (id: string, f: (m: AiMessage[]) => AiMessage[], title = "") => {
    const list = useApp.getState().aiThreads, cur = list.find((t) => t.id === id);
    const next: AiThread = { id, title: cur?.title || title, at: nowIso(), messages: f(cur?.messages ?? []) };
    set({ aiThreads: [next, ...list.filter((t) => t.id !== id)] });
  };
  const send = async (question: string, retryOf?: string) => {
    const t = question.trim();
    if (!t || busyIn) return;
    const id = thread?.id ?? newId("ia");
    if (!thread) set({ aiThreadId: id });
    patch(id, (m) => retryOf ? m.filter((x) => x.id !== retryOf) : [...m, { id: newId("im"), from: "user", at: nowIso(), text: file ? `${t}\n${file}` : t }], t.slice(0, 48));
    setText(""); setFile(""); setBusyIn(id);
    try {
      const blocks = await ask(t, ctx);
      if (blocks[0]?.type === "tarefa") {
        const v = (await listConversations()).find((x) => x.id === ctx.conversationId || x.contactId === ctx.contactId);
        await createTask({ title: blocks[0].title, type: "Retorno", dealId: v?.deal?.id, contactId: v?.contactId, dueAt: tomorrow9().toISOString(), ownerId: can(user, "lead.transfer") && v?.contact.ownerId ? v.contact.ownerId : user!.id });
      }
      patch(id, (m) => [...m, { id: newId("im"), from: "ai", at: nowIso(), blocks }]);
    } catch { patch(id, (m) => [...m, { id: newId("im"), from: "ai", at: nowIso(), error: true, question: t }]); }
    setBusyIn(null);
  };
  return (
    <section aria-label="Assistente TCH" className="slide-in no-print fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-bg md:w-[420px]" onKeyDown={(e) => e.key === "Escape" && set({ aiOpen: false })}>
      <div className="ai-line shrink-0" />
      <header className="flex h-14 shrink-0 items-center gap-1 border-b pl-5 pr-3">
        <Sparkle size={16} strokeWidth={1.5} className="mr-1.5 text-gold" aria-hidden /><h2 className="t-block flex-1">Assistente TCH</h2>
        <Popover align="end" trigger={<IconButton icon={History} label="Histórico" />}>
          {(close) => <div className="p-1">{aiThreads.length === 0 && <p className="t-sec p-4">Suas conversas com o assistente aparecem aqui.</p>}{aiThreads.map((t) => <button key={t.id} type="button" onClick={() => { set({ aiThreadId: t.id }); close(); }} className={`block w-full rounded-tag px-3 py-2 text-left hover:bg-sel ${t.id === aiThreadId ? "bg-sel" : ""}`}><span className="block truncate">{t.title}</span><span className="t-meta text-tx2">{dateTime(t.at)}</span></button>)}</div>}
        </Popover>
        <IconButton icon={Plus} label="Nova conversa" onClick={() => { set({ aiThreadId: null }); input.current?.focus(); }} />
        <IconButton icon={X} label="Fechar assistente" onClick={() => set({ aiOpen: false })} />
      </header>
      <div className="flex shrink-0 items-center gap-2.5 border-b px-5 py-2.5"><span className="t-label">Contexto</span><span className="t-meta truncate rounded-tag border px-2 py-0.5 text-tx3">{ctx.chip}</span></div>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5" aria-live="polite">
        {!thread && (
          <div className="mt-auto">
            <h3 className="t-page mb-3">{ctx.title}</h3>
            <div className="border-t">{ctx.ideas.map((s) => <button key={s} type="button" onClick={() => void send(s)} className="group flex w-full items-center gap-3 border-b py-3 text-left"><span className="flex-1">{s}</span><ArrowRight size={15} strokeWidth={1.5} className="text-tx2 transition-transform group-hover:translate-x-0.5" aria-hidden /></button>)}</div>
          </div>
        )}
        {thread?.messages.map((m) => m.from === "user" ? <p key={m.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-card bg-inv px-3.5 py-2.5 text-oninv">{m.text}</p> : (
          <div key={m.id} className="flex flex-col gap-3 border-l border-gold pl-3.5">
            <p className="t-meta tnum text-tx2">Assistente · {time(m.at)}</p>
            {m.error ? <><p>Sem conexão com o assistente. Sua pergunta ficou guardada.</p><Button size="sm" className="self-start" onClick={() => void send(m.question ?? "", m.id)}>Tentar de novo</Button></>
              : m.blocks?.map((b, i) => <Block key={i} block={b} onChange={(nb) => patch(thread.id, (ms) => ms.map((x) => x.id === m.id ? { ...x, blocks: x.blocks?.map((y, k) => k === i ? nb : y) } : x))} />)}
          </div>
        ))}
        {busy && <div role="status" className="flex items-center gap-3"><span className="flex gap-1" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className="ai-dot" style={{ animationDelay: `${i * 0.18}s` }} />)}</span><span className="t-sec">{ctx.loading}</span></div>}
        <div ref={end} />
      </div>
      <form className="shrink-0 border-t px-5 pb-4 pt-3" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        {file && <p className="t-meta mb-2 flex items-center gap-1.5 text-tx2"><Paperclip size={12} aria-hidden />{file}<button type="button" aria-label="Remover anexo" onClick={() => setFile("")}><X size={12} /></button></p>}
        <div className="field flex items-end gap-1 p-1" style={{ height: "auto" }}>
          <IconButton icon={Paperclip} label="Anexar arquivo" onClick={() => picker.current?.click()} />
          <input ref={picker} type="file" className="hidden" onChange={(e) => { setFile(e.target.files?.[0]?.name ?? ""); e.target.value = ""; }} />
          <textarea ref={input} rows={1} value={text} aria-label="Pergunta" placeholder="Pergunte sobre leads, conversas ou vendas" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text); } }} className="max-h-32 min-h-8 flex-1 resize-none bg-transparent py-1.5 outline-none [field-sizing:content]" />
          <button type="submit" aria-label="Enviar pergunta" disabled={!text.trim() || !!busyIn} className="inline-flex size-8 shrink-0 items-center justify-center rounded-ctl bg-inv text-oninv hover:bg-invh disabled:bg-sel disabled:text-tx2"><ArrowUp size={16} strokeWidth={1.75} /></button>
        </div>
        {thread && <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1">{ctx.ideas.slice(0, 3).map((s) => <button key={s} type="button" onClick={() => void send(s)} className="t-meta shrink-0 rounded-full border px-2.5 py-1 text-tx3 hover:border-line2">{s}</button>)}</div>}
      </form>
    </section>
  );
}
