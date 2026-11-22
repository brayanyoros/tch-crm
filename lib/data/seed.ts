/* Dados de exemplo. Só lib/data/db.ts importa este arquivo; as telas usam os repositórios. */
import { now, MIN, HOUR, DAY, money } from "../format";
import type { Automation, AutomationRun, Campaign, CampaignRecipient, ChannelType, Contact, Conversation, Deal, HistoryEvent, Message, Product, QuickReply, RecipientStatus, Settings, Stage, Tag, Task, Template, User } from "./types";

const NOW = now().getTime();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const at = (d: number, h: number, m = 0, month = 11) => new Date(2026, month - 1, d, h, m).toISOString();
let seedState = 7;
const rnd = () => { seedState |= 0; seedState = (seedState + 0x6d2b79f5) | 0; let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const shuffle = <T,>(a: T[]): T[] => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
let seq = 0;
const id = (p: string) => `${p}${++seq}`;
const slug = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]+/g, ".");

const notify = { mensagens: true, tarefas: true, resumo: false };
export const users: User[] = [
  { id: "ana", name: "Ana Ribeiro", email: "ana@tchexperiencia.com.br", role: "vendedor", title: "Vendedora · Showroom", avatar: "preto", active: true, notify: { ...notify } },
  { id: "bruno", name: "Bruno Medeiros", email: "bruno@tchexperiencia.com.br", role: "vendedor", title: "Vendedor · Showroom", avatar: "areia", active: true, notify: { ...notify } },
  { id: "camila", name: "Camila Souza", email: "camila@tchexperiencia.com.br", role: "vendedor", title: "Vendedora · Showroom", avatar: "contorno", active: true, notify: { ...notify } },
  { id: "rafael", name: "Rafael Monteiro", email: "rafael@tchexperiencia.com.br", role: "gestor", title: "Gestor · Comercial", avatar: "grafite", active: true, notify: { ...notify, resumo: true } },
  { id: "brayan", name: "Brayan", email: "brayan@tchexperiencia.com.br", role: "admin", title: "Administrador", avatar: "preto", active: true, notify: { ...notify, resumo: true } },
];
export const tags: Tag[] = [
  { id: "showroom", name: "Showroom", color: "champanhe" }, { id: "arquiteto", name: "Arquiteto", color: "lago" }, { id: "prioridade", name: "Prioridade", color: "vinho" },
  { id: "retorno", name: "Retorno", color: "areia" }, { id: "indicacao", name: "Indicação", color: "floresta" }, { id: "visita", name: "Visita agendada", color: "oliva" },
  { id: "anuncio", name: "Anúncio", color: "neutro" }, { id: "condominio", name: "Condomínio", color: "grafite" }, { id: "pousada", name: "Pousada", color: "areia" },
  { id: "instalacao", name: "Instalação 03/12", color: "oliva" }, { id: "entregue", name: "Entregue", color: "floresta" }, { id: "sauna", name: "Sauna", color: "champanhe" },
];
export const products: Product[] = [
  { id: "vapor4", name: "Sauna a vapor 4 pessoas", category: "Saunas", price: 38900 },
  { id: "seca6", name: "Sauna seca finlandesa 6 pessoas", category: "Saunas", price: 52300 },
  { id: "barril4", name: "Sauna barril 4 pessoas", category: "Saunas", price: 34700 },
  { id: "ofuro", name: "Ofurô em cedro 2 pessoas", category: "Banheiras", price: 17800 },
  { id: "imersao", name: "Banheira de imersão", category: "Banheiras", price: 21500 },
  { id: "hidro", name: "Banheira de hidromassagem externa", category: "Banheiras", price: 29400 },
  { id: "firepit", name: "Fire pit em aço corten", category: "Fire pits", price: 6800 },
  { id: "lounge", name: "Fire pit e lounge para deck", category: "Fire pits", price: 41200 },
  { id: "moveis", name: "Conjunto de móveis outdoor", category: "Mobiliário", price: 14200 },
  { id: "espreguicadeiras", name: "Par de espreguiçadeiras em teca", category: "Mobiliário", price: 9700 },
  { id: "banco", name: "Banco curvo para fire pit", category: "Mobiliário", price: 4400 },
  { id: "combo", name: "Sauna e banheira de imersão", category: "Combinações", price: 86500 },
];
export const stages: Stage[] = [
  { id: "novo", name: "Novo contato", chance: 10 }, { id: "atendimento", name: "Em atendimento", chance: 25 }, { id: "proposta", name: "Proposta enviada", chance: 50 },
  { id: "negociacao", name: "Negociação", chance: 75 }, { id: "ganho", name: "Fechado ganho", chance: 100 },
];
export const contacts: Contact[] = [];
export const deals: Deal[] = [];
export const conversations: Conversation[] = [];

