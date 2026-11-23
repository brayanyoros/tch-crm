/*
 * Ponte entre as telas e o backend Supabase.
 * As telas continuam lendo `db` (mesmas visões e regras do modo demonstração); aqui:
 *  1. `hydrate` carrega o que a RLS permite ver e converte para os tipos do frontend;
 *  2. o Realtime mantém `db` atualizado (mensagens novas, status, transferências…);
 *  3. cada escrita vai para uma RPC/Edge Function, que valida permissões e regras no servidor.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { changed, db } from "./db";
import { edge, friendly, rpc, sb } from "../supabase/client";
import type {
  Audience, Campaign, CampaignDraft, SavedAudience,
  Attachment, Channel, ChannelType, Contact, Conversation, Deal, Message, Product, QuickReply, Role, Settings, Stage, Tag, TagColor, Task, Template, User,
} from "./types";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function all(build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw friendly(error);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
const replace = <T,>(target: T[], items: T[]) => { target.splice(0, target.length, ...items); };

// ---------------------------------------------------------------- conversões banco → telas
const toUser = (p: Row): User => ({ id: p.id, name: p.name, email: p.email, role: p.role as Role, title: p.title ?? "", avatar: p.avatar as TagColor, active: p.active, photo: p.photo_url ?? undefined, notify: { mensagens: true, tarefas: true, resumo: false, ...(p.notify ?? {}) } });
const CHANNEL_STATUS: Record<string, Channel["status"]> = { conectado: "Conectado", pendente: "Pendente", erro: "Erro", desativado: "Desativado" };
const TEMPLATE_STATUS: Record<string, Template["status"]> = { aprovado: "Aprovado", em_analise: "Em análise", rejeitado: "Rejeitado", pausado: "Rejeitado", desativado: "Rejeitado" };
const MSG_STATUS: Record<string, Message["status"]> = { pending: "enviando", sending: "enviando", sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou" };
const MEDIA_TYPE: Record<string, Attachment["type"]> = { image: "imagem", sticker: "imagem", audio: "audio", video: "video", document: "pdf" };
const PLACEHOLDER: Record<string, string> = { location: "📍 Localização", contacts: "👤 Contato compartilhado", story_mention: "Mencionou você no story", share: "Compartilhou uma publicação", unsupported: "Mensagem não suportada pelo canal" };
const size = (b?: number | null) => (!b ? undefined : b > 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.ceil(b / 1024)} KB`);

function toMessage(m: Row, media: Row | undefined, urls: Map<string, string>): Message {
  const attachment: Attachment | undefined = media ? {
    type: MEDIA_TYPE[media.kind] ?? "pdf", name: media.file_name ?? (media.kind === "audio" ? "Áudio" : media.kind === "image" ? "Imagem" : "Arquivo"),
    size: size(media.size_bytes), seconds: media.duration_s ?? undefined, url: media.storage_path ? urls.get(media.storage_path) : undefined,
  } : undefined;
  const text = m.metadata?.deleted ? "Mensagem apagada pelo cliente" : m.body ?? (media ? "" : PLACEHOLDER[m.type] ?? "");
  return {
    id: m.id, kind: m.kind, authorId: m.author_id ?? undefined, text, at: m.created_at,
    ...(m.kind === "equipe" ? { status: MSG_STATUS[m.status] ?? "enviada", ...(m.status === "failed" ? { error: m.error_message ?? "Falha no envio." } : {}) } : {}),
    ...(attachment ? { attachment } : {}),
  };
}

// ---------------------------------------------------------------- carga
async function loadTeam() {
  replace(db.users, (await all((a, b) => sb().from("profiles").select("*").order("name").range(a, b))).map(toUser));
}

async function loadCatalog() {
  const [tags, products, stages, quick, templates, settingsRows, channels] = await Promise.all([
    all((a, b) => sb().from("tags").select("id, name, color").order("name").range(a, b)),
    all((a, b) => sb().from("products").select("id, name, category, price, active").order("name").range(a, b)),
    all((a, b) => sb().from("pipeline_stages").select("id, name, chance, position").order("position").range(a, b)),
    all((a, b) => sb().from("quick_replies").select("id, shortcut, text, audience").order("shortcut").range(a, b)),
    all((a, b) => sb().from("templates").select("id, name, label, language, channel_id, category, status, body, rejection_reason, header, buttons").order("name").range(a, b)),
    all((a, b) => sb().from("app_settings").select("*").range(a, b)),
    all((a, b) => sb().from("channels").select("id, type, name, handle, status, quality, messaging_limit").order("created_at").range(a, b)),
  ]);
  replace(db.tags, tags.map((t): Tag => ({ id: t.id, name: t.name, color: t.color })));
  replace(db.products, products.filter((p) => p.active).map((p): Product => ({ id: p.id, name: p.name, category: p.category, price: Number(p.price) })));
  replace(db.stages, stages.map((s): Stage => ({ id: s.id, name: s.name, chance: s.chance })));
  replace(db.quickReplies, quick.map((q): QuickReply => ({ id: q.id, shortcut: q.shortcut, text: q.text, who: q.audience })));
  replace(db.templates, templates.map((t): Template => ({
    id: t.id, name: t.name, label: t.label ?? undefined, language: t.language, channelId: t.channel_id, category: t.category === "marketing" ? "Marketing" : "Utilidade",
    status: TEMPLATE_STATUS[t.status] ?? "Em análise", body: t.body, reason: t.rejection_reason ?? undefined,
    header: t.header?.format === "IMAGE" ? { type: "imagem", name: "Imagem do modelo" } : t.header?.format === "DOCUMENT" ? { type: "pdf", name: "Documento do modelo" } : undefined,
    buttons: Array.isArray(t.buttons) ? t.buttons.map(String) : [],
  })));
  const s = settingsRows[0];
  if (s) Object.assign(db.settings, {
    hours: s.hours, offMessage: s.off_message, limits: s.limits, goalsByMonth: s.goals_by_month ?? {}, priorityOrder: s.priority_order,
    costs: s.costs, distribution: { mode: s.distribution?.mode ?? "livre", members: s.distribution?.members ?? [] }, lossReasons: s.loss_reasons,
    channels: channels.map((c): Channel => ({ id: c.id, type: c.type, account: c.name, handle: c.handle, status: CHANNEL_STATUS[c.status] ?? "Pendente", quality: c.quality, limit: c.messaging_limit })),
  } satisfies Partial<Settings>);
}

async function loadContacts() {
  const [contacts, tags, lists] = await Promise.all([
    all((a, b) => sb().from("contacts").select("id, name, channels, phone, instagram_username, email, city, owner_id, last_contact_at, consent_status, consent_at, consent_origin").order("id").range(a, b)),
    all((a, b) => sb().from("contact_tags").select("contact_id, tag_id").order("contact_id").range(a, b)),
    all((a, b) => sb().from("contact_list_members").select("contact_id, contact_lists(name)").order("contact_id").range(a, b)),
  ]);
  const tagMap = new Map<string, string[]>(), listMap = new Map<string, string[]>();
  for (const t of tags) tagMap.set(t.contact_id, [...(tagMap.get(t.contact_id) ?? []), t.tag_id]);
  for (const l of lists) listMap.set(l.contact_id, [...(listMap.get(l.contact_id) ?? []), l.contact_lists?.name].filter(Boolean));
  replace(db.contacts, contacts.map((c): Contact => ({
    id: c.id, name: c.name, channels: (c.channels ?? []) as ChannelType[], phone: c.phone ?? undefined, instagram: c.instagram_username ? `@${c.instagram_username}` : undefined,
    email: c.email ?? undefined, city: c.city ?? "", ownerId: c.owner_id, tagIds: tagMap.get(c.id) ?? [], lastContactAt: c.last_contact_at,
    consent: { status: c.consent_status, date: c.consent_at ?? undefined, origin: c.consent_origin ?? undefined }, lists: listMap.get(c.id) ?? [],
  })));
}

async function loadDeals() {
  const [deals, notes, history] = await Promise.all([
    all((a, b) => sb().from("deals").select("*").order("created_at").range(a, b)),
    all((a, b) => sb().from("deal_notes").select("id, deal_id, author_id, text, created_at").order("created_at", { ascending: false }).range(a, b)),
    all((a, b) => sb().from("deal_history").select("id, deal_id, author_id, text, created_at").order("id").range(a, b)),
  ]);
  replace(db.deals, deals.map((d): Deal => ({
    id: d.id, contactId: d.contact_id, productId: d.product_id, title: d.title, channel: d.channel, value: Number(d.value), ownerId: d.owner_id, stageId: d.stage_id,
    status: d.status, reached: d.reached, origin: d.origin, ad: d.ad_name ?? undefined, campaignId: d.campaign_id ?? undefined, createdAt: d.created_at,
    closedAt: d.closed_at ?? undefined, lostReason: d.lost_reason ?? undefined, lastMessageAt: d.last_message_at, expectedCloseAt: d.expected_close_at ?? undefined,
    firstReplyMin: d.first_reply_min ?? 0, avgReplyMin: d.avg_reply_min ?? 0,
    notes: notes.filter((n) => n.deal_id === d.id).map((n) => ({ id: n.id, authorId: n.author_id, text: n.text, at: n.created_at })),
    history: history.filter((h) => h.deal_id === d.id).map((h) => ({ id: String(h.id), at: h.created_at, text: h.text, authorId: h.author_id ?? undefined })),
  })));
}

const HISTORY_DAYS = 120;
/** Carrega conversas e mensagens (todas, ou só as indicadas). */
async function loadConversations(ids?: string[]) {
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
  const convs = await all((a, b) => {
    let q = sb().from("conversations").select("id, contact_id, channel, unread, closed").order("id");
    if (ids) q = q.in("id", ids);
    return q.range(a, b);
  });
  const msgs = await all((a, b) => {
    let q = sb().from("messages").select("id, conversation_id, kind, author_id, type, body, status, error_message, metadata, created_at, message_media(kind, file_name, size_bytes, duration_s, storage_path)")
      .gte("created_at", since).order("created_at").order("id");
    if (ids) q = q.in("conversation_id", ids);
    return q.range(a, b);
  });
  const paths = msgs.flatMap((m) => (m.message_media ?? []).map((x: Row) => x.storage_path).filter(Boolean));
  const urls = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 100) {
    const { data } = await sb().storage.from("chat-media").createSignedUrls(paths.slice(i, i + 100), 60 * 60 * 6);
    for (const s of data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const byConv = new Map<string, Message[]>();
  for (const m of msgs) byConv.set(m.conversation_id, [...(byConv.get(m.conversation_id) ?? []), toMessage(m, m.message_media?.[0], urls)]);
  const mapped = convs.map((v): Conversation => ({ id: v.id, contactId: v.contact_id, channel: v.channel, messages: byConv.get(v.id) ?? [], unread: v.unread, closed: v.closed }));
  if (!ids) replace(db.conversations, mapped);
  else {
    for (const id of ids) {
      const i = db.conversations.findIndex((x) => x.id === id), next = mapped.find((x) => x.id === id);
      if (i >= 0 && next) db.conversations[i] = next; else if (i >= 0) db.conversations.splice(i, 1); else if (next) db.conversations.push(next);
    }
  }
}

async function loadTasks() {
  replace(db.tasks, (await all((a, b) => sb().from("tasks").select("id, title, type, deal_id, contact_id, due_at, owner_id, done_at").order("due_at").range(a, b)))
    .map((t): Task => ({ id: t.id, title: t.title, type: t.type, dealId: t.deal_id ?? undefined, contactId: t.contact_id ?? undefined, dueAt: t.due_at, ownerId: t.owner_id, doneAt: t.done_at ?? undefined })));
}

/** Campanhas e públicos salvos (a RLS devolve vazio para vendedor). */
async function loadCampaigns() {
  const [camps, recips, auds] = await Promise.all([
    all((a, b) => sb().from("campaigns").select("*").order("created_at", { ascending: false }).range(a, b)),
    all((a, b) => sb().from("campaign_recipients").select("campaign_id, contact_id, name, phone, status").order("campaign_id").range(a, b)),
    all((a, b) => sb().from("saved_audiences").select("*").order("name").range(a, b)),
  ]);
  replace(db.campaigns, camps.map((c): Campaign => ({
    id: c.id, name: c.name, senderId: c.sender_channel_id ?? "", audience: c.audience, templateId: c.template_id ?? "", vars: c.vars ?? {}, replies: c.replies,
    when: c.send_mode, scheduledAt: c.scheduled_at ?? "", status: c.status, audienceLabel: c.audience_label, savedAt: c.saved_at,
    confirmedAt: c.confirmed_at ?? undefined, confirmedBy: c.confirmed_by ?? undefined, costPerMessage: c.cost_per_message === null ? null : Number(c.cost_per_message),
    recipients: recips.filter((r) => r.campaign_id === c.id).map((r) => ({ contactId: r.contact_id, name: r.name, phone: r.phone, status: r.status })),
  })));
  replace(db.audiences, auds.map((s): SavedAudience => ({ id: s.id, name: s.name, audience: s.audience, updatedAt: s.updated_at })));
}

const LOADERS = { team: loadTeam, catalog: loadCatalog, contacts: loadContacts, deals: loadDeals, conversations: () => loadConversations(), tasks: loadTasks, campaigns: loadCampaigns };
type Group = keyof typeof LOADERS;

export async function refresh(...groups: Group[]) {
  await Promise.all(groups.map((g) => LOADERS[g]()));
  changed();
}

// ---------------------------------------------------------------- sessão e tempo real
let live: RealtimeChannel | null = null;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const later = (key: string, run: () => Promise<unknown>) => {
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => { run().then(changed).catch(() => { /* próxima mudança tenta de novo */ }); }, 400));
};
let notify: ((text: string, href: string) => void) | null = null;
export const onRemoteNotification = (f: typeof notify) => { notify = f; };

