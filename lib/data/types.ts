export type Role = "vendedor" | "gestor" | "admin";
export type ChannelType = "whatsapp" | "instagram";
export const TAG_COLORS = ["neutro", "areia", "champanhe", "oliva", "floresta", "lago", "vinho", "grafite"] as const;
export type TagColor = (typeof TAG_COLORS)[number];
export const TAG_COLOR_LABEL: Record<TagColor, string> = { neutro: "Neutro", areia: "Areia", champanhe: "Champanhe", oliva: "Oliva", floresta: "Floresta", lago: "Lago", vinho: "Vinho", grafite: "Grafite" };
export const ORIGINS = ["Anúncio do Meta", "Instagram", "Indicação", "Site", "Showroom", "Arquiteto parceiro"] as const;
export const TASK_TYPES = ["Retorno", "Visita ao showroom", "Visita técnica", "Enviar orçamento"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export interface User { id: string; name: string; email: string; role: Role; title: string; avatar: TagColor; active: boolean; photo?: string; notify: { mensagens: boolean; tarefas: boolean; resumo: boolean } }
export interface Tag { id: string; name: string; color: TagColor }
export interface Product { id: string; name: string; category: string; price: number }
export interface Stage { id: string; name: string; chance: number }
export interface Consent { status: "autorizado" | "sem" | "saiu"; date?: string; origin?: string }
export interface Contact { id: string; name: string; channels: ChannelType[]; phone?: string; instagram?: string; email?: string; city: string; ownerId: string | null; tagIds: string[]; lastContactAt: string; consent: Consent; lists: string[] }
export interface Note { id: string; authorId: string; text: string; at: string }
export interface HistoryEvent { id: string; at: string; text: string; authorId?: string }
export interface Deal {
  id: string; contactId: string; productId: string; title: string; channel: ChannelType; value: number; ownerId: string | null; stageId: string; status: "aberto" | "ganho" | "perdido";
  /** índice da etapa mais avançada já alcançada (0 a 4) */
  reached: number; origin: string; ad?: string; campaignId?: string; createdAt: string; closedAt?: string; lostReason?: string;
  lastMessageAt: string; /** data prevista de fechamento, "AAAA-MM-DD" */ expectedCloseAt?: string; firstReplyMin: number; avgReplyMin: number; notes: Note[]; history: HistoryEvent[];
}
export interface Attachment { type: "pdf" | "imagem" | "audio" | "video"; name: string; pages?: number; size?: string; seconds?: number; url?: string }
/** "enviando"/"falhou" só existem com o backend (fila de envio da Meta); `error` traz o motivo da falha. */
export interface Message { id: string; kind: "cliente" | "equipe" | "nota"; authorId?: string; text: string; at: string; status?: "enviando" | "enviada" | "entregue" | "lida" | "falhou"; error?: string; attachment?: Attachment }
export interface Conversation { id: string; contactId: string; channel: ChannelType; messages: Message[]; unread: number; closed: boolean }
export interface Task { id: string; title: string; type: TaskType; dealId?: string; contactId?: string; dueAt: string; ownerId: string; doneAt?: string }
export interface QuickReply { id: string; shortcut: string; text: string; who: "todos" | "gestor" }
export interface Template { id: string; name: string; label?: string; language: string; channelId: string; category: "Marketing" | "Utilidade"; status: "Aprovado" | "Em análise" | "Rejeitado"; body: string; reason?: string; header?: { type: "imagem" | "pdf"; name: string }; buttons: string[] }
export interface RuleItem { id: string; type: string; value: string }
/* Fluxo de automação: a ordem de execução vem só das conexões, nunca da posição. */
export type NodeKind = "gatilho" | "condicao" | "acao" | "atraso" | "fim";
export type Out = "next" | "sim" | "nao";
export interface FlowNode { id: string; kind: NodeKind; type: string; config: Record<string, string>; rules?: RuleItem[]; x: number; y: number }
export interface FlowEdge { id: string; source: string; out: Out; target: string }
export interface Flow { nodes: FlowNode[]; edges: FlowEdge[]; /** blocos reposicionados à mão */ manual?: boolean }
export type AutomationStatus = "rascunho" | "ativa" | "pausada";
export interface AutomationRun { id: string; at: string; contactName: string; actions: string[]; failure?: string; version?: number }
export interface Automation { id: string; name: string; status: AutomationStatus; draft: Flow; /** versão em execução; o rascunho não a altera */ published?: Flow; version: number; activatedAt?: string; savedAt?: string; runs: AutomationRun[] }
export type RecipientStatus = "Na fila" | "Enviada" | "Entregue" | "Lida" | "Respondeu" | "Saiu" | "Falhou";
export interface CampaignRecipient { contactId: string; name: string; phone: string; status: RecipientStatus }
export type CampaignStatus = "Rascunho" | "Agendada" | "Enviando" | "Concluída" | "Pausada" | "Cancelada";
/* Público de campanha: critérios dinâmicos, recalculados até a confirmação */
export type AudField = "etapa" | "tag" | "produto" | "cidade" | "responsavel" | "interacao" | "origem" | "lista";
export type AudOp = "inclui" | "exclui" | "ultimos" | "mais_de" | "entre" | "nunca";
export interface AudRule { id: string; field: AudField; op: AudOp; values: string[]; n?: number; from?: string; to?: string }
export interface Audience { savedId?: string; match: "todas" | "qualquer"; rules: AudRule[]; excludeTags: string[]; excludeAudiences: string[]; excludeContacts: string[] }
export interface SavedAudience { id: string; name: string; audience: Audience; updatedAt: string }
export type VarMap = Record<string, { source: string; fixed?: string; fallback?: string }>;
export interface ReplyRules { owner: "manter" | "transferir"; ownerId: string; replyTagId: string; buttons: { text: string; action: "nada" | "tag" | "automacao"; value: string }[] }
export interface CampaignDraft { id?: string; name: string; senderId: string; audience: Audience; templateId: string; vars: VarMap; replies: ReplyRules; when: "agora" | "agendar"; scheduledAt: string }
export interface Campaign extends CampaignDraft { id: string; status: CampaignStatus; audienceLabel: string; recipients: CampaignRecipient[]; savedAt?: string; confirmedAt?: string; confirmedBy?: string; costPerMessage?: number | null }
export interface Channel { id: string; type: ChannelType; account: string; handle: string; status: "Conectado" | "Pendente" | "Erro" | "Desativado"; quality: string; limit: string }
export interface MonthGoal { team: number | null; superGoal: number | null; sellers: Record<string, number> }
export interface Settings {
  hours: { open: string; close: string; days: string }; offMessage: string; limits: { windowH: number; replyH: number; stalledD: number; firstReplyMin: number };
  /** metas por mês ("2026-11"); null = sem meta */ goalsByMonth: Record<string, MonthGoal>; priorityOrder: string[]; /** tarifas por mensagem; null = não configurada */ costs: { marketing: number | null; utilidade: number | null; aiMonthly: number; updatedAt?: string };
  distribution: { mode: "rodizio" | "livre"; members: string[] }; lossReasons: string[]; channels: Channel[];
}
export interface AiLead { dealId?: string; contactId: string; channel: ChannelType; name: string; wait: string; value: number }
export type AiBlock =
  | { type: "texto"; text: string }
  | { type: "topicos"; items: string[] }
  | { type: "tabela"; head: string[]; rows: string[][] }
  | { type: "leads"; items: AiLead[]; done?: string }
  | { type: "tarefa"; title: string; when: string }
  | { type: "resposta"; text: string; conversationId?: string };
export interface AiMessage { id: string; from: "user" | "ai"; at: string; text?: string; blocks?: AiBlock[]; error?: boolean; question?: string }
export interface AiThread { id: string; title: string; at: string; messages: AiMessage[] }

/* Visões com as relações resolvidas (no Supabase serão joins) */
export interface DealView extends Deal { contact: Contact; owner: User | null; tags: Tag[]; product: Product; stage: Stage; stageIndex: number; conversationId?: string; waitingSince?: string; outOfWindow: boolean; nextTask?: Task }
export interface ConversationView extends Conversation { contact: Contact; owner: User | null; tags: Tag[]; deal?: DealView; last?: Message; waitingSince?: string; windowEndsAt?: string }
export interface TaskView extends Task { owner: User; contact?: Contact; deal?: Deal }
export interface ContactView extends Contact { owner: User | null; tags: Tag[]; dealCount: number; stageId?: string; productIds: string[] }