const CITIES = ["Teresópolis", "Petrópolis", "Nova Friburgo", "Rio de Janeiro", "Niterói", "Itaipava", "Guapimirim", "Juiz de Fora", "Búzios"];
const ADS = ["Sauna a vapor | Serra", "Banheira de imersão | Reels", "Fire pit corten | Carrossel", "Outdoor completo | Vídeo"];
const ORIG = ["Anúncio do Meta", "Anúncio do Meta", "Instagram", "Indicação", "Site", "Showroom", "Arquiteto parceiro"];
const REASONS = ["Preço", "Preço", "Prazo", "Sumiu", "Sumiu", "Concorrente", "Outro"];
const AVG: Record<string, number> = { ana: 7, bruno: 10, camila: 11 };
const jitter: Record<string, number> = {};

function contact(name: string, channel: ChannelType, ownerId: string | null, tagIds: string[], lastAgo: number, over: Partial<Contact> = {}): Contact {
  const r = rnd();
  const n = contacts.length;
  const phone = `(${r < 0.8 ? 21 : 24}) 9${8000 + ((n * 137) % 1999)}-${String(1000 + ((n * 2711) % 8999))}`;
  const c: Contact = {
    id: id("c"), name, channels: [channel], city: pick(CITIES), ownerId, tagIds, lastContactAt: iso(lastAgo),
    ...(channel === "whatsapp" ? { phone } : { instagram: "@" + slug(name), ...(r < 0.35 ? { phone } : {}) }),
    ...(r < 0.5 ? { email: `${slug(name)}@gmail.com` } : {}),
    consent: r < 0.68 ? { status: "autorizado", date: iso(lastAgo + 2 * DAY), origin: channel === "whatsapp" ? "Mensagem no WhatsApp" : "Formulário do anúncio" } : r < 0.94 ? { status: "sem" } : { status: "saiu", date: iso(lastAgo), origin: "Respondeu SAIR" },
    lists: [], ...over,
  };
  contacts.push(c);
  return c;
}
function history(createdAt: string, reached: number, endMs: number, ownerId: string | null, channel: ChannelType): HistoryEvent[] {
  const start = new Date(createdAt).getTime();
  const step = Math.max(HOUR / 2, (endMs - start) / (reached + 1));
  const ev: HistoryEvent[] = [{ id: id("h"), at: createdAt, text: `Lead criado pelo ${channel === "whatsapp" ? "WhatsApp" : "Instagram"}` }];
  for (let i = 1; i <= reached; i++) ev.push({ id: id("h"), at: new Date(Math.min(start + step * i, NOW)).toISOString(), text: `Etapa: ${stages[i - 1].name} → ${stages[i].name}`, authorId: ownerId ?? undefined });
  return ev;
}
interface DealIn { c: Contact; channel: ChannelType; p: string; value?: number; owner: string; st: number; status?: Deal["status"]; created: string; last: number; closed?: string; origin?: string; lost?: string; campaignId?: string }
function deal(o: DealIn): Deal {
  const prod = products.find((x) => x.id === o.p)!;
  const j = jitter[o.owner] ?? 0;
  jitter[o.owner] = j ? 0 : 1 + Math.floor(rnd() * 4);
  const reply = AVG[o.owner] + (j ? -j : jitter[o.owner]);
  const origin = o.origin ?? (o.c.tagIds.includes("anuncio") ? "Anúncio do Meta" : o.c.tagIds.includes("indicacao") ? "Indicação" : o.c.tagIds.includes("arquiteto") ? "Arquiteto parceiro" : o.c.tagIds.includes("showroom") ? "Showroom" : pick(ORIG));
  const d: Deal = {
    id: id("d"), contactId: o.c.id, productId: prod.id, title: prod.name, channel: o.channel, value: o.value ?? prod.price, ownerId: o.owner, stageId: stages[o.st].id, status: o.status ?? (o.st === 4 ? "ganho" : "aberto"), reached: o.st,
    origin, ...(origin === "Anúncio do Meta" ? { ad: prod.category === "Saunas" ? ADS[0] : prod.category === "Banheiras" ? ADS[1] : prod.category === "Fire pits" ? ADS[2] : ADS[3] } : {}),
    createdAt: o.created, closedAt: o.closed, lostReason: o.lost, campaignId: o.campaignId, lastMessageAt: iso(o.last), firstReplyMin: reply, avgReplyMin: reply + 4 + Math.floor(rnd() * 9), notes: [],
    history: history(o.created, o.st, o.closed ? new Date(o.closed).getTime() : NOW - o.last, o.owner, o.channel),
  };
  if (o.lost) d.history.push({ id: id("h"), at: o.closed!, text: `Marcado como perdido: ${o.lost}`, authorId: o.owner });
  deals.push(d);
  return d;
}