/** Carrega tudo e liga o Realtime. Devolve o usuário logado (ou null sem sessão). */
export async function hydrate(): Promise<User | null> {
  const { data } = await sb().auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return null;
  await Promise.all(Object.values(LOADERS).map((f) => f()));
  const me = db.users.find((u) => u.id === uid && u.active) ?? null;
  if (!me) { await sb().auth.signOut(); return null; }
  live?.unsubscribe();
  live = sb().channel("crm")
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (p) => {
      const conv = ((p.new as Row)?.conversation_id ?? (p.old as Row)?.conversation_id) as string | undefined;
      if (conv) later(`conv:${conv}`, () => loadConversations([conv]));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "message_media" }, () => later("conversations", () => loadConversations()))
    .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => later("conversations", () => loadConversations()))
    .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => later("contacts", loadContacts))
    .on("postgres_changes", { event: "*", schema: "public", table: "contact_tags" }, () => later("contacts", loadContacts))
    .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, () => later("deals", loadDeals))
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => later("tasks", loadTasks))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` }, (p) => notify?.((p.new as Row).text, (p.new as Row).href))
    .subscribe();
  changed();
  return me;
}

export async function signIn(email: string, password: string): Promise<User> {
  const { error } = await sb().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error(error.status === 400 ? "E-mail ou senha não conferem." : "Não foi possível entrar. Tente de novo.");
  const me = await hydrate();
  if (!me) throw new Error("Seu acesso está desativado. Fale com o administrador.");
  return me;
}
export async function signOut() { live?.unsubscribe(); live = null; await sb().auth.signOut(); }
export async function requestPasswordLink(email: string) {
  await sb().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${location.origin}/login` }); // mesma resposta exista ou não a conta
}

