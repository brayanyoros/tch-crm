"use client";
import { useState } from "react";
import { Upload } from "lucide-react";
import { importContacts } from "@/lib/data/repositories";
import { attempt, toast } from "@/store/app";
import { norm, parseCsv, plural } from "@/lib/format";
import { Button, Dialog, Field, Select } from "@/components/ui";

const FIELDS = [{ key: "name", label: "Nome", hints: ["nome", "name", "cliente"] }, { key: "handle", label: "Telefone ou @", hints: ["telefone", "celular", "whatsapp", "phone", "instagram", "@"] }, { key: "city", label: "Cidade", hints: ["cidade", "city", "municipio"] }, { key: "email", label: "E-mail", hints: ["email", "e-mail"] }] as const;
type Key = (typeof FIELDS)[number]["key"];
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<string[][] | null>(null), [map, setMap] = useState<Record<Key, string>>({ name: "", handle: "", city: "", email: "" }), [busy, setBusy] = useState(false);
  const read = async (f?: File) => {
    if (!f) return;
    const r = parseCsv(await f.text());
    if (r.length < 2) return toast("O arquivo não tem linhas de dados.", { alert: true });
    const pick = (hints: readonly string[]) => { const i = r[0].findIndex((h) => hints.some((x) => norm(h).includes(x))); return i < 0 ? "" : String(i); };
    setMap({ name: pick(FIELDS[0].hints), handle: pick(FIELDS[1].hints), city: pick(FIELDS[2].hints), email: pick(FIELDS[3].hints) });
    setRows(r);
  };
  const cell = (r: string[], k: Key) => (map[k] === "" ? "" : (r[Number(map[k])] ?? "").trim().replace(/^'/, ""));
  const valid = rows?.slice(1).filter((r) => cell(r, "name") && cell(r, "handle")) ?? [];
  const save = async () => {
    setBusy(true);
    let res = { added: 0, skipped: 0 };
    if (await attempt(importContacts(valid.map((r) => ({ name: cell(r, "name"), handle: cell(r, "handle"), city: cell(r, "city") || "Não informada", email: cell(r, "email"), channel: cell(r, "handle").startsWith("@") ? ("instagram" as const) : ("whatsapp" as const) }))).then((x) => { res = x; }))) {
      toast(`${plural(res.added, "contato importado", "contatos importados")}${res.skipped ? `, ${res.skipped} já existiam` : ""}`);
      onClose();
    }
    setBusy(false);
  };
  return (
    <Dialog open onClose={onClose} title="Importar contatos" description="Arquivo CSV com uma linha de títulos." width={680} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!valid.length || busy} onClick={save}>{rows ? `Importar ${plural(valid.length, "contato")}` : "Importar"}</Button></>}>
      {!rows ? (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed border-line3 px-6 py-12 text-center focus-within:border-gold hover:bg-bg2"><Upload size={20} strokeWidth={1.5} className="text-tx2" aria-hidden /><span className="font-medium">Escolher arquivo CSV</span><span className="t-sec">Separado por vírgula ou ponto e vírgula</span><input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void read(e.target.files?.[0])} /></label>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">{FIELDS.map((f) => <Field key={f.key} label={f.label}><Select placeholder="Ignorar" options={rows[0].map((h, i) => ({ value: String(i), label: h || `Coluna ${i + 1}` }))} value={map[f.key]} onChange={(e) => setMap({ ...map, [f.key]: e.target.value })} /></Field>)}</div>
          <div className="overflow-x-auto rounded-card border"><table className="w-full"><thead><tr className="border-b bg-bg2">{FIELDS.map((f) => <th key={f.key} className="t-label px-3 py-2 text-left">{f.label}</th>)}</tr></thead><tbody>{rows.slice(1, 6).map((r, i) => <tr key={i} className="border-b last:border-0">{FIELDS.map((f) => <td key={f.key} className="max-w-44 truncate px-3 py-2">{cell(r, f.key) || <span className="text-tx2">–</span>}</td>)}</tr>)}</tbody></table></div>
          <p className="t-sec">{valid.length} de {rows.length - 1} linhas com nome e telefone. Os contatos entram sem autorização para campanhas.</p>
        </>
      )}
    </Dialog>
  );
}