/* ---------- funil do mês: 38 negócios ---------- */
const W: ChannelType = "whatsapp", I: ChannelType = "instagram";
type Row = [name: string, ch: ChannelType, product: string, value: number, owner: string, lastAgo: number, tag: string, stage: number];
const H = HOUR, M = MIN;
const rows: Row[] = [
  ["Juliana Prates", I, "ofuro", 17800, "bruno", 44 * M, "indicacao", 0], ["Thiago Moura", I, "imersao", 21500, "bruno", 65 * M, "anuncio", 0],
  ["Rodrigo Saldanha", W, "hidro", 29400, "camila", 192 * M, "condominio", 0], ["Sérgio Antunes", W, "hidro", 29400, "ana", 160 * M, "anuncio", 0],
  ["Larissa Fontes", I, "firepit", 6800, "ana", 5 * H, "anuncio", 0], ["Otávio Guerra", W, "imersao", 21500, "camila", 7 * H, "indicacao", 0],
  ["Mônica Alvarenga", I, "ofuro", 17800, "bruno", 9 * H, "anuncio", 0], ["Paulo Sérgio Viana", W, "banco", 4400, "ana", 18 * H, "showroom", 0],
  ["Patrícia Nogueira", I, "imersao", 21500, "bruno", 2 * H, "visita", 1], ["Carlos Eduardo Brandão", W, "firepit", 6800, "camila", 25 * H, "retorno", 1],
  ["Fernanda Lacerda", W, "seca6", 52300, "ana", 5 * H, "arquiteto", 1], ["Adriano Peixoto", W, "barril4", 34700, "bruno", 4 * H, "anuncio", 1],
  ["Vanessa Moreira", W, "vapor4", 38900, "camila", 6 * H, "showroom", 1], ["Leonardo Teles", I, "imersao", 21500, "ana", 8 * H, "visita", 1],
  ["Cristina Amaral", W, "ofuro", 17800, "camila", 11 * H, "condominio", 1], ["Felipe Arantes", I, "moveis", 14200, "bruno", 16 * H, "pousada", 1],
  ["Simone Garcez", W, "hidro", 29400, "ana", 20 * H, "indicacao", 1], ["Roberto Falcão", W, "espreguicadeiras", 9700, "camila", 22 * H, "showroom", 1], ["Tatiana Veloso", I, "ofuro", 17100, "bruno", 30 * H, "retorno", 1],
  ["Marcelo Tavares", W, "vapor4", 38900, "ana", 12 * M, "showroom", 2], ["Henrique Mattos", W, "barril4", 34700, "bruno", 6 * H, "arquiteto", 2], ["Renata Figueiredo", I, "moveis", 14200, "ana", 50 * H, "pousada", 2],
  ["André Vasconcelos", W, "vapor4", 38900, "bruno", 10 * H, "condominio", 2], ["Isabela Quintanilha", W, "hidro", 29400, "camila", 19 * H, "visita", 2], ["Mauro Siqueira", I, "moveis", 15200, "ana", 28 * H, "pousada", 2],
  ["Luciana Bastos", W, "combo", 86500, "camila", 27 * M, "prioridade", 3], ["Gustavo Rezende", I, "lounge", 41200, "ana", 26 * H + 22 * M, "retorno", 3],
  ["Eliane Drummond", W, "seca6", 52300, "bruno", 7 * H, "arquiteto", 3], ["João Pedro Nolasco", W, "barril4", 32400, "camila", 13 * H, "visita", 3],
  ["Beatriz Coutinho", W, "imersao", 22900, "bruno", 4 * DAY, "instalacao", 4], ["Eduardo Pinheiro", I, "firepit", 7400, "camila", 6 * DAY, "entregue", 4],
  ["Marina Sampaio", W, "ofuro", 18600, "ana", 3 * DAY, "instalacao", 4], ["Alexandre Porto", W, "moveis", 12900, "ana", 8 * DAY, "entregue", 4], ["Cláudia Werneck", I, "espreguicadeiras", 9700, "ana", 9 * DAY, "entregue", 4],
  ["Fábio Monnerat", W, "banco", 5200, "bruno", 7 * DAY, "entregue", 4], ["Denise Carvalhal", W, "banco", 4500, "bruno", 10 * DAY, "entregue", 4],
  ["Rogério Pacheco", W, "moveis", 8300, "camila", 5 * DAY, "entregue", 4], ["Sílvia Barcellos", I, "firepit", 6800, "camila", 11 * DAY, "entregue", 4],
];
const WAITING: Record<string, string> = {
  "Gustavo Rezende": "Conseguem melhorar a condição à vista? Quero fechar o deck ainda este mês.", "Rodrigo Saldanha": "O condomínio pede laudo elétrico. Vocês fornecem?",
  "Sérgio Antunes": "Essa hidro cabe num deck de 2,40 x 2,40?", "Thiago Moura": "Vi no anúncio. A banheira já vem com aquecedor?",
  "Juliana Prates": "Oi! A Marina me indicou vocês. O ofurô aguenta ficar no tempo?", "Luciana Bastos": "Conversei com meu marido, vamos querer os dois. Como fica o parcelamento?",
};
const VARIED: string[][] = [
  ["Vocês atendem {city}?", "Atendemos sim, {city} está na nossa rota de entrega. Posso montar um orçamento com frete."],
  ["Tem esse modelo montado no showroom para eu ver?", "Tem, sim. O showroom fica na Prata, em Teresópolis, e abre de segunda a sábado, das 9h às 18h."],
  ["Preciso de alguma obra antes de receber?", "Só um piso nivelado e o ponto elétrico. Nossa equipe técnica confirma tudo na visita."],
  ["Qual a garantia?", "A estrutura tem 5 anos de garantia e os equipamentos, 2 anos."],
];
const mk = (kind: Message["kind"], text: string, ms: number, extra: Partial<Message> = {}): Message => ({ id: id("m"), kind, text, at: iso(ms), ...extra });