// ---------------------------------------------------------------- equipe e preferências
export async function updateProfile(patch: Partial<Pick<User, "name" | "photo" | "notify">>) {
  const { data } = await sb().auth.getUser();
  const row: Row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.photo !== undefined) row.photo_url = patch.photo;
  if (patch.notify !== undefined) row.notify = patch.notify;
  const { error } = await sb().from("profiles").update(row).eq("id", data.user?.id ?? "");
  if (error) throw friendly(error);
  await refresh("team");
}
export async function inviteUser(email: string, role: Role) { await edge("admin-users", { action: "invite", email, role }); await refresh("team"); }
export async function updateUser(id: string, patch: { role?: Role; active?: boolean }) { await edge("admin-users", { action: "update", user_id: id, ...patch }); await refresh("team"); }

export async function updateSettings(patch: Partial<Settings>) {
  const { channels: _c, ...rest } = patch; void _c; // canais: Configurações › Canais (admin) e Vault
  if (Object.keys(rest).length) await rpc("update_settings", { p_patch: rest });
  await refresh("catalog");
}
export async function saveStages(next: Stage[]) { await rpc("save_stages", { p_stages: next.map((s) => ({ id: s.id || null, name: s.name, chance: s.chance })) }); await refresh("catalog", "deals"); }
export async function createTag(name: string, color: TagColor): Promise<Tag> {
  const { data, error } = await sb().from("tags").insert({ name: name.trim(), color }).select("id, name, color").single();
  if (error) throw error.code === "23505" ? new Error("Já existe uma tag com este nome.") : friendly(error);
  await refresh("catalog");
  return data as Tag;
}
export async function updateTag(id: string, patch: Partial<Omit<Tag, "id">>) {
  const { error } = await sb().from("tags").update(patch).eq("id", id);
  if (error) throw error.code === "23505" ? new Error("Já existe uma tag com este nome.") : friendly(error);
  await refresh("catalog");
}
export async function saveProduct(p: Omit<Product, "id"> & { id?: string }) {
  const row = { name: p.name, category: p.category, price: p.price };
  const { error } = p.id ? await sb().from("products").update(row).eq("id", p.id) : await sb().from("products").insert(row);
  if (error) throw friendly(error);
  await refresh("catalog");
}
export async function saveQuickReply(p: Omit<QuickReply, "id"> & { id?: string }) {
  const row = { shortcut: p.shortcut, text: p.text, audience: p.who };
  const { error } = p.id ? await sb().from("quick_replies").update(row).eq("id", p.id) : await sb().from("quick_replies").insert(row);
  if (error) throw error.code === "23505" ? new Error("Este atalho já existe.") : friendly(error);
  await refresh("catalog");
}
export async function deleteQuickReply(id: string) { const { error } = await sb().from("quick_replies").delete().eq("id", id); if (error) throw friendly(error); await refresh("catalog"); }
/** Submete o modelo à Meta (fica "Em análise" até o webhook de aprovação). */
export async function saveTemplate(p: Pick<Template, "name" | "category" | "body">) {
  const channel = db.settings.channels.find((c) => c.type === "whatsapp");
  if (!channel) throw new Error("Cadastre um número de WhatsApp antes.");
  const name = p.name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  await edge("meta-templates", { action: "create", channel_id: channel.id, name, category: p.category === "Marketing" ? "marketing" : "utilidade", body: p.body });
  await refresh("catalog");
}
export async function syncTemplates() { const r = await edge<{ synced: number }>("meta-templates", { action: "sync" }); await refresh("catalog"); return r.synced; }

