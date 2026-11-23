"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { monthName } from "@/lib/insights";
import { sp } from "@/lib/campaign/schedule";
import { now } from "@/lib/format";
import { DEFAULT_ORDER, PRIORITY_LABEL, type PriorityKind } from "@/lib/priorities";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, UserPlus } from "lucide-react";
import { REMOTE } from "@/lib/supabase/client";
import { addChannel, deleteChannel, getSettings, inviteUser, setChannelActive, setChannelToken, listSellers, listUsers, updateProfile, updateSettings, updateUser } from "@/lib/data/repositories";
import type { Channel, Role, Settings, User } from "@/lib/data/types";
import { useQuery } from "@/lib/useQuery";
import { attempt, toast, useApp } from "@/store/app";
import { ROLE_LABEL } from "@/lib/permissions";
import { Avatar, Button, IconButton, CHANNEL, ChannelIcon, Checkbox, Dialog, Dot, Field, Input, Loaded, MoneyInput, Radio, Row, Section, Segmented, Select, Switch, Table, type Col } from "@/components/ui";

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
const META_HOOK = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/meta-webhook`;
const DIGITS = /^[0-9]{5,30}$/;
const channelSchema = z.object({
  type: z.enum(["whatsapp", "instagram"]), name: z.string().trim().min(1, "Dê um nome à conta.").max(80), handle: z.string().trim().min(1, "Informe o número ou o perfil.").max(60),
  phoneNumberId: z.string().trim().optional(), wabaId: z.string().trim().optional(), igUserId: z.string().trim().optional(), pageId: z.string().trim().optional(),
  igApi: z.enum(["instagram_login", "facebook_login"]), token: z.string().trim().optional(),
}).superRefine((v, c) => {
  const need = (k: "phoneNumberId" | "wabaId" | "igUserId", msg: string) => { if (!DIGITS.test(v[k] ?? "")) c.addIssue({ code: "custom", path: [k], message: msg }); };
  if (v.type === "whatsapp") { need("phoneNumberId", "Informe o ID do número (só dígitos)."); need("wabaId", "Informe o ID da conta do WhatsApp Business (só dígitos)."); }
  else need("igUserId", "Informe o ID da conta do Instagram (só dígitos).");
  if (v.pageId && !DIGITS.test(v.pageId)) c.addIssue({ code: "custom", path: ["pageId"], message: "Só dígitos." });
  if (v.token && v.token.length < 20) c.addIssue({ code: "custom", path: ["token"], message: "Token incompleto." });
});
type ChannelForm = z.infer<typeof channelSchema>;
function NewChannel({ onClose }: { onClose: () => void }) {
  const f = useForm<ChannelForm>({ resolver: zodResolver(channelSchema), defaultValues: { type: "whatsapp", name: "TCH Experiência", handle: "", igApi: "instagram_login" } });
  const type = f.watch("type"), e = f.formState.errors;
  const save = f.handleSubmit(async (v) => { if (await attempt(addChannel({ ...v, token: v.token || undefined }), `${CHANNEL[v.type]} cadastrado`)) onClose(); });
  return (
    <Dialog open onClose={onClose} title="Adicionar canal" description="Os IDs ficam no Meta Business Suite / WhatsApp Manager. O token é guardado no cofre do Supabase e nunca volta para a tela." width={520}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={f.formState.isSubmitting} onClick={save}>Salvar canal</Button></>}>
      <form className="flex flex-col gap-4" onSubmit={save}>
        <Segmented label="Canal" value={type} onChange={(t) => f.setValue("type", t)} options={[{ value: "whatsapp" as const, label: "WhatsApp" }, { value: "instagram" as const, label: "Instagram" }]} />
        <Field label="Nome da conta" error={e.name?.message}><Input {...f.register("name")} /></Field>
        <Field label={type === "whatsapp" ? "Número exibido" : "Perfil"} hint={type === "whatsapp" ? "Ex.: (21) 99999-0000" : "Ex.: @tchexperiencia"} error={e.handle?.message}><Input {...f.register("handle")} /></Field>
        {type === "whatsapp" ? <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ID do número (Phone number ID)" error={e.phoneNumberId?.message}><Input inputMode="numeric" {...f.register("phoneNumberId")} /></Field>
          <Field label="ID da conta WhatsApp Business (WABA ID)" error={e.wabaId?.message}><Input inputMode="numeric" {...f.register("wabaId")} /></Field>
        </div> : <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ID da conta do Instagram" error={e.igUserId?.message}><Input inputMode="numeric" {...f.register("igUserId")} /></Field>
            <Field label="ID da página do Facebook (opcional)" error={e.pageId?.message}><Input inputMode="numeric" {...f.register("pageId")} /></Field>
          </div>
          <Field label="Tipo de conexão"><Select options={[{ value: "instagram_login", label: "API do Instagram (login do Instagram)" }, { value: "facebook_login", label: "Via página do Facebook" }]} {...f.register("igApi")} /></Field>
        </>}
        <Field label="Token de acesso (opcional agora)" hint="Sem token o canal fica Pendente e não envia mensagens." error={e.token?.message}><Input type="password" autoComplete="off" {...f.register("token")} /></Field>
      </form>
    </Dialog>
  );
}
function TokenDialog({ c, onClose }: { c: Channel; onClose: () => void }) {
  const [t, setT] = useState("");
  return <Dialog open onClose={onClose} title={`Token do ${CHANNEL[c.type]}`} description="O token novo substitui o anterior no cofre do Supabase." width={440}
    footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={t.trim().length < 20} onClick={async () => { if (await attempt(setChannelToken(c.id, t.trim()), "Token salvo")) onClose(); }}>Salvar token</Button></>}>
    <Field label="Token de acesso"><Input autoFocus type="password" autoComplete="off" value={t} onChange={(e) => setT(e.target.value)} /></Field>
  </Dialog>;
}
function RemoteChannels() {
  const q = useQuery(getSettings), [dlg, setDlg] = useState<"" | "novo" | Channel>("");
  return (
    <Section title="Canais" aside={<Button size="sm" variant="primary" icon={Plus} onClick={() => setDlg("novo")}>Adicionar canal</Button>}>
      <Loaded q={q}>{(s) => s.channels.length === 0
        ? <p className="t-sec rounded-card border border-dashed p-6 text-center">Nenhum canal cadastrado. Adicione o número do WhatsApp Business e a conta do Instagram com os IDs da Meta.</p>
        : <div className="grid gap-4 md:grid-cols-2">{s.channels.map((c) => <article key={c.id} className="flex flex-col rounded-card border p-5">
            <div className="mb-3 flex items-center gap-2.5"><ChannelIcon type={c.type} size={20} /><h2 className="t-block flex-1">{CHANNEL[c.type]}</h2><span className="inline-flex items-center gap-1.5"><Dot tone={c.status === "Conectado" ? "positive" : c.status === "Erro" ? "alert" : "warning"} />{c.status}</span></div>
            <div className="mb-4 border-y py-2"><Row label="Conta">{c.account}</Row><Row label={c.type === "whatsapp" ? "Número" : "Perfil"}><span className="tnum">{c.handle || "—"}</span></Row>{c.quality && <Row label="Qualidade">{c.quality}</Row>}{c.limit && <Row label="Limite">{c.limit}</Row>}</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setDlg(c)}>{c.status === "Pendente" ? "Adicionar token" : "Trocar token"}</Button>
              <Button size="sm" variant="ghost" onClick={() => void attempt(setChannelActive(c.id, c.status === "Desativado"), c.status === "Desativado" ? "Canal reativado" : "Canal desativado")}>{c.status === "Desativado" ? "Reativar" : "Desativar"}</Button>
              <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Excluir o canal ${CHANNEL[c.type]} ${c.handle}?`)) void attempt(deleteChannel(c.id), "Canal excluído"); }}>Excluir</Button>
            </div>
          </article>)}</div>}</Loaded>
      <div className="mt-6 rounded-card border p-4 text-[13px]"><p className="font-medium">Webhook na Meta</p><p className="t-sec mt-1">Para receber mensagens, cadastre esta URL de retorno no app da Meta, com o mesmo token de verificação definido no Supabase.</p><p className="tnum mt-2 select-all break-all rounded-ctl bg-bg2 px-3 py-2">{META_HOOK}</p></div>
      {dlg === "novo" && <NewChannel onClose={() => setDlg("")} />}
      {dlg && dlg !== "novo" && <TokenDialog c={dlg} onClose={() => setDlg("")} />}
    </Section>
  );
}
export function Canais() {
  const q = useQuery(getSettings);
  if (REMOTE) return <RemoteChannels />;
  const set =(s: Settings, c: Channel, status: Channel["status"]) => void attempt(updateSettings({ channels: s.channels.map((x) => (x.id === c.id ? { ...x, status } : x)) }), status === "Conectado" ? `${CHANNEL[c.type]} conectado` : `${CHANNEL[c.type]} desconectado`);
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
  const [h, setH] = useState(s.hours), [msg, setMsg] = useState(s.offMessage), [l, setL] = useState(s.limits), [order, setOrder] = useState<PriorityKind[]>([...(s.priorityOrder as PriorityKind[]), ...DEFAULT_ORDER.filter((k) => !s.priorityOrder.includes(k))]);
  const move = (i: number, d: number) => { const o = [...order]; [o[i], o[i + d]] = [o[i + d], o[i]]; setOrder(o); };
  const bad = h.open >= h.close;
  const num = (k: keyof Settings["limits"], label: string, unit: string) => <Field label={label}><div className="flex items-center gap-2"><Input type="number" min={1} max={k === "windowH" ? 24 : k === "firstReplyMin" ? 240 : 90} className="!w-24" value={l[k]} onChange={(e) => setL({ ...l, [k]: Math.max(1, Number(e.target.value)) })} /><span className="t-sec">{unit}</span></div></Field>;
  return (
    <form className="flex flex-col gap-9" onSubmit={(e) => { e.preventDefault(); void attempt(updateSettings({ hours: h, offMessage: msg.trim(), limits: { ...l, windowH: Math.min(24, l.windowH) }, priorityOrder: order }), "Horário e alertas salvos"); }}>
      <Section title="Horário do showroom"><div className="grid gap-3 sm:grid-cols-3"><Field label="Abre" error={bad ? "Deve ser antes de fechar." : undefined}><Input type="time" value={h.open} onChange={(e) => setH({ ...h, open: e.target.value })} /></Field><Field label="Fecha"><Input type="time" value={h.close} onChange={(e) => setH({ ...h, close: e.target.value })} /></Field><Field label="Dias"><Select options={["Segunda a sexta", "Segunda a sábado", "Todos os dias"].map((x) => ({ value: x, label: x }))} value={h.days} onChange={(e) => setH({ ...h, days: e.target.value })} /></Field></div></Section>
      <Section title="Mensagem fora do horário"><textarea aria-label="Mensagem fora do horário" className="field" rows={3} maxLength={600} value={msg} onChange={(e) => setMsg(e.target.value)} /></Section>
      <Section title="Alertas"><div className="grid gap-4 sm:grid-cols-3">{num("windowH", "Janela de resposta", "horas")}{num("replyH", "Espera em cobre após", "horas")}{num("stalledD", "Proposta parada após", "dias")}{num("firstReplyMin", "Meta da 1ª resposta humana", "minutos")}</div></Section>
      <Section title="Ordem das prioridades em Insights"><p className="t-sec mb-3">Cada lead aparece uma vez, no primeiro motivo desta lista. Empate: quem espera há mais tempo.</p><ol className="flex flex-col">{order.map((k, i) => <li key={k} className="flex items-center gap-2 border-b py-1.5"><span className="tnum w-5 text-tx2">{i + 1}.</span><span className="flex-1">{PRIORITY_LABEL[k]}</span><IconButton icon={ArrowUp} label={`Subir ${PRIORITY_LABEL[k]}`} disabled={!i} onClick={() => move(i, -1)} /><IconButton icon={ArrowDown} label={`Descer ${PRIORITY_LABEL[k]}`} disabled={i === order.length - 1} onClick={() => move(i, 1)} /></li>)}</ol></Section>
      <Button type="submit" variant="primary" className="self-start" disabled={bad || !msg.trim()}>Salvar</Button>
    </form>
  );
}
export function Horario() { const q = useQuery(getSettings); return <Loaded q={q}>{(s) => <HoursForm s={s} />}</Loaded>; }
const monthOpts = () => { const r = sp(now()); return Array.from({ length: 4 }, (_, i) => { const m = ((r.m - 1 + i) % 12) + 1, y = r.y + Math.floor((r.m - 1 + i) / 12), key = `${y}-${String(m).padStart(2, "0")}`; return { value: key, label: monthName(key) }; }); };
/** Meta por mês: equipe, supermeta e vendedores. Vazio = sem meta (nunca vira zero). */
function GoalsForm({ s, sellers, initial }: { s: Settings; sellers: User[]; initial: string }) {
  const months = monthOpts(), [key, setKey] = useState(months.some((m) => m.value === initial) ? initial : months[0].value);
  const cur = s.goalsByMonth[key];
  const [team, setTeam] = useState<number | null>(cur?.team ?? null), [sup, setSup] = useState<number | null>(cur?.superGoal ?? null), [g, setG] = useState<Record<string, number>>(cur?.sellers ?? {});
  const pick = (k: string) => { const c = s.goalsByMonth[k]; setKey(k); setTeam(c?.team ?? null); setSup(c?.superGoal ?? null); setG(c?.sellers ?? {}); };
  const total = sellers.reduce((a, u) => a + (g[u.id] ?? 0), 0);
  const save = () => { const sellersGoals = Object.fromEntries(Object.entries(g).filter(([, v]) => v > 0)); void attempt(updateSettings({ goalsByMonth: { ...s.goalsByMonth, [key]: { team: team || null, superGoal: sup || null, sellers: sellersGoals } } }), `Metas de ${monthName(key)} salvas`); };
  return (
    <form className="flex flex-col gap-9" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <Section title="Mês"><div className="flex flex-wrap items-center gap-3"><Select aria-label="Mês" className="!w-56" options={months} value={key} onChange={(e) => pick(e.target.value)} /><span className="t-sec">{cur ? "Meta cadastrada" : "Sem meta cadastrada"}</span></div></Section>
      <Section title="Meta da equipe"><div className="grid gap-4 sm:grid-cols-2">
        <Field label="Meta do mês" hint="Vazio: o painel mostra “Sem meta cadastrada”. Referência do planejamento TCH: R$ 300.000."><MoneyInput aria-label="Meta da equipe" value={team ?? 0} onValue={(v) => setTeam(v || null)} /></Field>
        <Field label="Supermeta (opcional)" hint="Referência do planejamento TCH: R$ 500.000."><MoneyInput aria-label="Supermeta" value={sup ?? 0} onValue={(v) => setSup(v || null)} /></Field>
      </div>{total > 0 && team !== total && <Button size="sm" variant="ghost" className="mt-2" onClick={() => setTeam(total)}>Usar a soma dos vendedores ({total.toLocaleString("pt-BR")})</Button>}</Section>
      <Section title="Meta por vendedor">{sellers.map((u) => <label key={u.id} className="flex items-center gap-3 border-b py-2"><Avatar user={u} size={24} /><span className="flex-1">{u.name}</span><span className="w-40"><MoneyInput aria-label={`Meta de ${u.name}`} value={g[u.id] ?? 0} onValue={(v) => setG({ ...g, [u.id]: v })} /></span></label>)}</Section>
      <Button type="submit" variant="primary" className="self-start">Salvar metas de {monthName(key)}</Button>
    </form>
  );
}
export function Metas() { const q = useQuery(async () => ({ s: await getSettings(), sellers: await listSellers() })), mes = useSearchParams().get("mes") ?? ""; return <Loaded q={q}>{(d) => <GoalsForm key={mes} {...d} initial={mes} />}</Loaded>; }
function CostsForm({ s }: { s: Settings }) {
  const str = (n: number | null) => (n === null ? "" : n.toFixed(2).replace(".", ",")), num = (v: string) => (v.trim() ? Number(v.replace(",", ".")) : null);
  const [m, setM] = useState(str(s.costs.marketing)), [u, setU] = useState(str(s.costs.utilidade)), [ai, setAi] = useState(s.costs.aiMonthly);
  const ok = [m, u].every((v) => !v.trim() || /^\d+([.,]\d{1,4})?$/.test(v.trim()));
  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void attempt(updateSettings({ costs: { marketing: num(m), utilidade: num(u), aiMonthly: ai, updatedAt: new Date().toISOString() } }), "Custos salvos"); }}>
      <Section title="Valores por mensagem e limite de IA"><div className="grid gap-4 sm:grid-cols-3"><Field label="Marketing (R$)" hint="Use a tarifa da sua conta na Meta. Vazio: as campanhas mostram que o custo não pode ser estimado."><Input inputMode="decimal" value={m} onChange={(e) => setM(e.target.value)} /></Field><Field label="Utilidade (R$)" hint="Opcional."><Input inputMode="decimal" value={u} onChange={(e) => setU(e.target.value)} /></Field><Field label="Limite mensal de IA"><MoneyInput value={ai} onValue={setAi} /></Field></div></Section>
      <Button type="submit" variant="primary" className="self-start" disabled={!ok}>Salvar custos</Button>
    </form>
  );
}
export function Custos() { const q = useQuery(getSettings); return <Loaded q={q}>{(s) => <CostsForm s={s} />}</Loaded>; }