for (const [name, ch, p, value, owner, last, tag, st] of rows) {
  const c = contact(name, ch, owner, name === "Marcelo Tavares" ? [tag, "anuncio"] : [tag], last, name === "Marcelo Tavares" ? { phone: "(21) 98741-2263", city: "Teresópolis", consent: { status: "autorizado", date: at(21, 19, 58), origin: "Mensagem no WhatsApp" } } : name === "Juliana Prates" ? { city: "Petrópolis" } : {});
  const won = st === 4;
  const created = name === "Marcelo Tavares" ? at(21, 19, 58) : won ? at(2 + (contacts.length % 5), 10 + (contacts.length % 7), 14) : iso(Math.min(20 * DAY, last + [2, 60, 130, 260][st] * HOUR * (st === 0 ? 1 : 0.6 + rnd() * 0.4)));
  const d = deal({ c, channel: ch, p, value, owner, st, created, last, closed: won ? at(9 + (contacts.length % 11), 11 + (contacts.length % 6), 30) : undefined, campaignId: name === "Eduardo Pinheiro" || name === "Rogério Pacheco" ? "camp1" : undefined, origin: name === "Marcelo Tavares" ? "Anúncio do Meta" : undefined });
  const prod = products.find((x) => x.id === p)!;
  const first = name.split(" ")[0];
  let messages: Message[];
  if (name === "Marcelo Tavares") {
    messages = [
      { id: id("m"), kind: "cliente", text: "Boa noite! Vi o anúncio da sauna a vapor para 4 pessoas. Qual o prazo de entrega aqui em Teresópolis?", at: at(21, 19, 58) },
      { id: id("m"), kind: "equipe", authorId: "ana", text: "Boa noite, Marcelo! Para Teresópolis o prazo é de 25 a 30 dias úteis após a confirmação do pedido.", at: at(21, 20, 6), status: "lida" },
      { id: id("m"), kind: "cliente", text: "Ótimo. A instalação está inclusa? Vai ficar numa área coberta, ao lado da piscina.", at: at(21, 20, 11) },
      { id: id("m"), kind: "nota", authorId: "ana", text: "Área coberta de 3 x 4 m. Bruno, confirma se o gerador de vapor precisa de ponto de água dedicado?", at: at(21, 20, 15) },
      { id: id("m"), kind: "equipe", authorId: "ana", text: "A instalação está inclusa num raio de 60 km do showroom. Segue o orçamento com os itens detalhados.", at: at(21, 20, 31), status: "lida", attachment: { type: "pdf", name: "Orçamento_Sauna_4p.pdf", pages: 2, size: "284 KB" } },
      { id: id("m"), kind: "cliente", text: "A voltagem é 220? Aqui em casa é bifásico.", at: at(21, 20, 44) },
      { id: id("m"), kind: "nota", authorId: "bruno", text: "220 V, com disjuntor exclusivo de 32 A. O ponto de água pode ser o mesmo da piscina, com registro próprio.", at: at(22, 13, 58) },
      { id: id("m"), kind: "equipe", authorId: "ana", text: "Isso, Marcelo: 220 V, com disjuntor exclusivo de 32 A. O ponto exato nós indicamos na visita técnica.", at: at(22, 14, 20), status: "entregue" },
    ];
    d.notes.push({ id: id("n"), authorId: "ana", text: "Quer instalar antes do Natal. Decide junto com a esposa.", at: at(21, 20, 35) });
  } else {
    const w = WAITING[name];
    const v = VARIED[contacts.length % VARIED.length].map((s) => s.replaceAll("{city}", c.city));
    const t0 = last + (w ? 3 : 2) * HOUR;
    messages = [
      mk("cliente", `Olá! Tenho interesse em ${prod.name.toLowerCase()}. Pode me passar o valor?`, w && st === 0 ? last + 9 * M : t0 + 40 * M),
      ...(w && st === 0 ? [mk("equipe", `Olá, ${first}! Aqui é da TCH Experiência. Já vou te passar os detalhes.`, last + 2 * M, { authorId: owner, status: "lida" })] : [
        mk("equipe", `Olá, ${first}! Esse modelo parte de ${money(prod.price)}, com instalação na região serrana. Qual é o espaço que você tem disponível?`, t0 + 32 * M, { authorId: owner, status: "lida" }),
        mk("cliente", "Uma área externa de uns 12 m², perto do deck.", t0 + 20 * M, name === "Fernanda Lacerda" ? { attachment: { type: "imagem", name: "deck-area-externa.jpg", size: "1,2 MB" } } : {}),
        ...(st >= 2 ? [mk("equipe", "Perfeito. Segue o orçamento com as medidas e as opções de acabamento.", t0 + 10 * M, { authorId: owner, status: "lida" as const, attachment: { type: "pdf" as const, name: `Orçamento_${first}.pdf`, pages: 2, size: "271 KB" } })] : []),
        mk("cliente", v[0], t0),
      ]),
      ...(w ? [...(st ? [mk("equipe", v[1], last + 70 * M, { authorId: owner, status: "lida" as const })] : []), mk("cliente", w, last)] : won ? [mk("equipe", `${first}, obrigado pela confiança. Qualquer dúvida no uso, é só chamar por aqui.`, last, { authorId: owner, status: "lida" })] : [mk("equipe", v[1], last, { authorId: owner, status: "lida" })]),
    ];
    if (name === "Luciana Bastos") messages.splice(-1, 0, mk("cliente", "", last + 4 * M, { attachment: { type: "audio", name: "Áudio", seconds: 23 } }));
  }
  conversations.push({ id: id("v"), contactId: c.id, channel: ch, messages, unread: name in WAITING ? (name === "Luciana Bastos" ? 2 : 1) : 0, closed: false });
}
const daniela = contact("Daniela Rocha", W, null, [], 18 * M, { city: "Guapimirim", consent: { status: "sem" } });
conversations.push({ id: id("v"), contactId: daniela.id, channel: W, unread: 1, closed: false, messages: [mk("cliente", "Boa tarde! Vocês abrem amanhã? Queria conhecer as saunas.", 18 * M)] });