// ---------------------------------------------------------------- contatos
export interface NewContactInput { name: string; channel: ChannelType; handle: string; city: string; email?: string; ownerId: string | null }
export async function createContact(p: NewContactInput): Promise<Contact> {
  const id = await rpc<string>("create_contact", { p_name: p.name, p_channel: p.channel, p_handle: p.handle, p_city: p.city, p_email: p.email ?? null, p_owner_id: p.ownerId });
  await refresh("contacts");
  return db.contacts.find((c) => c.id === id)!;
}
export async function importContacts(rows: Omit<NewContactInput, "ownerId">[]) {
  const r = await rpc<{ added: number; skipped: number }>("import_contacts", { p_rows: rows });
  await refresh("contacts");
  return { added: r.added, skipped: r.skipped };
}
export async function updateContact(id: string, patch: Partial<Pick<Contact, "name" | "city" | "phone" | "instagram" | "email">>) { await rpc("update_contact", { p_id: id, p_patch: patch }); await refresh("contacts"); }
export async function setContactTags(id: string, tagIds: string[]) { await rpc("set_contact_tags", { p_id: id, p_tag_ids: tagIds }); await refresh("contacts"); }
export async function addTagToContacts(ids: string[], tagId: string) { await rpc("add_tag_to_contacts", { p_ids: ids, p_tag_id: tagId }); await refresh("contacts"); }
export async function addToList(ids: string[], list: string) { await rpc("add_to_list", { p_ids: ids, p_list: list }); await refresh("contacts"); }
export async function assignContacts(ids: string[], ownerId: string) { await rpc("assign_contacts", { p_ids: ids, p_owner_id: ownerId }); await refresh("contacts", "deals", "conversations"); }
export async function claimContact(id: string) { await rpc("claim_contact", { p_id: id }); await refresh("contacts", "deals", "conversations"); }
export async function setConsent(id: string, status: Contact["consent"]["status"], origin: string) { await rpc("set_consent", { p_id: id, p_status: status, p_origin: origin }); await refresh("contacts"); }
export async function mergeContacts(keepId: string, otherId: string) { await rpc("merge_contacts", { p_keep: keepId, p_other: otherId }); await refresh("contacts", "deals", "conversations", "tasks"); }
export async function deleteContact(id: string) { await edge("lgpd", { action: "delete_contact", contact_id: id }); await refresh("contacts", "deals", "conversations", "tasks"); }
export const exportContactData = (id: string) => edge<Row>("lgpd", { action: "export", contact_id: id });
export async function anonymizeContact(id: string, reason: string) { await edge("lgpd", { action: "anonymize", contact_id: id, reason }); await refresh("contacts", "deals", "conversations"); }

