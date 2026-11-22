"use client";
import { useState } from "react";
import type { ContactView } from "@/lib/data/types";
import { listContacts, mergeContacts } from "@/lib/data/repositories";
import { useQuery } from "@/lib/useQuery";
import { attempt } from "@/store/app";
import { ago, norm } from "@/lib/format";
import { Button, CHANNEL, Dialog, Radio, Row, SearchInput, Tag } from "@/components/ui";

function Card({ c }: { c: ContactView }) {
  return (
    <>
      <span className="t-block block">{c.name}</span>
      <Row label="Canal">{c.channels.map((x) => CHANNEL[x]).join(", ")}</Row><Row label="Telefone">{c.phone ?? "–"}</Row><Row label="Instagram">{c.instagram ?? "–"}</Row><Row label="E-mail">{c.email ?? "–"}</Row><Row label="Cidade">{c.city}</Row><Row label="Responsável">{c.owner?.name ?? "–"}</Row><Row label="Negócios">{c.dealCount}</Row><Row label="Último contato">{ago(c.lastContactAt)}</Row>
      <span className="mt-1 flex flex-wrap gap-1">{c.tags.map((t) => <Tag key={t.id} {...t} />)}</span>
    </>
  );
}
export function MergeDialog({ contact, onClose, onMerged }: { contact: ContactView; onClose: () => void; onMerged: (keepId: string) => void }) {
  const list = useQuery(listContacts).data?.filter((c) => c.id !== contact.id) ?? [];
  const [q, setQ] = useState(""), [otherId, setOther] = useState(""), [keep, setKeep] = useState(contact.id);
  const other = list.find((c) => c.id === otherId), first = norm(contact.name.split(" ")[0]);
  const hits = list.filter((c) => norm(c.name + (c.phone ?? "") + (c.instagram ?? "")).includes(norm(q || first))).slice(0, 6);
  const save = async () => { if (other && (await attempt(mergeContacts(keep, keep === contact.id ? other.id : contact.id), "Contatos unidos"))) onMerged(keep); };
  return (
    <Dialog open onClose={onClose} title="Unir duplicado" description={other ? "Escolha qual registro fica. Mensagens, negócios e tarefas passam para ele." : `Encontre o outro registro de ${contact.name}.`} width={720} footer={<><Button onClick={other ? () => setOther("") : onClose}>{other ? "Voltar" : "Cancelar"}</Button><Button variant="primary" disabled={!other} onClick={save}>Unir contatos</Button></>}>
      {!other ? <><SearchInput autoFocus placeholder="Nome, telefone ou @" value={q} onChange={(e) => setQ(e.target.value)} /><ul className="rounded-card border">{hits.length === 0 && <li className="t-sec px-3 py-6 text-center">Nenhum contato parecido</li>}{hits.map((c) => <li key={c.id} className="border-b last:border-0"><button type="button" onClick={() => setOther(c.id)} className="flex w-full justify-between px-3 py-2.5 text-left hover:bg-bg2"><span className="font-medium">{c.name}</span><span className="t-sec">{c.phone ?? c.instagram}</span></button></li>)}</ul></>
        : <div className="grid gap-3 sm:grid-cols-2">{[contact, other].map((c) => <Radio key={c.id} name="manter" checked={keep === c.id} onChange={() => setKeep(c.id)}><span className="t-label">{keep === c.id ? "Fica" : "Será unido"}</span><Card c={c} /></Radio>)}</div>}
    </Dialog>
  );
}
