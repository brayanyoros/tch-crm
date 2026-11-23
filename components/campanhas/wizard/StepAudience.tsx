"use client";
import { useMemo, useState } from "react";
import { Plus, Search, Trash2, Users } from "lucide-react";
import type { AudField, Audience, AudOp, AudRule } from "@/lib/data/types";
import { ORIGINS } from "@/lib/data/types";
import { describe, FIELD_LABEL, maskPhone, REASONS, type AudienceResult } from "@/lib/campaign/audience";
import { listCities, listProducts, listSellers, listStages, listTags, saveAudience, type SavedOption } from "@/lib/data/repositories";
import { useQuery } from "@/lib/useQuery";
import { attempt } from "@/store/app";
import { int, norm, plural } from "@/lib/format";
import { Button, Dialog, Dropdown, IconButton, Segmented, Skeleton, type Option } from "@/components/ui";
import { FIELD, GHOST, H, Labeled, LINK, MultiSelect, Note } from "./shared";

const uid = () => Math.random().toString(36).slice(2, 10);
const FIELDS: AudField[] = ["etapa", "tag", "produto", "cidade", "responsavel", "interacao", "origem", "lista"];
export function useOptions() {
  const stages = useQuery(listStages).data, tags = useQuery(listTags).data, products = useQuery(listProducts).data, sellers = useQuery(listSellers).data, cities = useQuery(listCities).data;
  return useMemo(() => {
    const o: Record<AudField, Option[]> = {
      etapa: (stages ?? []).map((s) => ({ value: s.id, label: s.name })), tag: (tags ?? []).map((t) => ({ value: t.id, label: t.name })), produto: (products ?? []).map((p) => ({ value: p.id, label: p.name })),
      cidade: (cities ?? []).map((c) => ({ value: c, label: c })), responsavel: [...(sellers ?? []).map((u) => ({ value: u.id, label: u.name })), { value: "sem", label: "Sem responsável" }], origem: ORIGINS.map((x) => ({ value: x, label: x })), interacao: [], lista: [],
    };
    return { o, label: (f: AudField, v: string) => o[f].find((x) => x.value === v)?.label ?? v };
  }, [stages, tags, products, sellers, cities]);
}
function RuleRow({ r, i, onChange, onRemove, options, lists }: { r: AudRule; i: number; onChange: (r: AudRule) => void; onRemove: () => void; options: Option[]; lists: Option[] }) {
  const name = FIELD_LABEL[r.field];
  return (
    <li className="grid gap-2 rounded-card border border-line bg-surface p-3 sm:grid-cols-[150px_170px_minmax(0,1fr)_auto] sm:items-center">
      <span className="text-[14px] font-medium">{i > 0 ? "" : ""}{name}</span>
      {r.field === "interacao" ? <>
        <select aria-label={`${name}: condição`} className={FIELD} value={r.op} onChange={(e) => onChange({ ...r, op: e.target.value as AudOp })}>
          <option value="ultimos">nos últimos</option><option value="mais_de">há mais de</option><option value="entre">entre as datas</option><option value="nunca">nunca houve</option>
        </select>
        {r.op === "entre" ? <span className="flex items-center gap-2"><input type="date" aria-label="De" className={FIELD} value={r.from ?? ""} max={r.to} onChange={(e) => onChange({ ...r, from: e.target.value })} /><span className="text-tx2">e</span><input type="date" aria-label="Até" className={FIELD} value={r.to ?? ""} min={r.from} onChange={(e) => onChange({ ...r, to: e.target.value })} /></span>
          : r.op === "nunca" ? <span className="text-[13px] text-tx2">Sem mensagens trocadas na conversa</span>
          : <span className="flex items-center gap-2"><input type="number" min={1} max={999} inputMode="numeric" aria-label="Dias" className={`${FIELD} !w-24`} value={r.n ?? ""} onChange={(e) => onChange({ ...r, n: e.target.value ? Math.max(1, Number(e.target.value)) : undefined })} /><span className="text-[14px] text-tx2">dias</span></span>}
      </> : <>
        <select aria-label={`${name}: condição`} className={FIELD} value={r.op} onChange={(e) => onChange({ ...r, op: e.target.value as AudOp })}><option value="inclui">é qualquer um de</option><option value="exclui">não é nenhum de</option></select>
        <MultiSelect label={name} options={r.field === "lista" ? lists : options} value={r.values} onChange={(values) => onChange({ ...r, values })} />
      </>}
      <IconButton icon={Trash2} label={`Remover filtro ${name}`} onClick={onRemove} />
    </li>
  );
}
export function RecipientsDialog({ result, audience, onExclude, onClose }: { result: AudienceResult; audience: Audience; onExclude?: (ids: string[]) => void; onClose: () => void }) {
  const [q, setQ] = useState(""), [show, setShow] = useState<"todos" | "elegiveis" | "excluidos">("todos"), [page, setPage] = useState(0);
  const rows = result.rows.filter((r) => (show === "todos" || (show === "elegiveis") === r.eligible) && norm(`${r.name} ${r.city} ${r.phone ?? ""}`).includes(norm(q)));
  const P = 25, pages = Math.max(1, Math.ceil(rows.length / P)), cur = rows.slice(page * P, page * P + P);
  return (
    <Dialog open onClose={onClose} title="Destinatários" description={`${int(result.found)} encontrados · ${int(result.eligible)} elegíveis · ${int(result.excluded)} fora`} width={760}>
      <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-48 flex-1"><Search size={15} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx2" aria-hidden /><input aria-label="Buscar destinatário" placeholder="Nome, cidade ou final do telefone" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className={`${FIELD} !pl-9`} /></div><Segmented label="Mostrar" value={show} onChange={(v) => { setShow(v); setPage(0); }} options={[{ value: "todos", label: "Todos" }, { value: "elegiveis", label: "Elegíveis" }, { value: "excluidos", label: "Fora" }]} /></div>
      <div className="-mx-5 overflow-x-auto"><table className="w-full text-[13px]"><caption className="sr-only">Destinatários</caption>
        <thead><tr className="border-y bg-surface2 text-left"><th scope="col" className="px-5 py-2 font-medium text-tx2">Nome</th><th scope="col" className="px-3 py-2 font-medium text-tx2">Telefone</th><th scope="col" className="px-3 py-2 font-medium text-tx2">Cidade</th><th scope="col" className="px-3 py-2 font-medium text-tx2">Situação</th>{onExclude && <th className="w-24" />}</tr></thead>
        <tbody>{cur.map((r) => { const removed = audience.excludeContacts.includes(r.contactId); return (
          <tr key={r.contactId} className="border-b"><td className="px-5 py-2.5 font-medium">{r.name}</td><td className="tnum whitespace-nowrap px-3 py-2.5 text-tx2">{r.phone ? maskPhone(r.phone) : "—"}</td><td className="px-3 py-2.5 text-tx2">{r.city}</td><td className="px-3 py-2.5">{r.eligible ? <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-1.5 rounded-full bg-positive" />Elegível</span> : <span className="text-tx2">{r.reason}</span>}</td>
            {onExclude && <td className="px-3 text-right">{(r.eligible || removed) && <button type="button" className={LINK} onClick={() => onExclude(removed ? audience.excludeContacts.filter((x) => x !== r.contactId) : [...audience.excludeContacts, r.contactId])}>{removed ? "Incluir" : "Remover"}</button>}</td>}
          </tr>); })}
          {!cur.length && <tr><td colSpan={5} className="px-5 py-8 text-center text-tx2">Nenhum contato aqui.</td></tr>}
        </tbody></table></div>
      <div className="flex items-center justify-between text-[13px] text-tx2"><span className="tnum">{rows.length ? `${page * P + 1}–${Math.min(rows.length, page * P + P)} de ${int(rows.length)}` : ""}</span><span className="flex gap-2"><Button size="sm" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</Button><Button size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Próxima</Button></span></div>
    </Dialog>
  );
}
export function AudienceSummary({ result, loading, onOpen }: { result?: AudienceResult; loading: boolean; onOpen: () => void }) {
  if (!result) return <div role="status" aria-label="Calculando público" className="flex flex-col gap-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-9 w-20" /><Skeleton className="h-3 w-40" /></div>;
  const reasons = REASONS.filter((r) => result.reasons[r]);
  return (
    <div aria-live="polite" aria-busy={loading} className={loading ? "opacity-60" : ""}>
      <p className="text-[13px] text-tx2">Contatos elegíveis</p>
      <p className="tnum text-[30px] font-semibold leading-9 tracking-[-0.02em]">{int(result.eligible)}</p>
      <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-[14px]">
        <div className="flex justify-between"><dt className="text-tx2">Encontrados</dt><dd className="tnum">{int(result.found)}</dd></div>
        <div className="flex justify-between"><dt className="text-tx2">Fora da campanha</dt><dd className="tnum">{int(result.excluded)}</dd></div>
        {reasons.map((r) => <div key={r} className="flex justify-between pl-3 text-[13px]"><dt className="text-tx2">{r}</dt><dd className="tnum">{int(result.reasons[r]!)}</dd></div>)}
      </dl>
      <p className="mt-3 text-[12.5px] leading-[18px] text-tx2">Cada contato conta uma vez, pelo primeiro motivo desta lista, mesmo com vários negócios. Elegível não garante entrega.</p>
      <button type="button" onClick={onOpen} disabled={!result.found} className={`${GHOST} mt-4 w-full`}><Users size={16} strokeWidth={1.5} aria-hidden />Ver destinatários</button>
    </div>
  );
}
export function StepAudience({ audience, onChange, saved, result, onOpen }: { audience: Audience; onChange: (a: Audience) => void; saved?: SavedOption[]; result?: AudienceResult; onOpen: () => void }) {
  const { o, label } = useOptions();
  const [mode, setMode] = useState<"salvo" | "criar">(audience.savedId || (!audience.rules.length && saved?.length) ? "salvo" : "criar"), [q, setQ] = useState(""), [saving, setSaving] = useState(false), [name, setName] = useState("");
  const lists = (saved ?? []).filter((s) => s.kind === "lista").map((s) => ({ value: s.name, label: s.name }));
  const current = saved?.find((s) => s.id === audience.savedId);
  const setRule = (r: AudRule) => onChange({ ...audience, savedId: undefined, rules: audience.rules.map((x) => (x.id === r.id ? r : x)) });
  const add = (field: AudField) => onChange({ ...audience, savedId: undefined, rules: [...audience.rules, { id: uid(), field, op: field === "interacao" ? "mais_de" : "inclui", values: [], ...(field === "interacao" ? { n: 15 } : {}) }] });
  const dyn = (saved ?? []).filter((s) => s.kind === "dinamico");
  return (
    <div className="flex flex-col gap-8">
      <Segmented label="Origem do público" value={mode} onChange={setMode} options={[{ value: "salvo", label: "Usar público salvo" }, { value: "criar", label: "Criar público" }]} />
      {mode === "salvo" ? (
        <section>
          <H title="Públicos salvos" text="Públicos são critérios: a contagem é refeita a cada uso. Listas fixas são montadas em Contatos." />
          <div className="relative mb-3"><Search size={15} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx2" aria-hidden /><input aria-label="Buscar público" placeholder="Buscar pelo nome" value={q} onChange={(e) => setQ(e.target.value)} className={`${FIELD} !pl-9`} /></div>
          {!saved ? <Skeleton className="h-40" /> : (
            <ul role="radiogroup" aria-label="Públicos salvos" className="flex flex-col gap-2">
              {saved.filter((s) => norm(s.name).includes(norm(q))).map((s) => { const on = audience.savedId === s.id; return (
                <li key={s.id}><button type="button" role="radio" aria-checked={on} onClick={() => onChange({ ...structuredClone(s.audience), savedId: s.id })} className={`flex w-full items-start gap-3 rounded-card border bg-surface p-3.5 text-left transition-colors ${on ? "border-gold" : "border-line hover:border-line2"}`}>
                  <span className={`mt-1 size-4 shrink-0 rounded-full border ${on ? "border-[5px] border-gold" : "border-line3"}`} aria-hidden />
                  <span className="min-w-0 flex-1"><span className="flex flex-wrap items-baseline gap-x-2"><span className="text-[14px] font-semibold">{s.name}</span><span className="text-[12px] text-tx2">{s.kind === "lista" ? "Lista fixa" : "Critérios dinâmicos"}</span></span><span className="block text-[13px] leading-[19px] text-tx2">{describe(s.audience, label).join(" · ")}</span></span>
                  <span className="tnum shrink-0 text-right text-[14px] font-semibold">{int(s.eligible)}<span className="block text-[12px] font-normal text-tx2">elegíveis</span></span>
                </button></li>); })}
              {!saved.length && <li className="text-[14px] text-tx2">Nenhum público salvo ainda.</li>}
            </ul>
          )}
          {current && <button type="button" className={`${LINK} mt-4`} onClick={() => { onChange({ ...audience, savedId: undefined }); setMode("criar"); }}>Editar critérios só para esta campanha</button>}
        </section>
      ) : (
        <section>
          <H title="Quem recebe" text={audience.rules.length > 1 ? undefined : "Sem filtros, todos os contatos entram e as regras de autorização decidem quem é elegível."} aside={audience.rules.length > 1 && <Segmented label="Combinar condições" value={audience.match} onChange={(match) => onChange({ ...audience, match })} options={[{ value: "todas", label: "Atender todas" }, { value: "qualquer", label: "Atender qualquer uma" }]} />} />
          <ul className="flex flex-col gap-2">{audience.rules.map((r, i) => <RuleRow key={r.id} r={r} i={i} options={o[r.field]} lists={lists} onChange={setRule} onRemove={() => onChange({ ...audience, savedId: undefined, rules: audience.rules.filter((x) => x.id !== r.id) })} />)}</ul>
          <div className="mt-3"><Dropdown align="start" items={FIELDS.filter((f) => f !== "lista" || lists.length).map((f) => ({ label: FIELD_LABEL[f], run: () => add(f) }))} trigger={<button type="button" className={GHOST}><Plus size={16} strokeWidth={1.5} aria-hidden />Adicionar filtro</button>} /></div>
        </section>
      )}
      <section>
        <H title="Deixar de fora" text="Contatos com estas tags ou destes públicos não recebem, mesmo atendendo aos filtros." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled label="Tags excluídas">{() => <MultiSelect label="Tags excluídas" options={o.tag} value={audience.excludeTags} onChange={(excludeTags) => onChange({ ...audience, excludeTags })} placeholder="Nenhuma" />}</Labeled>
          <Labeled label="Públicos excluídos">{() => <MultiSelect label="Públicos excluídos" options={dyn.filter((s) => s.id !== audience.savedId).map((s) => ({ value: s.id, label: s.name }))} value={audience.excludeAudiences} onChange={(excludeAudiences) => onChange({ ...audience, excludeAudiences })} placeholder="Nenhum" />}</Labeled>
        </div>
        {audience.excludeContacts.length > 0 && <p className="mt-3 text-[13px] text-tx2">{plural(audience.excludeContacts.length, "contato removido", "contatos removidos")} à mão. <button type="button" className={LINK} onClick={onOpen}>Revisar na lista</button></p>}
      </section>
      {mode === "criar" && result && !result.problems.length && <div className="border-t border-line pt-5"><button type="button" className={LINK} onClick={() => setSaving(true)}>Salvar este público para reutilizar</button></div>}
      {result?.problems[0] && <Note tone="alert">{result.problems[0]}</Note>}
      <Dialog open={saving} onClose={() => setSaving(false)} title="Salvar público" description="Salva os critérios, não a lista de pessoas: a contagem é refeita a cada uso." width={440} footer={<><Button onClick={() => setSaving(false)}>Cancelar</Button><Button variant="primary" disabled={name.trim().length < 3} onClick={async () => { let id = ""; if (await attempt(saveAudience(name, audience).then((s) => { id = s.id; }), "Público salvo")) { onChange({ ...audience, savedId: id }); setSaving(false); setName(""); } }}>Salvar público</Button></>}>
        <Labeled label="Nome do público" hint="Ex.: Interessados em saunas">{(id) => <input id={id} autoFocus className={FIELD} maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />}</Labeled>
        {audience.excludeContacts.length > 0 && <Note>Os contatos removidos à mão valem só para esta campanha e não entram no público salvo.</Note>}
      </Dialog>
    </div>
  );
}
