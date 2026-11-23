# Backend do TCH CRM (Supabase)

PostgreSQL + Auth + RLS + Storage + Realtime + Edge Functions, com integração **oficial** à
WhatsApp Cloud API e à Instagram Messaging API (sem Baileys, sem QR Code).

## Arquitetura

```
Meta ──webhook──► meta-webhook ──grava──► webhook_events ──► svc_ingest_message / svc_record_status
  ▲                (HMAC, dedupe)            │ falhou?            (idempotentes, por external_id)
  │                                          └──► meta-worker (cron, backoff)
  │
  └──Graph API◄── dispatchOutbound ◄── svc_claim_outbound ◄── messages (status pending)
                                                                  ▲
CRM (Next.js) ──JWT──► send-message ──► enqueue_outbound_message ─┘  (permissão, janela 24 h,
              ──JWT──► RPCs do CRM (create_deal, move_deal, assign_contacts…)  modelo, consentimento)
              ◄─────── Realtime (messages, conversations, contacts, deals, tasks, notifications)
```

| Pasta | Conteúdo |
|---|---|
| `migrations/0001–0005` | Tipos, tabelas normalizadas, RLS e GRANTs por coluna |
| `migrations/0006` | API do CRM: contatos, funil, tarefas, preferências, conversas |
| `migrations/0007` | Motor de mensagens: janela, fila de saída, ingestão de webhooks, status |
| `migrations/0008` | Campanhas, lembretes, LGPD, auditoria, Storage, Realtime |
| `migrations/0009` | Agendamentos (pg_cron + pg_net) |
| `migrations/0010` | Privilégios de execução (rodar sempre por último) |
| `functions/` | `meta-webhook`, `send-message`, `meta-worker`, `meta-templates`, `admin-users`, `lgpd` |
| `tests/` | Testes do banco (PGlite) e `functions/_tests` (Deno) |

### Regras garantidas no servidor
- **Permissões** (espelham `lib/permissions.ts`): vendedor vê os próprios leads e os sem responsável, responde só os
  próprios, vê só as próprias tarefas; gestor vê/gerencia tudo; admin gerencia equipe, canais, exclusões e LGPD.
  Usuário desativado perde o acesso na hora. Escritas sensíveis só por RPC (`SECURITY DEFINER` + `search_path` fixo).
- **Janelas da Meta**: WhatsApp responde livre por 24 h após a última mensagem do cliente; depois, só modelo aprovado.
  Instagram: 24 h; com a permissão *Human Agent* aprovada (ligar com `set_instagram_human_agent(true)`), até 7 dias.
- **Marketing** só para contato com consentimento `autorizado`; palavra-chave de saída (SAIR, PARAR…) revoga na hora.
- **Sem duplicidade**: `external_id` único por canal (reentregas da Meta), `client_id` único por envio (duplo clique),
  hash do corpo em `webhook_events`, eco do Instagram absorvido, status fora de ordem nunca regride.
  Envio com resultado incerto (timeout) vira `failed/ambiguous` e **não** é reenviado sozinho.
- **Tokens** ficam no Vault (por canal) ou em secrets das funções; nunca vão ao navegador nem aos logs.

## Implantação

Pré-requisitos: [Supabase CLI](https://supabase.com/docs/guides/cli), projeto criado (região **São Paulo** recomendada).

1. **Banco**
   ```powershell
   supabase link --project-ref SEU_REF
   supabase db push --include-seed
   ```
2. **Segredos do agendador** (SQL Editor) — o `meta-worker` roda a cada minuto via pg_cron:
   ```sql
   select vault.create_secret('https://SEU_REF.supabase.co', 'project_url');
   select vault.create_secret('MESMO_VALOR_DO_WORKER_SECRET', 'worker_secret');
   ```
3. **Edge Functions**: copie `functions/.env.example` para `functions/.env`, preencha e rode
   ```powershell
   supabase secrets set --env-file supabase/functions/.env
   supabase functions deploy
   ```
4. **Auth** (Dashboard › Authentication): cadastro público desligado, SMTP próprio, *Site URL* = URL do CRM.
   Primeiro admin: crie o usuário em *Add user* e rode
   ```sql
   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = 'voce@tchexperiencia.com.br';
   update public.profiles set role = 'admin' where email = 'voce@tchexperiencia.com.br';
   ```
   Os demais entram por convite (Configurações › Equipe → função `admin-users`).
5. **Canais** com os IDs reais da Meta (WhatsApp Manager / Meta Business Suite):
   ```sql
   insert into public.channels (type, name, handle, status, phone_number_id, waba_id)
   values ('whatsapp', 'TCH Experiência', '(21) XXXX-XXXX', 'conectado', '<PHONE_NUMBER_ID>', '<WABA_ID>');
   insert into public.channels (type, name, handle, status, ig_user_id, ig_api)
   values ('instagram', 'TCH Experiência', '@tchexperiencia', 'conectado', '<IG_USER_ID>', 'instagram_login');
   -- token por canal no Vault (ou use WHATSAPP_ACCESS_TOKEN / INSTAGRAM_ACCESS_TOKEN nos secrets):
   update public.channels set token_secret_id = vault.create_secret('<TOKEN>', 'channel_token_' || id) where phone_number_id = '<PHONE_NUMBER_ID>';
   ```
   Pelo app, um admin logado pode usar a RPC `admin_set_channel_token(channel_id, token)`.
6. **Webhooks na Meta** — URL `https://SEU_REF.supabase.co/functions/v1/meta-webhook`, token de verificação = `META_VERIFY_TOKEN`.
   - WhatsApp: campos `messages`, `message_template_status_update`, `phone_number_quality_update`, `account_update`;
     assine o app na WABA: `POST /<WABA_ID>/subscribed_apps`.
   - Instagram: campos `messages`, `messaging_seen`, `message_reactions`, `messaging_postbacks` (ecos chegam em `messages`).
7. **Modelos**: em Configurações › Modelos, sincronize (`meta-templates` → `sync`). Cabeçalho com imagem/documento precisa
   de um link https: `meta-templates` → `set_header_link`.
8. **Frontend**: `.env.local` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ver `/.env.example`).
   Sem elas, o CRM continua no modo demonstração.

## LGPD
- Base legal registrada: trilha imutável em `consent_events`; marketing exige consentimento; saída por palavra-chave.
- Direitos do titular (admin): `lgpd` → `export` (relatório JSON), `anonymize` (remove identificadores, conteúdo e mídias),
  `delete_contact`. Cada uso fica em `audit_log` e `data_requests`.
- Minimização: `svc_run_retention` (diário) apaga webhooks brutos (30 d), eventos de status (90 d) e notificações (90 d);
  prazos em `app_settings.retention_days`. Logs das funções não gravam telefone, nome nem texto de mensagens.
- Mídia em bucket **privado** (`chat-media`), lida só por URL assinada e só por quem pode ver a conversa.

## Testes
```powershell
npm run test:db      # migrations + RLS + regras + webhooks (PGlite, sem Docker)
npm run test:edge    # parser, assinatura, montagem, erros e despacho (Deno)
npm run check:edge   # deno check de todas as funções
```

## Limites conhecidos (próximos passos)
- Automações: o editor salva no navegador e **não executa** com o backend ligado (motor do servidor ainda não existe);
  as tabelas `automations`/`automation_runs` já estão prontas.
- Comentários e menções do Instagram não são tratados (só mensagens diretas).
- A tela carrega os últimos 120 dias de mensagens; histórico mais antigo fica no banco.
- Confirmação de leitura para o cliente no WhatsApp (tique azul) não é enviada ao abrir a conversa.