// ---------------------------------------------------------------- negócios
export interface NewDealInput { contactId?: string; newContact?: { name: string; channel: ChannelType; handle: string; city: string }; productId: string; value: number; ownerId: string; stageId: string; tagId?: string }
export async function createDeal(p: NewDealInput) {
  const id = await rpc<string>("create_deal", { p: { contact_id: p.contactId ?? null, new_contact: p.newContact ?? null, product_id: p.productId, value: p.value, owner_id: p.ownerId, stage_id: p.stageId, tag_id: p.tagId ?? null } });
  await refresh("contacts", "deals");
  return id;
}
export async function moveDeal(id: string, stageId: string, finalValue?: number) { await rpc("move_deal", { p_id: id, p_stage_id: stageId, p_final_value: finalValue ?? null }); await refresh("deals"); }
export async function loseDeal(id: string, reason: string) { await rpc("lose_deal", { p_id: id, p_reason: reason }); await refresh("deals"); }
export async function setExpectedClose(id: string, date: string | null) { await rpc("set_expected_close", { p_id: id, p_date: date }); await refresh("deals"); }
export async function addNote(id: string, text: string) { await rpc("add_deal_note", { p_id: id, p_text: text }); await refresh("deals"); }
export async function deleteDeal(id: string) { await rpc("delete_deal", { p_id: id }); await refresh("deals", "tasks"); }

