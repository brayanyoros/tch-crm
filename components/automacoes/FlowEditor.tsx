"use client";
import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { applyNodeChanges, Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow, type Connection, type NodeChange } from "@xyflow/react";
import { AlertTriangle, ArrowLeft, History, LayoutGrid, Maximize, Minus, MoreHorizontal, Pause, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { Automation, Flow, FlowNode, NodeKind, Out } from "@/lib/data/types";
import { deleteAutomation, discardDraft, listRefs, publishAutomation, saveDraft, setAutomationActive } from "@/lib/data/repositories";
import { waitingCount, type SimResult } from "@/lib/automation/engine";
import { titleOf } from "@/lib/automation/catalog";
import { connect, connectError, edgeFrom, insert, layout, newNode, NODE_W, nodeOf, outsOf, remove, removalImpact, validate, type Keep } from "@/lib/automation/flow";
import { useQuery } from "@/lib/useQuery";
import { attempt, toast, useApp } from "@/store/app";
import { dateTime, dayDiff, fmt, plural, time } from "@/lib/format";
import { Button, Confirm, Dialog, Dot, Drawer, Dropdown, EmptyState, IconButton, Popover, Radio, type MenuItem } from "@/components/ui";
import { ConfigPanel, GHOST, GOLD, type Applied } from "./ConfigPanel";
import { TestPanel } from "./TestPanel";
import { EditorCtx, End, Path, Step, type PathEdge, type StepNode } from "./nodes";

const nodeTypes = { etapa: Step, fim: End }, edgeTypes = { caminho: Path };
const ARIA = { "node.a11yDescription.default": "Enter configura o bloco. Setas movem. Delete exclui.", "node.a11yDescription.keyboardDisabled": "Enter configura o bloco.", "edge.a11yDescription.default": "Conexão entre blocos." };
/** Trabalho não salvo de quem saiu por navegação interna; sobrevive até recarregar. */
const recover = new Map<string, { name: string; flow: Flow }>();
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function Editor({ automation, initial }: { automation?: Automation; initial: { name: string; flow: Flow } }) {
  const router = useRouter(), rf = useReactFlow(), key = automation?.id ?? "nova";
  const back = useRef(recover.get(key));
  const [name, setName] = useState(back.current?.name ?? initial.name), [flow, setFlow] = useState(back.current?.flow ?? initial.flow);
  const [saved, setSaved] = useState(automation ? JSON.stringify([initial.name, initial.flow]) : ""), [savedAt, setSavedAt] = useState(automation?.savedAt), [busy, setBusy] = useState<"" | "salvar" | "publicar">(""), [failed, setFailed] = useState(false);
  const [sel, setSel] = useState<string | null>(null), [testing, setTesting] = useState(false), [result, setResult] = useState<SimResult | null>(null);
  const [panelDirty, setPanelDirty] = useState(false), [pending, setPending] = useState<(() => void) | null>(null);
  const [del, setDel] = useState<string | null>(null), [keep, setKeep] = useState<Keep>("sim"), [dlg, setDlg] = useState<"" | "historico" | "excluir" | "descartar">(""), [leave, setLeave] = useState<string | null>(null);
  const names = useQuery(listRefs).data;
  const dirty = JSON.stringify([name, flow]) !== saved;
  const issues = useMemo(() => validate(flow, names), [flow, names]);
  const status = automation?.status ?? "rascunho", unpublished = !!automation?.published && JSON.stringify(automation.published) !== JSON.stringify(flow);
  const id = automation?.id;

  /* ---------- escuro só enquanto o editor está aberto ---------- */
  useLayoutEffect(() => { document.documentElement.classList.add("dark"); return () => { document.documentElement.classList.toggle("dark", useApp.getState().dark); }; }, []);
  /* ---------- proteção ao sair ---------- */
  const work = useRef({ dirty, name, flow }); work.current = { dirty, name, flow };
  const skip = useRef(false);
  useEffect(() => {
    if (back.current) toast("Alterações não salvas recuperadas");
    recover.delete(key);
    const unload = (e: BeforeUnloadEvent) => { if (work.current.dirty) e.preventDefault(); };
    const click = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.("a[href]");
      if (!a || !work.current.dirty || e.ctrlKey || e.metaKey || a.getAttribute("target") === "_blank") return;
      const href = a.getAttribute("href")!;
      if (!href.startsWith("/") || href === location.pathname) return;
      e.preventDefault(); e.stopPropagation(); setLeave(href);
    };
    addEventListener("beforeunload", unload); document.addEventListener("click", click, true);
    return () => { removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); if (work.current.dirty && !skip.current) recover.set(key, { name: work.current.name, flow: work.current.flow }); };
  }, [key]);
  /** Ação que fecharia o painel: pergunta antes se há edição não aplicada. */
  const guard = useCallback((f: () => void) => { if (panelDirty) setPending(() => f); else f(); }, [panelDirty]);
  const change = useCallback((f: (x: Flow) => Flow) => { setFlow(f); setResult(null); }, []);

  /* ---------- enquadramento ---------- */
  const center = useCallback((nodeId: string) => setTimeout(() => { const n = rf.getInternalNode(nodeId); if (n) void rf.setCenter(n.position.x + (n.measured.width ?? NODE_W) / 2, n.position.y + (n.measured.height ?? 120) / 2, { zoom: Math.max(0.95, rf.getZoom()), duration: reduced() ? 0 : 220 }); }, 60), [rf]);
  const fit = useCallback(() => setTimeout(() => void rf.fitView({ padding: 0.18, maxZoom: 1, minZoom: 0.35, duration: reduced() ? 0 : 220 }), 60), [rf]);
  const open = useCallback((nodeId: string) => guard(() => { setTesting(false); setResult(null); setSel(nodeId); center(nodeId); }), [guard, center]);
  const closePanel = useCallback(() => guard(() => { setSel(null); setTesting(false); setResult(null); }), [guard]);

  /* ---------- operações ---------- */
  const add = useCallback((source: string, out: Out, kind: NodeKind, type: string) => guard(() => { const n = newNode(kind, type); change((f) => insert(f, source, out, n)); setTesting(false); setSel(n.id); center(n.id); }), [guard, change, center]);
  const askDelete = useCallback((nodeId: string) => { const n = nodeOf(work.current.flow, nodeId); if (!n || n.kind === "gatilho" || n.kind === "fim") return; setKeep("sim"); setDel(nodeId); }, []);
  const doDelete = () => { if (!del) return; change((f) => remove(f, del, keep)); if (sel === del || (sel && del && removalImpact(flow, del, keep).some((n) => n.id === sel))) setSel(null); setDel(null); };
  const apply = ({ node, targets }: Applied) => {
    change((f) => {
      let x: Flow = { ...f, nodes: f.nodes.map((n) => (n.id === node.id ? { ...node, x: n.x, y: n.y } : n)) };
      for (const o of outsOf(node)) { const cur = edgeFrom(x, node.id, o)?.target, t = targets[o], isEnd = cur && nodeOf(x, cur)?.kind === "fim"; if (t === "fim" ? !isEnd : t !== cur) x = connect(x, node.id, o, t as string | "fim"); }
      return x;
    });
    setPanelDirty(false); setSel(null);
  };
  const onConnect = (c: Connection) => { const e = connectError(flow, c.source, c.target); if (e) toast(e, { alert: true }); else change((f) => connect(f, c.source, (c.sourceHandle ?? "next") as Out, c.target)); };
  const save = async (): Promise<string | null> => {
    if (panelDirty) { toast("Aplique ou cancele a etapa aberta antes de salvar.", { alert: true }); return null; }
    const snap = JSON.stringify([name, flow]);
    setBusy("salvar"); setFailed(false);
    let res: { id: string; savedAt: string } | undefined;
    const ok = await attempt(saveDraft(id, name, flow).then((r) => { res = r; }));
    setBusy(""); setFailed(!ok);
    if (!ok || !res) return null;
    setSaved(snap); setSavedAt(res.savedAt);
    if (!id) { skip.current = true; router.replace(`/automacoes/${res.id}`); }
    return res.id;
  };
  const publish = async () => {
    if (panelDirty) return void toast("Aplique ou cancele a etapa aberta antes de publicar.", { alert: true });
    const bad = validate(flow, names);
    if (!name.trim()) return void toast("Dê um nome à automação.", { alert: true });
    if (bad.length) { toast(`${plural(bad.length, "ponto a revisar", "pontos a revisar")} antes de publicar`, { alert: true }); if (bad[0].nodeId) open(bad[0].nodeId); return; }
    const saveId = await save();
    if (!saveId) return;
    setBusy("publicar");
    await attempt(publishAutomation(saveId), "Publicada. O fluxo está em execução.");
    setBusy("");
  };
  const exit = () => { if (dirty) setLeave("/automacoes"); else router.push("/automacoes"); };

  /* ---------- nós e conexões do canvas ---------- */
  const marks = useMemo(() => new Map(result?.steps.map((s, i) => [s.nodeId, { order: i + 1, ok: s.ok, text: s.text, out: s.out }]) ?? []), [result]);
  const testedPath = marks.size > 0;
  const build = useCallback((prev: StepNode[]): StepNode[] => flow.nodes.map((n) => {
    const old = prev.find((p) => p.id === n.id);
    return { ...(old ?? {}), id: n.id, type: n.kind === "fim" ? "fim" : "etapa", position: { x: n.x, y: n.y }, selected: sel === n.id, selectable: n.kind !== "fim", ariaLabel: n.kind === "fim" ? "Encerrar" : titleOf(n), data: { node: n, issues: issues.filter((i) => i.nodeId === n.id), mark: marks.get(n.id), dim: testedPath && !marks.has(n.id), active: sel === n.id, open: outsOf(n).filter((o) => !edgeFrom(flow, n.id, o)) } };
  }), [flow, sel, issues, marks, testedPath]);
  const [rfNodes, setRfNodes] = useState<StepNode[]>(() => build([]));
  useEffect(() => setRfNodes((p) => build(p)), [build]);
  const edges = useMemo<PathEdge[]>(() => flow.edges.map((e) => { const src = nodeOf(flow, e.source), m = marks.get(e.source), hot = !!m && marks.has(e.target) && m.out === e.out; return { id: e.id, source: e.source, target: e.target, sourceHandle: e.out, type: "caminho", focusable: false, selectable: false, data: { out: e.out, hot, dim: testedPath && !hot, source: e.source, from: src ? titleOf(src) : "etapa" } }; }), [flow, marks, testedPath]);
  const onNodesChange = useCallback((cs: NodeChange<StepNode>[]) => {
    const pick = cs.find((c) => c.type === "select" && c.selected);
    if (pick && "id" in pick && pick.id !== sel) { const n = nodeOf(work.current.flow, pick.id); if (n && n.kind !== "fim") open(pick.id); }
    setRfNodes((ns) => applyNodeChanges(cs.filter((c) => c.type !== "select" && c.type !== "remove"), ns));
    const moved = new Map(cs.flatMap((c) => (c.type === "position" && c.dragging === false && c.position ? [[c.id, c.position] as const] : [])));
    if (moved.size) setFlow((f) => { const real = f.nodes.some((n) => { const p = moved.get(n.id); return p && (Math.round(p.x) !== n.x || Math.round(p.y) !== n.y); }); return real ? { ...f, manual: true, nodes: f.nodes.map((n) => { const p = moved.get(n.id); return p ? { ...n, x: Math.round(p.x), y: Math.round(p.y) } : n; }) } : f; });
  }, [sel, open]);
  useEffect(() => { if (testing && result) fit(); }, [testing, result, fit]);

  const ctx = useMemo(() => ({ open, add, askDelete }), [open, add, askDelete]);
  const selected: FlowNode | undefined = sel ? nodeOf(flow, sel) : undefined, target = del ? nodeOf(flow, del) : undefined;
  const waiting = id ? waitingCount(id) : 0;
  const menu: MenuItem[] = [
    ...(automation?.published ? [status === "ativa" ? { label: "Pausar", icon: Pause, run: () => void attempt(setAutomationActive(id!, false), "Automação pausada") } : { label: "Ativar versão publicada", icon: Play, run: () => void attempt(setAutomationActive(id!, true), "Automação ativada") }] : []),
    ...(automation ? [{ label: "Histórico", icon: History, run: () => setDlg("historico") }] : []),
    ...(unpublished ? [{ label: "Voltar à versão publicada", icon: RotateCcw, run: () => setDlg("descartar") }] : []),
    ...(automation ? [{ label: "Excluir automação", icon: Trash2, alert: true, run: () => setDlg("excluir") }] : []),
  ];
  const state = busy === "salvar" ? "Salvando…" : busy === "publicar" ? "Publicando…" : failed ? "Falha ao salvar" : dirty ? "Alterações não salvas" : savedAt ? (dayDiff(savedAt) === 0 ? `Salvo às ${time(savedAt)}` : `Salvo em ${fmt(savedAt, "dd/MM")}`) : "";
  const impact = del ? (["sim", "nao", "nenhum"] as Keep[]).map((k) => removalImpact(flow, del, k)) : [];

  return (
    <EditorCtx.Provider value={ctx}>
      <div className="flow-editor flex min-h-0 flex-1 flex-col bg-side text-tx">
        <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-bg px-3 py-2 sm:px-4">
          <IconButton icon={ArrowLeft} label="Voltar para Automações" onClick={exit} />
          <input aria-label="Nome da automação" value={name} maxLength={60} placeholder="Nome da automação" onChange={(e) => setName(e.target.value)} className="h-9 min-w-0 flex-1 rounded-ctl border border-transparent bg-transparent px-2 text-[15px] font-semibold outline-none transition-colors hover:border-line focus:border-gold sm:max-w-80 sm:flex-none sm:[field-sizing:content]" />
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-tx2"><Dot tone={status === "ativa" ? "positive" : status === "pausada" ? "warning" : "line3"} />{status === "ativa" ? "Ativa" : status === "pausada" ? "Pausada" : "Rascunho"}{unpublished && <span className="hidden lg:inline"> · edição não publicada</span>}</span>
          <div className="ml-auto flex items-center gap-2 max-sm:w-full">
            <span role="status" title={state} className={`mr-1 min-w-0 truncate text-[13px] max-sm:flex-1 ${failed ? "text-alert" : "text-tx2"}`}>{state === "Alterações não salvas" ? <><span className="sm:hidden">Não salvo</span><span className="max-sm:hidden">{state}</span></> : state}</span>
            <button type="button" className={`${GHOST} !h-9 max-sm:!px-3`} onClick={() => guard(() => { setSel(null); setResult(null); setTesting(true); fit(); })}>Testar</button>
            <button type="button" className={`${GHOST} !h-9 max-sm:!px-3`} disabled={!!busy || !dirty} onClick={() => void save()}>Salvar</button>
            <button type="button" className={`${GOLD} !h-9 max-sm:!px-3`} disabled={!!busy || (status === "ativa" && !dirty && !unpublished)} onClick={() => void publish()}>Publicar</button>
            {menu.length > 0 && <Dropdown items={menu} trigger={<IconButton icon={MoreHorizontal} label="Mais opções" />} />}
          </div>
        </header>
        <div className="relative flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1" aria-label="Fluxo da automação" role="region" onKeyDown={(e) => { const el = e.target as HTMLElement; if ((e.key === "Delete" || e.key === "Backspace") && el.classList.contains("react-flow__node")) { e.preventDefault(); askDelete(el.dataset.id ?? ""); } if (e.key === "Enter" && el.classList.contains("react-flow__node")) { const n = nodeOf(flow, el.dataset.id ?? ""); if (n && n.kind !== "fim") open(n.id); } }}>
            <ReactFlow nodes={rfNodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onConnect={onConnect} isValidConnection={(c) => !connectError(flow, c.source, c.target)} onPaneClick={closePanel} fitView fitViewOptions={{ padding: 0.18, maxZoom: 1, minZoom: 0.35 }} minZoom={0.25} maxZoom={1.6} deleteKeyCode={null} selectionKeyCode={null} multiSelectionKeyCode={null} zoomOnDoubleClick={false} nodeDragThreshold={4} ariaLabelConfig={ARIA} onlyRenderVisibleElements={false}>
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#2a2a2a" />
            </ReactFlow>
            <div className="absolute bottom-4 left-4 z-10 flex flex-col overflow-hidden rounded-card border border-line bg-bg">
              <IconButton icon={Plus} label="Aproximar" className="!rounded-none" onClick={() => void rf.zoomIn()} /><IconButton icon={Minus} label="Afastar" className="!rounded-none border-t border-line" onClick={() => void rf.zoomOut()} />
              <IconButton icon={Maximize} label="Enquadrar o fluxo" className="!rounded-none border-t border-line" onClick={() => void fit()} /><IconButton icon={LayoutGrid} label="Organizar blocos" className="!rounded-none border-t border-line" onClick={() => { setFlow((f) => layout(f)); fit(); }} />
            </div>
            {issues.length > 0 && (
              <div className="absolute left-4 top-4 z-10"><Popover width={320} trigger={<button type="button" className="inline-flex h-9 items-center gap-2 rounded-card border border-line bg-bg px-3 text-[13px] hover:border-line2"><AlertTriangle size={15} strokeWidth={1.5} className="text-alert" aria-hidden />{plural(issues.length, "ponto a revisar", "pontos a revisar")}</button>}>
                {(close) => <ul className="p-1">{issues.map((i, k) => { const n = nodeOf(flow, i.nodeId); return <li key={k}><button type="button" disabled={!n} onClick={() => { close(); open(i.nodeId); }} className="w-full rounded-ctl px-3 py-2 text-left hover:bg-sel"><span className="block text-[13px] font-medium">{n ? titleOf(n) : "Fluxo"}</span><span className="text-[12.5px] text-alert">{i.text}</span></button></li>; })}</ul>}
              </Popover></div>
            )}
          </div>
          {testing ? <TestPanel name={name} flow={flow} result={result} onResult={setResult} onGo={center} onClose={closePanel} /> : selected && <ConfigPanel key={selected.id} flow={flow} node={selected} names={names} onApply={apply} onCancel={() => { setPanelDirty(false); setSel(null); }} onDirty={setPanelDirty} />}
        </div>
      </div>

      <Dialog open={!!target} onClose={() => setDel(null)} title={`Excluir “${target ? titleOf(target) : ""}”`} width={460} footer={<><Button onClick={() => setDel(null)}>Cancelar</Button><Button variant="danger" onClick={doDelete}>Excluir</Button></>}>
        {target?.kind === "condicao" ? (
          <div role="radiogroup" aria-label="O que fazer com os caminhos" className="flex flex-col gap-2">
            <p className="t-body text-tx3">Esta condição divide o fluxo. Escolha o que continua no lugar dela.</p>
            {(["sim", "nao", "nenhum"] as Keep[]).map((k, i) => <Radio key={k} name="manter" checked={keep === k} onChange={() => setKeep(k)}><span className="block font-medium">{k === "nenhum" ? "Excluir os dois caminhos" : `Manter o caminho ${k === "sim" ? "Sim" : "Não"}`}</span><span className="t-sec">{impact[i]?.length ? `Também exclui ${plural(impact[i].length, "bloco")}: ${impact[i].map(titleOf).join(", ")}.` : "Nenhum outro bloco é excluído."}</span></Radio>)}
          </div>
        ) : <p className="t-body text-tx3">A etapa anterior passa a seguir direto para a próxima.</p>}
      </Dialog>
      <Confirm open={!!pending} onClose={() => setPending(null)} title="Etapa com alterações" text="As alterações desta etapa ainda não foram aplicadas." action="Descartar alterações" onConfirm={() => { const f = pending; setPanelDirty(false); setSel(null); f?.(); }} />
      <Dialog open={!!leave} onClose={() => setLeave(null)} title="Sair sem salvar?" description="Há alterações que ainda não foram salvas." width={420} footer={<><Button onClick={() => setLeave(null)}>Continuar editando</Button><Button variant="danger" onClick={() => { skip.current = true; router.push(leave!); }}>Sair sem salvar</Button></>}><p className="t-body text-tx3">A versão em execução não muda. Para guardar o que você fez, volte e use Salvar.</p></Dialog>
      <Confirm open={dlg === "descartar"} onClose={() => setDlg("")} title="Voltar à versão publicada" text="O rascunho atual será substituído pelo fluxo em execução." action="Descartar rascunho" onConfirm={() => { const p = automation!.published!; void attempt(discardDraft(id!), "Rascunho descartado").then((ok) => { if (ok) { setFlow(p); setSel(null); setSaved(JSON.stringify([name, p])); fit(); } }); }} />
      <Confirm open={dlg === "excluir"} onClose={() => setDlg("")} title="Excluir automação" text={`“${name}”, o rascunho e o histórico serão apagados.${status === "ativa" ? " Ela está ativa e deixa de executar." : ""}`} action="Excluir" onConfirm={() => { skip.current = true; void attempt(deleteAutomation(id!), "Automação excluída").then((ok) => ok && router.push("/automacoes")); }} />
      <Drawer open={dlg === "historico"} onClose={() => setDlg("")} title="Histórico de execuções">
        {waiting > 0 && <p className="t-sec border-b px-5 py-2.5">{plural(waiting, "lead em espera", "leads em espera")}</p>}
        {automation?.runs.length ? <ul>{[...automation.runs].sort((a, b) => b.at.localeCompare(a.at)).map((r) => <li key={r.id} className="border-b px-5 py-3"><p className="flex justify-between gap-3"><span className="font-medium">{r.contactName}</span><span className="t-meta tnum text-tx2">{dateTime(r.at)}{r.version ? ` · v${r.version}` : ""}</span></p><p className="t-sec">{r.actions.join(", ") || "Nenhuma ação no caminho percorrido"}</p>{r.failure && <p className="text-[12.5px] text-alert">Falhou: {r.failure}</p>}</li>)}</ul> : <EmptyState title="Ainda não rodou" text="Cada execução aparece aqui com o lead e as ações." />}
      </Drawer>
    </EditorCtx.Provider>
  );
}
export function FlowEditor(p: { automation?: Automation; initial: { name: string; flow: Flow } }) {
  return <ReactFlowProvider><Editor {...p} /></ReactFlowProvider>;
}
