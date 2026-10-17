# Lumen Quiz — quiz bíblico em grupo, multilingue

Aplicação web estilo Kahoot para conhecimento bíblico: o anfitrião projeta as perguntas, os jogadores respondem pelo telemóvel (sem instalar nada), cada um na sua língua (pt, fr, en, es).

> «Lumen Quiz» é um nome provisório. Muda-o em `messages/*.json` (chave `app.name`).

## Estrutura

| Rota | O quê | Quem |
|---|---|---|
| `/` | Landing page (o que é, como funciona, para quem) | Público |
| `/register`, `/login` | Conta de anfitrião (e-mail + palavra-passe) | Público |
| `/dashboard` | Os meus quizzes (jogar, editar, apagar) | Anfitrião |
| `/dashboard/quizzes/new` · `/[id]/edit` | Editor com separadores por língua | Anfitrião |
| `/dashboard/discover` | Biblioteca de quizzes públicos, filtro por língua | Anfitrião |
| `/dashboard/settings` | Nome, língua e tempo por defeito, palavra-passe | Anfitrião |
| `/host/[id]` | Ecrã projetado: PIN, link, QR code, perguntas, classificação, pódio | Anfitrião |
| `/join` | Escrever o PIN | Jogador |
| `/j/[pin]` | Link partilhado / QR code: alcunha + língua | Jogador |
| `/play/[id]` | Ecrã do telemóvel do jogador | Jogador |

```
app/              páginas (Next.js App Router)
components/       dashboard/ (painel e editor), game/ (anfitrião e jogador)
i18n/ messages/   línguas da interface (next-intl)
lib/supabase/     clientes Supabase (browser, servidor)
supabase/migrations/0001_init.sql   base de dados completa
scripts/test-db.mjs                 simula um jogo completo num Postgres local
```

## Pôr a funcionar (≈10 minutos)

1. **Supabase** — cria um projeto em supabase.com.
   - SQL Editor → cola e executa `supabase/migrations/0001_init.sql`.
   - Authentication → Sign In / Providers → ativa **Anonymous sign-ins**.
   - Authentication → URL Configuration → `Site URL` = o teu domínio (ex.: `http://localhost:3000` em desenvolvimento) e junta `…/auth/callback` aos Redirect URLs.
   - (Opcional, para testar mais depressa) desativa «Confirm email».
2. **Variáveis** — copia `.env.local.example` para `.env.local` e preenche com Project Settings → API.
3. **Arrancar**
   ```bash
   npm install
   npm run dev        # http://localhost:3000
   npm run test:db    # testa a base de dados sem precisar do Supabase
   ```
4. **Publicar** — importa o repositório na Vercel e define as duas variáveis de ambiente. No Supabase, atualiza o `Site URL` para o domínio da Vercel.

## Como funciona o jogo

1. Anfitrião carrega em **Jogar** → `create_session` gera um PIN de 6 dígitos.
2. Ecrã do anfitrião mostra PIN, link `/j/PIN`, QR code e botão Partilhar (WhatsApp).
3. Jogador abre o link → login anónimo invisível → `join_session` com alcunha e língua.
4. Realtime do Supabase avisa todos os ecrãs quando o estado muda (sala → pergunta → revelação → fim).
5. Pontos calculados **no servidor** (1000 se responder logo, ~500 no último segundo). A resposta certa nunca chega ao telemóvel antes da revelação.
6. A pergunta é revelada automaticamente quando o tempo acaba ou todos responderam.

## Acrescentar uma língua (ex.: italiano)

1. `i18n/config.ts` → junta `'it'` a `locales` e a `localeNames`.
2. Cria `messages/it.json` (copia `en.json` e traduz).
3. Na base de dados: `insert into public.locales values ('it', 'Italiano');`

## Próximas fases sugeridas

- Geração de perguntas com IA (API da Claude) a partir de um capítulo.
- Tradução automática das línguas em falta no editor.
- Modo equipas e novos tipos de pergunta («completa o versículo»).
- Texto dos versículos a partir de edições em domínio público (Almeida antiga, Louis Segond 1910, KJV, Reina-Valera 1909).
- PWA (instalar no ecrã inicial).
