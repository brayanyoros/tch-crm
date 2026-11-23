"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info, Plus, Trash2, X } from "lucide-react";
import type { Flow, FlowNode, RuleItem } from "@/lib/data/types";
import { ORIGINS } from "@/lib/data/types";
import { CONDITION, defOf, KIND_LABEL, PRAZO, RULES, ruleOf, titleOf, TRIGGERS, type FieldDef, type FieldInput } from "@/lib/automation/catalog";
import { connectError, descendants, edgeFrom, nodeOf, OUT_LABEL, outsOf, uid, type Names } from "@/lib/automation/flow";
import { hoursText, isOpen } from "@/lib/automation/engine";
import { listProducts } from "@/lib/data/repositories";
import { useQuery } from "@/lib/useQuery";
import { now } from "@/lib/format";
import { IconButton, MoneyInput, type Option } from "@/components/ui";
import { iconOf } from "./StepPicker";

const plain = (l: readonly string[]): Option[] => l.map((x) => ({ value: x, label: x }));
export const BTN = "inline-flex h-10 items-center justify-center rounded-ctl border px-4 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const GOLD = `${BTN} border-gold bg-gold font-semibold text-[var(--ink)] hover:border-[var(--gold-lt)] hover:bg-[var(--gold-lt)]`;
export const GHOST = `${BTN} border-line bg-transparent text-tx hover:border-line2`;

