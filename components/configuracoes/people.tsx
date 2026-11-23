"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserPlus } from "lucide-react";
import { getSettings, inviteUser, listSellers, listUsers, updateProfile, updateSettings, updateUser } from "@/lib/data/repositories";
import type { Channel, Role, Settings, User } from "@/lib/data/types";
import { useQuery } from "@/lib/useQuery";
import { attempt, toast, useApp } from "@/store/app";
import { ROLE_LABEL } from "@/lib/permissions";
import { Avatar, Button, CHANNEL, ChannelIcon, Checkbox, Dialog, Dot, Field, Input, Loaded, MoneyInput, Radio, Row, Section, Segmented, Select, Switch, Table, type Col } from "@/components/ui";

const ROLES = (Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));
export function Perfil() {
  const { user, dark, setDark, refreshUser } = useApp();
  const u = user!;
  const save = async (p: Parameters<typeof updateProfile>[0], ok: string) => { if (await attempt(updateProfile(p), ok)) refreshUser(); };
  const [name, setName] = useState(u.name);
  const pw = useForm({ resolver: zodResolver(z.object({ current: z.string().min(1, "Informe a senha atual."), next: z.string().min(8, "Use ao menos 8 caracteres."), again: z.string() }).refine((v) => v.next === v.again, { path: ["again"], message: "As senhas não são iguais." })), defaultValues: { current: "", next: "", again: "" } });
  const e = pw.formState.errors;
  const photo = (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith("image/") || f.size > 2 * 1024 * 1024) return toast("Use uma imagem de até 2 MB.", { alert: true });
    void save({ photo: URL.createObjectURL(f) }, "Foto atualizada");
  };
  return (
    <div className="flex flex-col gap-9">
      <Section title="Dados">
        <div className="flex items-center gap-4"><Avatar user={u} size={56} /><label className="inline-flex h-7 cursor-pointer items-center rounded-ctl border px-2.5 text-[12px] font-medium focus-within:outline-2 focus-within:outline-gold hover:border-line2">Trocar foto<input type="file" accept="image/*" className="sr-only" onChange={(x) => photo(x.target.files?.[0])} /></label>{u.photo && <Button size="sm" variant="ghost" onClick={() => void save({ photo: undefined }, "Foto removida")}>Remover</Button>}</div>
        <form className="mt-5 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(x) => { x.preventDefault(); void save({ name: name.trim() }, "Nome atualizado"); }}><Field label="Nome"><Input value={name} maxLength={60} onChange={(x) => setName(x.target.value)} /></Field><Field label="E-mail"><Input value={u.email} disabled /></Field><Button type="submit" disabled={name.trim().length < 2 || name.trim() === u.name}>Salvar</Button></form>
      </Section>
      <Section title="Senha"><form noValidate className="grid items-start gap-3 sm:grid-cols-3" onSubmit={pw.handleSubmit(() => { pw.reset(); toast("Senha alterada (simulação)"); })}><Field label="Atual" error={e.current?.message}><Input type="password" autoComplete="current-password" {...pw.register("current")} /></Field><Field label="Nova" error={e.next?.message}><Input type="password" autoComplete="new-password" {...pw.register("next")} /></Field><Field label="Repetir nova" error={e.again?.message}><Input type="password" autoComplete="new-password" {...pw.register("again")} /></Field><Button type="submit" className="justify-self-start">Alterar senha</Button></form></Section>
      <Section title="Tema"><Segmented label="Tema" value={dark ? "escuro" : "claro"} onChange={(v) => setDark(v === "escuro")} options={[{ value: "claro", label: "Claro" }, { value: "escuro", label: "Escuro" }]} /></Section>
      <Section title="Notificações"><div className="flex flex-col">{([["mensagens", "Mensagem nova de cliente"], ["tarefas", "Tarefa atrasada"], ["resumo", "Resumo do dia por e-mail"]] as const).map(([k, l]) => <div key={k} className="flex items-center justify-between border-b py-2.5 last:border-0"><span>{l}</span><Switch label={l} checked={u.notify[k]} onChange={(v) => void save({ notify: { ...u.notify, [k]: v } }, v ? "Notificação ligada" : "Notificação desligada")} /></div>)}</div></Section>
    </div>
  );
}
export function Usuarios() {
  const me = useApp((s) => s.user)!, q = useQuery(listUsers), [open, setOpen] = useState(false);
  const f = useForm({ resolver: zodResolver(z.object({ email: z.email("Informe um e-mail válido."), role: z.enum(["vendedor", "gestor", "admin"]) })), defaultValues: { email: "", role: "vendedor" as Role } });
  const cols: Col<User>[] = [
    { key: "n", label: "Nome", render: (u) => <span className={`inline-flex items-center gap-2 ${u.active ? "" : "text-tx2"}`}><Avatar user={u} size={24} />{u.name}</span>, sort: (u) => u.name }, { key: "e", label: "E-mail", render: (u) => <span className="text-tx2">{u.email}</span> },
    { key: "r", label: "Papel", sort: (u) => u.role, render: (u) => u.id === me.id ? ROLE_LABEL[u.role] : <Select aria-label={`Papel de ${u.name}`} className="!w-40" options={ROLES} value={u.role} onChange={(x) => void attempt(updateUser(u.id, { role: x.target.value as Role }), "Papel atualizado")} /> },
    { key: "s", label: "Acesso", render: (u) => u.id === me.id ? <span className="text-tx2">Você</span> : <Button size="sm" variant={u.active ? "danger" : "outline"} onClick={() => void attempt(updateUser(u.id, { active: !u.active }), u.active ? `${u.name} sem acesso` : `${u.name} com acesso`)}>{u.active ? "Desativar" : "Reativar"}</Button> },
  ];
  return (
    <Section title="Equipe" aside={<Button size="sm" variant="primary" icon={UserPlus} onClick={() => setOpen(true)}>Convidar</Button>}>
      <Loaded q={q}>{(l) => <Table caption="Usuários" cols={cols} rows={l} />}</Loaded>
      <Dialog open={open} onClose={() => setOpen(false)} title="Convidar por e-mail" width={420} footer={<><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" onClick={f.handleSubmit(async (v) => { if (await attempt(inviteUser(v.email, v.role), "Convite enviado")) { f.reset(); setOpen(false); } })}>Enviar convite</Button></>}><Field label="E-mail" error={f.formState.errors.email?.message}><Input autoFocus type="email" {...f.register("email")} /></Field><Field label="Papel"><Select options={ROLES} {...f.register("role")} /></Field></Dialog>
    </Section>
  );
}
export function Canais() {
  const q = useQuery(getSettings);
  const set = (s: Settings, c: Channel, status: Channel["status"]) => void attempt(updateSettings({ channels: s.channels.map((x) => (x.id === c.id ? { ...x, status } : x)) }), status === "Conectado" ? `${CHANNEL[c.type]} conectado` : `${CHANNEL[c.type]} desconectado`);
  return <Loaded q={q}>{(s) => <div className="grid gap-4 md:grid-cols-2">{s.channels.map((c) => <article key={c.id} className="flex flex-col rounded-card border p-5"><div className="mb-3 flex items-center gap-2.5"><ChannelIcon type={c.type} size={20} /><h2 className="t-block flex-1">{CHANNEL[c.type]}</h2><span className="inline-flex items-center gap-1.5"><Dot tone={c.status === "Conectado" ? "positive" : c.status === "Erro" ? "alert" : "warning"} />{c.status}</span></div><div className="mb-4 border-y py-2"><Row label={c.type === "whatsapp" ? "Número" : "Perfil"}><span className="tnum">{c.handle}</span></Row><Row label="Qualidade">{c.quality}</Row><Row label="Limite">{c.limit}</Row></div>{c.status === "Conectado" ? <Button className="self-start" onClick={() => set(s, c, "Pendente")}>Desconectar</Button> : <Button variant="primary" className="self-start" onClick={() => set(s, c, "Conectado")}>Conectar</Button>}</article>)}</div>}</Loaded>;
}
export function Distribuicao() {
  const q = useQuery(getSettings), sellers = useQuery(listSellers).data ?? [];
  const save = (distribution: Settings["distribution"]) => void attempt(updateSettings({ distribution }), "Distribuição atualizada");
  return <Loaded q={q}>{({ distribution: d }) => (
    <div className="flex flex-col gap-9">
      <Section title="Como os leads novos chegam"><div role="radiogroup" aria-label="Modo" className="grid gap-3 sm:grid-cols-2"><Radio name="modo" checked={d.mode === "rodizio"} onChange={() => save({ ...d, mode: "rodizio" })}><span className="block font-medium">Rodízio</span><span className="t-sec">Cada lead vai para a próxima pessoa da lista.</span></Radio><Radio name="modo" checked={d.mode === "livre"} onChange={() => save({ ...d, mode: "livre" })}><span className="block font-medium">Fila livre</span><span className="t-sec">O lead fica sem dono até alguém assumir.</span></Radio></div></Section>
      <Section title="Quem participa"><div className="flex flex-col">{sellers.map((u) => <Checkbox key={u.id} className="w-full items-center border-b py-2.5" checked={d.members.includes(u.id)} onChange={(v) => { const members = v ? [...d.members, u.id] : d.members.filter((m) => m !== u.id); if (!members.length) return toast("Deixe ao menos uma pessoa.", { alert: true }); save({ ...d, members }); }}><span className="inline-flex items-center gap-2"><Avatar user={u} size={22} />{u.name}</span></Checkbox>)}</div></Section>
    </div>
  )}</Loaded>;
}
function HoursForm({ s }: { s: Settings }) {
  const [h, setH] = useState(s.hours), [msg, setMsg] = useState(s.offMessage), [l, setL] = useState(s.limits);
  const bad = h.open >= h.close;
  const num = (k: keyof Settings["limits"], label: string, unit: string) => <Field label={label}><div className="flex items-center gap-2"><Input type="number" min={1} max={k === "windowH" ? 24 : 90} className="!w-24" value={l[k]} onChange={(e) => setL({ ...l, [k]: Math.max(1, Number(e.target.value)) })} /><span className="t-sec">{unit}</span></div></Field>;
  return (
    <form className="flex flex-col gap-9" onSubmit={(e) => { e.preventDefault(); void attempt(updateSettings({ hours: h, offMessage: msg.trim(), limits: { ...l, windowH: Math.min(24, l.windowH) } }), "Horário e alertas salvos"); }}>
      <Section title="Horário do showroom"><div className="grid gap-3 sm:grid-cols-3"><Field label="Abre" error={bad ? "Deve ser antes de fechar." : undefined}><Input type="time" value={h.open} onChange={(e) => setH({ ...h, open: e.target.value })} /></Field><Field label="Fecha"><Input type="time" value={h.close} onChange={(e) => setH({ ...h, close: e.target.value })} /></Field><Field label="Dias"><Select options={["Segunda a sexta", "Segunda a sábado", "Todos os dias"].map((x) => ({ value: x, label: x }))} value={h.days} onChange={(e) => setH({ ...h, days: e.target.value })} /></Field></div></Section>
      <Section title="Mensagem fora do horário"><textarea aria-label="Mensagem fora do horário" className="field" rows={3} maxLength={600} value={msg} onChange={(e) => setMsg(e.target.value)} /></Section>
      <Section title="Alertas"><div className="grid gap-4 sm:grid-cols-3">{num("windowH", "Janela de resposta", "horas")}{num("replyH", "Espera em cobre após", "horas")}{num("stalledD", "Proposta parada após", "dias")}</div></Section>
      <Button type="submit" variant="primary" className="self-start" disabled={bad || !msg.trim()}>Salvar</Button>
    </form>
  );
}
export function Horario() { const q = useQuery(getSettings); return <Loaded q={q}>{(s) => <HoursForm s={s} />}</Loaded>; }
function GoalsForm({ s, sellers }: { s: Settings; sellers: User[] }) {
  const [g, setG] = useState(s.goals), [team, setTeam] = useState(s.teamGoal);
  const total = sellers.reduce((a, u) => a + (g[u.id] ?? 0), 0);
  return (
    <form className="flex flex-col gap-9" onSubmit={(e) => { e.preventDefault(); void attempt(updateSettings({ goals: g, teamGoal: team }), "Metas salvas"); }}>
      <Section title="Meta mensal por vendedor">{sellers.map((u) => <label key={u.id} className="flex items-center gap-3 border-b py-2"><Avatar user={u} size={24} /><span className="flex-1">{u.name}</span><span className="w-40"><MoneyInput aria-label={`Meta de ${u.name}`} value={g[u.id] ?? 0} onValue={(v) => setG({ ...g, [u.id]: v })} /></span></label>)}</Section>
      <Section title="Meta da equipe"><div className="flex items-center gap-4"><span className="w-40"><MoneyInput aria-label="Meta da equipe" value={team} onValue={setTeam} /></span>{team !== total && <Button size="sm" variant="ghost" onClick={() => setTeam(total)}>Usar a soma dos vendedores</Button>}</div></Section>
      <Button type="submit" variant="primary" className="self-start">Salvar metas</Button>
    </form>
  );
}
export function Metas() { const q = useQuery(async () => ({ s: await getSettings(), sellers: await listSellers() })); return <Loaded q={q}>{(d) => <GoalsForm {...d} />}</Loaded>; }
function CostsForm({ s }: { s: Settings }) {
  const str = (n: number) => n.toFixed(2).replace(".", ","), num = (v: string) => Number(v.replace(",", "."));
  const [m, setM] = useState(str(s.costs.marketing)), [u, setU] = useState(str(s.costs.utilidade)), [ai, setAi] = useState(s.costs.aiMonthly);
  const ok = [m, u].every((v) => /^\d+([.,]\d{1,2})?$/.test(v));
  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void attempt(updateSettings({ costs: { marketing: num(m), utilidade: num(u), aiMonthly: ai } }), "Custos salvos"); }}>
      <Section title="Valores por mensagem e limite de IA"><div className="grid gap-4 sm:grid-cols-3"><Field label="Marketing (R$)" hint="Base do custo estimado das campanhas."><Input inputMode="decimal" value={m} onChange={(e) => setM(e.target.value)} /></Field><Field label="Utilidade (R$)"><Input inputMode="decimal" value={u} onChange={(e) => setU(e.target.value)} /></Field><Field label="Limite mensal de IA"><MoneyInput value={ai} onValue={setAi} /></Field></div></Section>
      <Button type="submit" variant="primary" className="self-start" disabled={!ok}>Salvar custos</Button>
    </form>
  );
}
export function Custos() { const q = useQuery(getSettings); return <Loaded q={q}>{(s) => <CostsForm s={s} />}</Loaded>; }