/* ---------- negócios encerrados: completam 126 leads do mês (126 → 84 → 41 → 19 → 9) ---------- */
const FIRST = ["Aline", "Bernardo", "Caio", "Débora", "Elisa", "Flávio", "Gabriela", "Hugo", "Ivana", "Jorge", "Karina", "Lucas", "Márcia", "Nelson", "Olívia", "Pedro", "Raquel", "Samuel", "Teresa", "Ulisses", "Valéria", "Wagner", "Yasmin", "Zélia"];
const LAST = ["Abreu", "Bittencourt", "Castilho", "Dutra", "Evangelista", "Ferraz", "Guimarães", "Hermes", "Junqueira", "Lemos", "Macedo", "Novaes", "Paiva"];
let nameN = 0;
const nextName = () => { const n = nameN++; return `${FIRST[n % FIRST.length]} ${LAST[(n * 5 + Math.floor(n / FIRST.length) * 3) % LAST.length]}`; };
const SELLERS = ["ana", "bruno", "camila"];
const PIDS = products.map((p) => p.id);
const WEEK = [1, 1.1, 1, 1.15, 1.3, 1.6, 0.5]; // seg..dom
const randomAt = (d0: number, d1: number, month: number) => {
  for (;;) {
    const d = d0 + Math.floor(rnd() * (d1 - d0 + 1));
    const date = new Date(2026, month - 1, d);
    if (rnd() * 1.6 < WEEK[(date.getDay() + 6) % 7]) return new Date(2026, month - 1, d, rnd() < 0.55 ? 9 + Math.floor(rnd() * 9) : 18 + Math.floor(rnd() * 5), Math.floor(rnd() * 60)).toISOString();
  }
};
function closedLead(owner: string, ch: ChannelType, reached: number, created: string, won: boolean, seen: Set<string>) {
  let n = nextName();
  while (seen.has(n)) n = nextName() + " " + pick(["Neto", "Filho", "Lima", "Reis", "Dias"]);
  seen.add(n);
  const end = Math.min(new Date(created).getTime() + (1 + rnd() * 9) * DAY, new Date(created).getMonth() === 9 ? new Date(2026, 9, 31, 20).getTime() : Math.max(new Date(created).getTime() + HOUR / 2, NOW - (4 + rnd() * 66) * HOUR));
  const ago = NOW - end;
  const c = contact(n, ch, owner, rnd() < 0.5 ? [pick(["anuncio", "showroom", "arquiteto", "condominio", "pousada", "retorno"])] : [], ago);
  deal({ c, channel: ch, p: pick(PIDS), owner, st: won ? 4 : reached, status: won ? "ganho" : "perdido", created, last: ago, closed: new Date(end).toISOString(), lost: won ? undefined : pick(REASONS) });
}
const seen = new Set(contacts.map((c) => c.name));
const left = (total: Record<string, number>, f: (d: Deal) => boolean) => SELLERS.flatMap((s) => Array<string>(total[s] - deals.filter((d) => d.ownerId === s && f(d)).length).fill(s));
const propOwners = shuffle(left({ ana: 16, bruno: 14, camila: 11 }, (d) => d.reached >= 2));
const allOwners = left({ ana: 46, bruno: 42, camila: 38 }, () => true);
for (const o of propOwners) allOwners.splice(allOwners.indexOf(o), 1);
shuffle(allOwners);
const reachedList = [...Array<number>(6).fill(3), ...Array<number>(16).fill(2), ...Array<number>(32).fill(1), ...Array<number>(34).fill(0)];
const wa = 79 - deals.filter((d) => d.channel === W).length;
const chans = shuffle([...Array<ChannelType>(wa).fill(W), ...Array<ChannelType>(88 - wa).fill(I)]);
reachedList.forEach((r, i) => closedLead(i < 22 ? propOwners[i] : allOwners[i - 22], chans[i], r, randomAt(1, 21, 11), false, seen));
/* outubro: base de comparação (111 até o dia 21) */
for (let i = 0; i < 149; i++) { const r = rnd(); closedLead(pick(SELLERS), rnd() < 0.6 ? W : I, r < 0.35 ? 0 : r < 0.68 ? 1 : r < 0.85 ? 2 : 3, i < 111 ? randomAt(1, 21, 10) : randomAt(23, 31, 10), rnd() > 0.93, seen); }