// ---------------------------------------------------------------- tarefas
export type TaskInput = Omit<Task, "id" | "doneAt">;
const taskRow = (p: TaskInput) => ({ title: p.title, type: p.type, deal_id: p.dealId ?? null, contact_id: p.contactId ?? null, due_at: p.dueAt, owner_id: p.ownerId });
export async function createTask(p: TaskInput) {
  const { data, error } = await sb().from("tasks").insert(taskRow(p)).select("id").single();
  if (error) throw friendly(error, "Não foi possível salvar a tarefa.");
  await refresh("tasks");
  return data.id as string;
}
export async function updateTask(id: string, p: TaskInput) { const { error } = await sb().from("tasks").update(taskRow(p)).eq("id", id); if (error) throw friendly(error); await refresh("tasks"); }
export async function setTaskDone(id: string, done: boolean) { const { error } = await sb().from("tasks").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id); if (error) throw friendly(error); await refresh("tasks"); }
export async function deleteTask(id: string) { const { error } = await sb().from("tasks").delete().eq("id", id); if (error) throw friendly(error); await refresh("tasks"); }

// ---------------------------------------------------------------- campanhas
export async function saveAudience(name: string, audience: Audience): Promise<SavedAudience> {
  const { data, error } = await sb().from("saved_audiences").insert({ name, audience }).select("*").single();
  if (error) throw error.code === "23505" ? new Error("Já existe um público com este nome.") : friendly(error);
  await refresh("campaigns");
  return { id: data.id, name: data.name, audience: data.audience, updatedAt: data.updated_at };
}
export async function saveCampaignDraft(d: CampaignDraft & { audienceLabel: string }) {
  const savedAt = new Date().toISOString();
  const row = {
    name: d.name, sender_channel_id: d.senderId || null, audience: d.audience, audience_label: d.audienceLabel, template_id: d.templateId || null,
    vars: d.vars, replies: d.replies, send_mode: d.when, scheduled_at: d.scheduledAt ? new Date(d.scheduledAt).toISOString() : null, saved_at: savedAt,
  };
  const { data, error } = d.id && db.campaigns.some((c) => c.id === d.id)
    ? await sb().from("campaigns").update(row).eq("id", d.id).select("id").single()
    : await sb().from("campaigns").insert(row).select("id").single();
  if (error || !data) throw error ? friendly(error, "Não foi possível salvar o rascunho.") : new Error("Esta campanha já foi confirmada e não pode mais ser editada.");
  await refresh("campaigns");
  return { id: data.id as string, savedAt };
}
/** O servidor revalida modelo, número e consentimento de cada contato antes de fixar a lista. */
export async function confirmCampaign(id: string, contactIds: string[], sendAt: string) {
  await rpc("confirm_campaign", { p_id: id, p_contact_ids: contactIds, p_send_at: sendAt });
  await refresh("campaigns");
}
export async function setCampaignStatus(id: string, status: "Pausada" | "Cancelada" | "retomar") {
  await rpc("set_campaign_status", { p_id: id, p_action: status === "Pausada" ? "pausar" : status === "Cancelada" ? "cancelar" : "retomar" });
  await refresh("campaigns");
}
export async function deleteCampaignDraft(id: string) {
  const { error } = await sb().from("campaigns").delete().eq("id", id);
  if (error) throw friendly(error);
  await refresh("campaigns");
}