export function PanelShell({ icon: Icon, kind, title, onClose, children, footer }: { icon: ReturnType<typeof iconOf>; kind: string; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { (ref.current?.querySelector<HTMLElement>("[data-panel-body] input, [data-panel-body] select, [data-panel-body] textarea") ?? ref.current)?.focus({ preventScroll: true }); }, []);
  return (
    <aside ref={ref} tabIndex={-1} aria-label={`${kind}: ${title}`} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }} className="slide-in absolute inset-y-0 right-0 z-20 flex w-full flex-col border-line bg-bg text-tx outline-none sm:w-[400px] sm:border-l lg:static lg:shrink-0">
      <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-card border border-line bg-bg2"><Icon size={16} strokeWidth={1.5} aria-hidden /></span>
        <div className="min-w-0 flex-1"><p className="text-[12px] leading-4 text-tx2">{kind}</p><h2 className="truncate text-[15px] font-semibold leading-5">{title}</h2></div>
        <IconButton icon={X} label="Fechar painel" className="-mr-2" onClick={onClose} />
      </header>
      <div data-panel-body className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">{children}</div>
      {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</footer>}
    </aside>
  );
}
export function Note({ children }: { children: ReactNode }) {
  return <p className="flex gap-2 text-[13px] leading-[19px] text-tx2"><Info size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden /><span>{children}</span></p>;
}
export function Labeled({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return <div><label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">{label}</label>{children(id)}{hint && <p className="mt-1.5 text-[12.5px] leading-[18px] text-tx2">{hint}</p>}</div>;
}
function Sel({ id, value, options, placeholder, onChange, label }: { id?: string; value: string; options: Option[]; placeholder?: string; onChange: (v: string) => void; label?: string }) {
  /* mantém visível um valor que não existe mais, para o erro fazer sentido */
  const all = value && !options.some((o) => o.value === value) ? [...options, { value, label: `${value} (não existe mais)` }] : options;
  return <select id={id} aria-label={label} className="field flow-input" value={value} onChange={(e) => onChange(e.target.value)}>{placeholder !== undefined && <option value="">{placeholder}</option>}{all.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}
function Control({ id, input, value, onChange, names, optional, placeholder, label }: { id?: string; input: FieldInput; value: string; onChange: (v: string) => void; names?: Names; optional?: boolean; placeholder?: string; label?: string }) {
  const categories = useQuery(listProducts).data?.map((p) => p.category) ?? [];
  const sel = (o: Option[], ph = optional ? "Qualquer" : "Escolher") => <Sel id={id} label={label} value={value} options={o} placeholder={ph} onChange={onChange} />;
  switch (input) {
    case "etapa": case "tag": case "produto": case "modelo": case "vendedor": return sel(plain(names?.[input] ?? []));
    case "vendedor_rodizio": return sel([{ value: "Rodízio", label: "Rodízio da equipe" }, ...plain(names?.vendedor ?? [])]);
    case "vendedor_lead": return sel([...plain(["Responsável pelo lead"]), ...plain(names?.vendedor ?? [])]);
    case "categoria": return sel(plain([...new Set(["Sauna", ...categories])]));
    case "origem": return sel(plain(ORIGINS)); case "canal": return sel(plain(["WhatsApp", "Instagram"])); case "horario": return sel(plain(["Fora do horário", "Dentro do horário"])); case "avisar": return sel(plain(["Responsável", "Gestor"]));
    case "unidade": return <Sel id={id} label={label} value={value || "horas"} options={plain(["horas", "dias"])} onChange={onChange} />;
    case "prazo": return sel([{ value: "abertura", label: "Na próxima abertura do showroom" }, { value: "horas", label: "Horas depois" }, { value: "dias", label: PRAZO.dias.replace(/^d/, "D") }]);
    case "valor": return <MoneyInput id={id} aria-label={label} value={Number(value)} onValue={(n) => onChange(n ? String(n) : "")} />;
    case "longo": return <textarea id={id} aria-label={label} className="field flow-input !min-h-40 !p-3 !leading-[21px]" maxLength={1000} value={value} placeholder="Texto enviado ao cliente" onChange={(e) => onChange(e.target.value)} />;
    case "numero": return <input id={id} aria-label={label} type="number" inputMode="numeric" min={1} max={999} className="field flow-input !w-28" value={value} onChange={(e) => onChange(e.target.value)} />;
    default: return <input id={id} aria-label={label} className="field flow-input" maxLength={80} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
}
function Hours() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <Note>Horário configurado: {hoursText()}. Fuso deste navegador: {tz}. Agora está {isOpen(now()) ? "dentro" : "fora"} do horário. Mude em Configurações › Horário e alertas.</Note>;
}
function Rules({ rules, names, onChange }: { rules: RuleItem[]; names?: Names; onChange: (r: RuleItem[]) => void }) {
  const set = (id: string, p: Partial<RuleItem>) => onChange(rules.map((r) => (r.id === id ? { ...r, ...p } : r)));
  return (
    <div className="flex flex-col gap-3">
      {rules.map((r, i) => (
        <fieldset key={r.id} className="rounded-card border border-line p-3">
          <legend className="px-1 text-[12px] text-tx2">{i ? "e também" : "Verificar se"}</legend>
          <div className="flex gap-2"><Sel label={`Verificação ${i + 1}`} value={r.type} options={RULES.map((x) => ({ value: x.type, label: x.label }))} onChange={(type) => set(r.id, { type, value: "" })} /><IconButton icon={Trash2} label={`Remover verificação ${i + 1}`} disabled={rules.length === 1} onClick={() => onChange(rules.filter((x) => x.id !== r.id))} /></div>
          <div className="mt-2"><Control input={ruleOf(r.type)?.input ?? "texto"} label={`Valor da verificação ${i + 1}`} value={r.value} names={names} onChange={(value) => set(r.id, { value })} /></div>
          {r.type === "horario" && <div className="mt-3"><Hours /></div>}
        </fieldset>
      ))}
      <button type="button" onClick={() => onChange([...rules, { id: uid("r"), type: "canal", value: "" }])} className="inline-flex h-9 items-center gap-1.5 self-start rounded-ctl text-[14px] text-tx2 hover:text-tx"><Plus size={16} strokeWidth={1.5} aria-hidden />Adicionar verificação</button>
    </div>
  );
}
export interface Applied { node: FlowNode; targets: Record<string, string> }
/** Edita uma cópia da etapa; só altera o fluxo em Aplicar. */
export function ConfigPanel({ flow, node, names, onApply, onCancel, onDirty }: { flow: Flow; node: FlowNode; names?: Names; onApply: (a: Applied) => void; onCancel: () => void; onDirty: (d: boolean) => void }) {
  const initialTargets = Object.fromEntries(outsOf(node).map((o) => { const t = edgeFrom(flow, node.id, o)?.target; return [o, t && nodeOf(flow, t)?.kind !== "fim" ? t : "fim"]; }));
  const [n, setN] = useState(node), [targets, setTargets] = useState<Record<string, string>>(initialTargets);
  const dirty = JSON.stringify([n, targets]) !== JSON.stringify([node, initialTargets]);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  const def = defOf(n), Icon = iconOf(n);
  const field = (d: FieldDef) => (d.show && !d.show(n.config) ? null : <Labeled key={d.key} label={d.optional ? `${d.label} (opcional)` : d.label} hint={d.hint}>{(id) => <Control id={id} input={d.input} value={n.config[d.key] ?? ""} names={names} optional={d.optional} placeholder={d.placeholder} onChange={(v) => setN({ ...n, config: { ...n.config, [d.key]: v } })} />}</Labeled>);
  const options = flow.nodes.filter((x) => x.kind !== "fim" && x.id !== n.id && !connectError(flow, n.id, x.id));
  const named = (x: FlowNode) => { const same = flow.nodes.filter((y) => titleOf(y) === titleOf(x)); return same.length > 1 ? `${titleOf(x)} (${same.indexOf(x) + 1})` : titleOf(x); };
  const apply = () => onApply({ node: n, targets });
  return (
    <PanelShell icon={Icon} kind={KIND_LABEL[n.kind]} title={n.kind === "condicao" ? CONDITION.label : def.label} onClose={onCancel} footer={<><button type="button" className={GHOST} onClick={onCancel}>Cancelar</button><button type="button" className={GOLD} disabled={!dirty} onClick={apply}>Aplicar</button></>}>
      {n.kind === "gatilho" && <Labeled label="Começa quando">{(id) => <Sel id={id} value={n.type} options={TRIGGERS.map((t) => ({ value: t.type, label: t.label }))} onChange={(type) => setN({ ...n, type, config: {} })} />}</Labeled>}
      {def.help && <Note>{def.help}</Note>}
      {def.note && <Note>{def.note}</Note>}
      {n.kind === "condicao" ? <Rules rules={n.rules ?? []} names={names} onChange={(rules) => setN({ ...n, rules })} /> : def.fields.map(field)}
      {n.type === "tarefa" && n.config.prazo === "abertura" && <Hours />}
      {n.kind !== "fim" && (
        <div className="flex flex-col gap-4 border-t border-line pt-5">
          {outsOf(n).map((o) => <Labeled key={o} label={o === "next" ? "Depois desta etapa" : `Caminho ${OUT_LABEL[o]}`} hint={targets[o] !== initialTargets[o] && initialTargets[o] !== "fim" && !Object.values(targets).some((t) => t === initialTargets[o] || (t !== "fim" && descendants(flow, t).has(initialTargets[o]))) ? "A sequência atual ficará desconectada até você ligá-la ou excluí-la." : undefined}>{(id) => <Sel id={id} value={targets[o]} options={[{ value: "fim", label: "Encerrar" }, ...options.map((x) => ({ value: x.id, label: named(x) }))]} onChange={(v) => setTargets({ ...targets, [o]: v })} />}</Labeled>)}
        </div>
      )}
    </PanelShell>
  );
}