/* ---------- tarefas ---------- */
const dOf = (n: string) => deals.find((d) => d.contactId === contacts.find((c) => c.name === n)!.id)!;
const task = (title: string, type: Task["type"], who: string, dueAt: string, ownerId: string, doneAt?: string): Task => { const d = dOf(who); return { id: id("t"), title, type, dealId: d.id, contactId: d.contactId, dueAt, ownerId, doneAt }; };
export const tasks: Task[] = [
  task("Responder condição à vista do lounge", "Retorno", "Gustavo Rezende", at(21, 17), "ana"),
  task("Enviar orçamento do fire pit com frete", "Enviar orçamento", "Carlos Eduardo Brandão", at(21, 11), "camila"),
  task("Retomar proposta dos móveis da pousada", "Retorno", "Renata Figueiredo", at(20, 15), "ana"),
  task("Confirmar data da visita técnica", "Visita técnica", "Marcelo Tavares", at(22, 16), "ana"),
  task("Receber no showroom para ver as banheiras", "Visita ao showroom", "Patrícia Nogueira", at(22, 17, 30), "bruno"),
  task("Simular parcelamento da sauna com a banheira", "Enviar orçamento", "Luciana Bastos", at(22, 15, 30), "camila"),
  task("Ligar sobre o projeto da sauna barril", "Retorno", "Henrique Mattos", at(23, 10), "bruno"),
  task("Medir a área coberta da piscina", "Visita técnica", "Marcelo Tavares", at(25, 9), "ana"),
  task("Enviar detalhamento da sauna seca à arquiteta", "Enviar orçamento", "Fernanda Lacerda", at(23, 14), "ana"),
  task("Visita ao showroom com a família", "Visita ao showroom", "Isabela Quintanilha", at(24, 11), "camila"),
  task("Alinhar entrega da banheira", "Visita técnica", "Beatriz Coutinho", at(30, 10), "bruno"),
  task("Enviar catálogo do ofurô", "Enviar orçamento", "Mônica Alvarenga", at(21, 10), "bruno", at(21, 10, 20)),
  task("Retorno sobre laudo elétrico", "Retorno", "João Pedro Nolasco", at(20, 16), "camila", at(20, 15, 42)),
  task("Enviar orçamento da sauna a vapor", "Enviar orçamento", "Marcelo Tavares", at(21, 20, 30), "ana", at(21, 20, 31)),
];