// ---------------------------------------------------------------- conversas
export async function markRead(id: string) { await rpc("mark_conversation_read", { p_id: id }); await loadConversations([id]); changed(); }
export async function markUnread(id: string) { await rpc("mark_conversation_unread", { p_id: id }); await loadConversations([id]); changed(); }
export async function setClosed(id: string, closed: boolean) { await rpc("set_conversation_closed", { p_id: id, p_closed: closed }); await loadConversations([id]); changed(); }
export async function deleteConversation(id: string) { await edge("lgpd", { action: "delete_conversation", conversation_id: id }); await refresh("conversations"); }

const MEDIA_KIND: Record<Attachment["type"], "image" | "audio" | "video" | "document"> = { imagem: "image", audio: "audio", video: "video", pdf: "document" };
/** Sobe o anexo escolhido na tela para outbound/<conversa>/ (a política do Storage confere a permissão). */
async function uploadAttachment(conversationId: string, a: Attachment) {
  if (!a.url) throw new Error("Anexo indisponível. Escolha o arquivo de novo.");
  const blob = await (await fetch(a.url)).blob();
  const safe = a.name.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
  const path = `outbound/${conversationId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await sb().storage.from("chat-media").upload(path, blob, { contentType: blob.type || "application/octet-stream" });
  if (error) throw new Error("Não foi possível enviar o anexo.");
  return { storage_path: path, kind: MEDIA_KIND[a.type], mime_type: blob.type || "application/octet-stream", file_name: a.name, size_bytes: blob.size };
}

export interface SendPayload { kind: "equipe" | "nota"; text: string; attachment?: Attachment; templateId?: string }
export async function sendMessage(conversationId: string, p: SendPayload) {
  const body: Row = { conversation_id: conversationId, client_id: crypto.randomUUID(), kind: p.kind };
  if (p.kind === "nota") body.text = p.text;
  else if (p.templateId) {
    const v = db.conversations.find((x) => x.id === conversationId), c = db.contacts.find((x) => x.id === v?.contactId);
    const deal = db.deals.filter((d) => d.contactId === c?.id && d.status !== "perdido").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    body.template = { id: p.templateId, params: { nome: c?.name.split(" ")[0] ?? "", produto: (deal?.title ?? "nossa linha outdoor").toLowerCase() } };
  } else {
    if (p.text) body.text = p.text;
    if (p.attachment) body.media = await uploadAttachment(conversationId, p.attachment);
  }
  try { await edge("send-message", body); }
  finally { await loadConversations([conversationId]); changed(); } // mostra também a mensagem que falhou, com o motivo
}

/* Canais (admin): identificadores públicos na tabela, token só no Vault via RPC. */
export interface NewChannelInput { type: "whatsapp" | "instagram"; name: string; handle: string; phoneNumberId?: string; wabaId?: string; igUserId?: string; pageId?: string; igApi?: "instagram_login" | "facebook_login"; token?: string }
export async function addChannel(p: NewChannelInput) {
  const row: Record<string, unknown> = p.type === "whatsapp"
    ? { type: p.type, name: p.name, handle: p.handle, status: p.token ? "conectado" : "pendente", phone_number_id: p.phoneNumberId, waba_id: p.wabaId }
    : { type: p.type, name: p.name, handle: p.handle, status: p.token ? "conectado" : "pendente", ig_user_id: p.igUserId, page_id: p.pageId || null, ig_api: p.igApi ?? "instagram_login" };
  const { data, error } = await sb().from("channels").insert(row).select("id").single();
  if (error) throw error.code === "23505" ? new Error("Este número ou conta já está cadastrado.") : error.code === "23514" ? new Error("Confira os IDs: use só números.") : friendly(error);
  if (p.token) await rpc("admin_set_channel_token", { p_channel_id: data.id, p_token: p.token });
  await refresh("catalog");
}
export async function setChannelToken(id: string, token: string) {
  await rpc("admin_set_channel_token", { p_channel_id: id, p_token: token });
  const { error } = await sb().from("channels").update({ status: "conectado" }).eq("id", id);
  if (error) throw friendly(error);
  await refresh("catalog");
}
export async function setChannelActive(id: string, active: boolean) {
  const { error } = await sb().from("channels").update({ status: active ? "conectado" : "desativado" }).eq("id", id);
  if (error) throw friendly(error);
  await refresh("catalog");
}
export async function deleteChannel(id: string) {
  const { error } = await sb().from("channels").delete().eq("id", id);
  if (error) throw error.code === "23503" ? new Error("Este canal já tem conversas ou modelos. Desative em vez de excluir.") : friendly(error);
  await refresh("catalog");
}
