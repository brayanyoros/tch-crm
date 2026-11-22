"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Plus, Upload, X } from "lucide-react";
import { useQuery } from "@/lib/useQuery";
import { addTagToContacts, addToList, assignContacts, listCities, listContacts, listSellers, listTags } from "@/lib/data/repositories";
import type { ContactView } from "@/lib/data/types";
import { ago, downloadCsv, fmt, norm, plural } from "@/lib/format";
import { can } from "@/lib/permissions";
import { attempt, useApp } from "@/store/app";
import { Avatar, Button, CHANNEL, ChannelIcon, Dialog, Dropdown, EmptyState, Field, FilterMenu, IconButton, Input, Loaded, opts, SearchInput, Table, Tag, type Col } from "@/components/ui";
import { ImportDialog } from "@/components/contatos/ImportDialog";
import { ContactDialog } from "@/components/contatos/ContactDialog";

const EMPTY = { q: "", ownerId: "", channel: "", tagId: "", city: "" };
const cols: Col<ContactView>[] = [
  { key: "nome", label: "Nome", render: (c) => c.name, sort: (c) => c.name },
  { key: "canal", label: "Canal", render: (c) => <span className="flex gap-1.5">{c.channels.map((x) => <ChannelIcon key={x} type={x} />)}</span>, sort: (c) => c.channels[0] },
  { key: "tel", label: "Telefone / @", render: (c) => c.phone ?? c.instagram, className: "tnum whitespace-nowrap" },
  { key: "cidade", label: "Cidade", render: (c) => c.city, sort: (c) => c.city, className: "whitespace-nowrap" },
  { key: "resp", label: "Responsável", render: (c) => <span className="inline-flex items-center gap-2 whitespace-nowrap"><Avatar user={c.owner} size={22} />{c.owner?.name ?? <span className="text-tx2">Sem responsável</span>}</span>, sort: (c) => c.owner?.name ?? "" },
  { key: "tags", label: "Tags", render: (c) => <span className="flex gap-1">{c.tags.slice(0, 2).map((t) => <Tag key={t.id} {...t} />)}{c.tags.length > 2 && <span className="t-meta text-tx2">+{c.tags.length - 2}</span>}</span> },
  { key: "ult", label: "Último contato", render: (c) => <span className="whitespace-nowrap text-tx2">{ago(c.lastContactAt)}</span>, sort: (c) => c.lastContactAt },
  { key: "neg", label: "Negócios", right: true, render: (c) => c.dealCount, sort: (c) => c.dealCount },
];
export default function ContatosPage() {
  const user = useApp((s) => s.user)!, router = useRouter();
  const q = useQuery(listContacts), sellers = useQuery(listSellers).data ?? [], tags = useQuery(listTags).data ?? [], cities = useQuery(listCities).data ?? [];
  const [f, setF] = useState(EMPTY), [sel, setSel] = useState(new Set<string>()), [dlg, setDlg] = useState<"" | "importar" | "novo" | "lista">(""), [list, setList] = useState("");
  const t = norm(f.q);
  const rows = q.data?.filter((c) => (!t || norm(`${c.name} ${c.phone ?? ""} ${c.instagram ?? ""} ${c.email ?? ""} ${c.city}`).includes(t)) && (!f.ownerId || c.ownerId === f.ownerId) && (!f.channel || c.channels.some((x) => x === f.channel)) && (!f.tagId || c.tagIds.includes(f.tagId)) && (!f.city || c.city === f.city)) ?? [];
  const active = Object.values(f).some(Boolean), ids = rows.filter((r) => sel.has(r.id)).map((r) => r.id);
  const bulk = async (p: Promise<unknown>, ok: string) => { if (await attempt(p, ok)) setSel(new Set()); };
  const exportCsv = () => downloadCsv("contatos-tch.csv", [["Nome", "Canal", "Telefone", "Instagram", "E-mail", "Cidade", "Responsável", "Tags", "Último contato", "Negócios"], ...(ids.length ? rows.filter((r) => sel.has(r.id)) : rows).map((c) => [c.name, c.channels.map((x) => CHANNEL[x]).join(", "), c.phone ?? "", c.instagram ?? "", c.email ?? "", c.city, c.owner?.name ?? "", c.tags.map((x) => x.name).join(", "), fmt(c.lastContactAt, "dd/MM/yyyy HH:mm"), c.dealCount])]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {ids.length > 0 ? (
        <div className="flex min-h-[55px] flex-wrap items-center gap-2 border-b bg-sel px-4 py-2.5 md:px-6">
          <IconButton icon={X} label="Limpar seleção" onClick={() => setSel(new Set())} /><span className="mr-2 font-semibold">{plural(ids.length, "selecionado")}</span>
          {can(user, "lead.transfer") && <Dropdown align="start" trigger={<Button size="sm">Atribuir</Button>} items={sellers.map((s) => ({ label: s.name, run: () => void bulk(assignContacts(ids, s.id), `Atribuído a ${s.name}`) }))} />}
          <Dropdown align="start" trigger={<Button size="sm">Adicionar tag</Button>} items={tags.map((x) => ({ label: x.name, run: () => void bulk(addTagToContacts(ids, x.id), `Tag ${x.name} adicionada`) }))} />
          {can(user, "campaigns") && <Button size="sm" onClick={() => setDlg("lista")}>Incluir em lista</Button>}
          <Button size="sm" icon={Download} onClick={exportCsv}>Exportar</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 md:px-6">
          <SearchInput className="w-full sm:w-60" placeholder="Nome, telefone ou cidade" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          {can(user, "insights.team") && <FilterMenu label="Responsável" value={f.ownerId} options={opts(sellers)} onChange={(v) => setF({ ...f, ownerId: v })} />}
          <FilterMenu label="Canal" value={f.channel} options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "instagram", label: "Instagram" }]} onChange={(v) => setF({ ...f, channel: v })} />
          <FilterMenu label="Tag" value={f.tagId} options={opts(tags)} onChange={(v) => setF({ ...f, tagId: v })} />
          <FilterMenu label="Cidade" value={f.city} options={cities.map((c) => ({ value: c, label: c }))} onChange={(v) => setF({ ...f, city: v })} />
          {active && <Button size="sm" variant="ghost" onClick={() => setF(EMPTY)}>Limpar</Button>}
          <div className="ml-auto flex items-center gap-2"><span className="t-sec tnum mr-1 hidden xl:inline">{q.data && plural(rows.length, "contato")}</span><IconButton icon={Upload} label="Importar CSV" onClick={() => setDlg("importar")} /><IconButton icon={Download} label="Exportar CSV" onClick={exportCsv} /><Button variant="primary" icon={Plus} onClick={() => setDlg("novo")}>Novo contato</Button></div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Loaded q={q}>{() => rows.length === 0 ? <EmptyState title={active ? "Nenhum contato com esses filtros" : "Nenhum contato ainda"} text={active ? "Confira a busca ou limpe os filtros." : "Importe sua planilha ou cadastre o primeiro lead."} action={active ? <Button onClick={() => setF(EMPTY)}>Limpar filtros</Button> : <Button onClick={() => setDlg("importar")}>Importar CSV</Button>} />
          : <Table caption="Contatos" cols={cols} rows={rows} selected={sel} onSelect={setSel} onRow={(c) => router.push(`/contatos/${c.id}`)} />}</Loaded>
      </div>
      {dlg === "importar" && <ImportDialog onClose={() => setDlg("")} />}
      {dlg === "novo" && <ContactDialog onClose={() => setDlg("")} />}
      <Dialog open={dlg === "lista"} onClose={() => setDlg("")} title="Incluir em lista de campanha" width={400} footer={<><Button onClick={() => setDlg("")}>Cancelar</Button><Button variant="primary" disabled={!list.trim()} onClick={() => { void bulk(addToList(ids, list.trim()), `Incluídos em ${list.trim()}`); setDlg(""); setList(""); }}>Incluir</Button></>}><Field label="Nome da lista" hint="Use um nome existente para somar a ela."><Input autoFocus value={list} maxLength={40} onChange={(e) => setList(e.target.value)} /></Field></Dialog>
    </div>
  );
}