/* ---------- atendimento ---------- */
export const quickReplies: QuickReply[] = [
  { id: "q1", shortcut: "/prazo", text: "O prazo de entrega é de 25 a 30 dias úteis após a confirmação do pedido.", who: "todos" },
  { id: "q2", shortcut: "/instalacao", text: "A instalação está inclusa num raio de 60 km do showroom. Fora desse raio, enviamos o valor junto com o frete.", who: "todos" },
  { id: "q3", shortcut: "/visita", text: "Podemos agendar uma visita técnica sem custo para medir o espaço e indicar os pontos de água e energia. Qual dia fica melhor para você?", who: "todos" },
  { id: "q4", shortcut: "/showroom", text: "Nosso showroom fica na Estrada Dr. Rogério de Moura Estevão, 188, Prata, Teresópolis. Abrimos de segunda a sábado, das 9h às 18h.", who: "todos" },
];
export const templates: Template[] = [
  { id: "tp1", name: "retomada_orcamento", category: "Utilidade", status: "Aprovado", body: "Olá, {{nome}}. Seu orçamento de {{produto}} segue válido. Posso tirar alguma dúvida ou ajustar a proposta?" },
  { id: "tp2", name: "convite_showroom", category: "Marketing", status: "Aprovado", body: "{{nome}}, a linha de verão chegou ao showroom da TCH em Teresópolis. Venha sentir {{produto}} de perto, com horário reservado para você." },
  { id: "tp3", name: "condicao_novembro", category: "Marketing", status: "Aprovado", body: "Olá, {{nome}}. Até 30/11, {{produto}} tem condição especial de pagamento na TCH Experiência. Quer receber os detalhes?" },
  { id: "tp4", name: "pos_venda_30_dias", category: "Utilidade", status: "Aprovado", body: "{{nome}}, já faz um mês que {{produto}} chegou à sua casa. Está tudo certo com o uso e a manutenção?" },
  { id: "tp5", name: "natal_outdoor", category: "Marketing", status: "Em análise", body: "{{nome}}, ainda dá tempo de receber {{produto}} antes do Natal." },
  { id: "tp6", name: "ultima_chance", category: "Marketing", status: "Rejeitado", body: "ÚLTIMA CHANCE, {{nome}}! Compre já!", reason: "Texto com apelo excessivo e sem contexto do negócio." },
];

/* ---------- automações ---------- */
const run = (n: number, names: string[], actions: string[], fail?: string): AutomationRun[] => Array.from({ length: n }, (_, i) => ({ id: id("r"), at: iso((3 + i * 11 + rnd() * 4) * HOUR), contactName: names[i % names.length], actions, ...(fail && i === 4 ? { failure: fail } : {}) }));
export const automations: Automation[] = [
  { id: "a1", name: "Fora do horário", active: true, trigger: { type: "mensagem", value: "" }, conditions: [{ id: "x1", type: "horario", value: "Fora do horário" }], actions: [{ id: "x2", type: "mensagem", value: "Recebemos sua mensagem. O showroom abre de segunda a sábado, das 9h às 18h, e respondemos assim que abrir." }, { id: "x3", type: "tarefa", value: "Responder mensagem recebida fora do horário" }], runs: run(14, ["Marcelo Tavares", "Vanessa Moreira", "Tatiana Veloso", "Adriano Peixoto", "Felipe Arantes"], ["Mensagem enviada", "Tarefa criada"], "Janela de 24h encerrada antes do envio") },
  { id: "a2", name: "Lead de anúncio", active: true, trigger: { type: "anuncio", value: "Sauna" }, conditions: [{ id: "x4", type: "canal", value: "WhatsApp" }], actions: [{ id: "x5", type: "atribuir", value: "Rodízio" }, { id: "x6", type: "tag_add", value: "Sauna" }, { id: "x7", type: "tarefa", value: "1ª resposta em 1 h" }], runs: run(11, ["Sérgio Antunes", "Thiago Moura", "Larissa Fontes", "Mônica Alvarenga"], ["Responsável atribuído", "Tag Sauna adicionada", "Tarefa criada"]) },
  { id: "a3", name: "Proposta parada", active: false, trigger: { type: "sem_resposta", value: "72" }, conditions: [{ id: "x8", type: "etapa", value: "Proposta enviada" }], actions: [{ id: "x9", type: "modelo", value: "retomada_orcamento" }, { id: "x10", type: "notificar", value: "Responsável" }], runs: run(3, ["Renata Figueiredo", "Mauro Siqueira"], ["Modelo enviado", "Responsável notificado"]).map((r) => ({ ...r, at: new Date(new Date(r.at).getTime() - 9 * DAY).toISOString() })) },
];

/* ---------- campanhas ---------- */
const pool = contacts.filter((c) => c.phone && c.consent.status === "autorizado");
const recips = (n: number, f: (i: number) => RecipientStatus): CampaignRecipient[] => pool.slice(0, n).map((c, i) => ({ contactId: c.id, name: c.name, phone: c.phone!, status: f(i) }));
const anyFilter = { stageId: "", tagId: "", productId: "", city: "", ownerId: "", lastDays: "" };
const camp = (o: Partial<Campaign> & Pick<Campaign, "id" | "name" | "status" | "audience" | "templateId" | "recipients">): Campaign => ({ filter: { ...anyFilter }, listName: "", vars: { nome: "Primeiro nome", produto: "Produto de interesse" }, header: { type: "nenhum", name: "" }, buttons: [{ text: "Quero saber mais", automationId: "a2" }, { text: "Não tenho interesse", automationId: "" }], when: "agendar", scheduledAt: "", batch: 50, ...o });
export const campaigns: Campaign[] = [
  camp({ id: "camp1", name: "Convite ao showroom · Linha de verão", status: "Concluída", audience: "Leads da serra com autorização", templateId: "tp2", scheduledAt: at(5, 10), header: { type: "imagem", name: "linha-verao.jpg" }, recipients: recips(96, (i) => (i % 32 === 31 ? "Falhou" : i % 24 === 23 ? "Saiu" : i % 6 === 0 ? "Respondeu" : i % 4 === 3 ? "Entregue" : "Lida")) }),
  camp({ id: "camp2", name: "Condição de novembro · Saunas", status: "Agendada", audience: "Interesse em saunas", templateId: "tp3", scheduledAt: at(24, 9, 30), recipients: recips(58, () => "Na fila") }),
  camp({ id: "camp3", name: "Pousadas e hotéis da serra", status: "Rascunho", audience: "Tag Pousada", filter: { ...anyFilter, tagId: "pousada" }, templateId: "", recipients: [] }),
];

export const settings: Settings = {
  hours: { open: "09:00", close: "18:00", days: "Segunda a sábado" },
  offMessage: "Recebemos sua mensagem. O showroom abre de segunda a sábado, das 9h às 18h, e respondemos assim que abrir.",
  limits: { windowH: 24, replyH: 1, stalledD: 3 }, goals: { ana: 60000, bruno: 55000, camila: 50000 }, teamGoal: 165000,
  costs: { marketing: 0.38, utilidade: 0.05, aiMonthly: 250 }, distribution: { mode: "rodizio", members: ["ana", "bruno", "camila"] },
  lossReasons: ["Preço", "Prazo", "Sumiu", "Concorrente", "Outro"],
  channels: [
    { id: "wa", type: "whatsapp", handle: "(21) 3642-1880", status: "Conectado", quality: "Alta", limit: "1.000 conversas por dia" },
    { id: "ig", type: "instagram", handle: "@tchexperiencia", status: "Conectado", quality: "Sem restrições", limit: "Sem limite diário" },
  ],
};
