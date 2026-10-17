# Jogo bíblico sorteado: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir os quizzes feitos à mão por um banco de perguntas bíblicas sorteadas por nível, com três tipos de pergunta, versículo na revelação e Descobrir como explorador do banco.

**Architecture:** O banco vive em ficheiros JSON no repositório (`content/questions/*.json`), escritos pelo Claude sem texto bíblico copiado à mão. Um script de construção junta os versículos a partir de traduções de domínio público descarregadas, valida tudo e gera SQL de importação. No Supabase, uma migração nova troca as tabelas de quizzes por tabelas do banco e reescreve as funções do jogo: o sorteio, a ordem das opções, a correção e a revelação acontecem todos no servidor.

**Tech Stack:** Next.js 15, React 19, next-intl 4, Supabase (Postgres, RLS, Realtime), Tailwind 4, PGlite para testes SQL, `node:test` para testes de scripts. Sem dependências novas no runtime.

**Spec:** `docs/superpowers/specs/2026-10-17-jogo-biblico-sorteado-design.md`

## Global Constraints

- Línguas: `pt`, `fr`, `en`, `es`, sempre as quatro em todas as perguntas, opções e versículos.
- Texto em português: **português de Portugal** (perguntas, opções, interface). O versículo mantém a grafia da tradução usada.
- Níveis: `easy`, `medium`, `hard` (fácil para crianças, médio, difícil).
- Número de perguntas por jogo: só `5`, `10`, `15`, `20`; valor inicial `10`.
- Tipos: `choice` (2 a 4 opções, uma certa), `order` (exatamente 4 episódios), `verse` (versículo com uma palavra em falta, 4 palavras à escolha).
- `order`: pontos só com a ordem completa certa; tempo = tempo do anfitrião **+ 10 s**.
- Pontos: fórmula atual, `round(points * (1 - min(elapsed/limit, 1) / 2))`, `points = 1000`.
- Versículo na revelação: no máximo **2 versículos seguidos**; aviso acima de 300 caracteres, erro acima de 360, em qualquer língua.
- Traduções de domínio público: fr Louis Segond 1910, en King James Version, es Reina-Valera 1909, pt Almeida em domínio público; se não houver, tradução pt com licença aberta (CC BY ou CC BY-SA) com atribuição visível; se também não houver, pt mostra só a referência.
- O telemóvel nunca recebe `is_correct`, a ordem certa, o versículo nem a palavra em falta antes da revelação.
- Jogadores anónimos nunca leem as tabelas do banco. Só contas registadas (`is_registered()`).
- Pergunta reportada: `active = false`; nunca é reativada por reimportação.
- Mínimo **60 perguntas ativas por nível**, com os três tipos em cada nível. Objetivo 100 por nível.
- Sem novas dependências npm. Material de base em `~/Desktop/biblia`; textos extraídos e Bíblias descarregadas ficam em `data/` (fora do git).

## Review Focus

1. **Ordem baralhada igual à certa:** num `order`, a ordem mostrada nunca pode coincidir com a ordem certa. Teste na Task 2.
2. **Fuga de resposta pela posição:** o campo `position` devolvido ao telemóvel é a posição baralhada de ecrã, nunca a posição guardada (que, em `order`, é a ordem certa). Teste na Task 2.
3. **Jogador que entra a meio ou recarrega durante um `order`:** recebe a pergunta atual e pode responder uma vez; segunda submissão dá `already_answered`. Teste na Task 2.
4. **Nível sem perguntas suficientes:** `create_session` com mais perguntas do que as ativas falha com `not_enough_questions`, e o formulário só oferece números possíveis. Teste na Task 2 e verificação manual na Task 15.
5. **Palavra em falta ambígua:** num `verse`, a palavra escolhida tem de existir no versículo daquela língua como palavra inteira; se aparecer mais de uma vez, só a primeira fica em branco e o validador avisa. Teste na Task 4.

---

## Estrutura de ficheiros

| Ficheiro | Responsabilidade |
|---|---|
| `supabase/migrations/0002_question_bank.sql` | Remove quizzes; cria banco, sessões sorteadas e funções do jogo |
| `scripts/test-db.mjs` | Aplica 0001+0002 e um seed de teste em PGlite; simula um jogo com os 3 tipos |
| `lib/bible-books.json` | 66 livros: código USFM, testamento, nome em pt/fr/en/es |
| `lib/bible-books.ts` | Tipos e helpers sobre o JSON para a app |
| `scripts/bible/fetch-bibles.mjs` | Descarrega as 4 traduções para `data/bibles/<locale>.tsv` |
| `scripts/lib/bible.mjs` | Ler Bíblias, obter passagens, formatar referências |
| `scripts/lib/validate-bank.mjs` | Regras do banco |
| `scripts/build-bank.mjs` | Gera `content/bank.generated.json` e `supabase/seed/bank-<ficheiro>.sql` |
| `scripts/*.test.mjs` | Testes `node:test` dos scripts |
| `content/questions/<secção>.json` | Perguntas escritas pelo Claude |
| `content/fact-check.md` | Relatório da verificação independente |
| `components/dashboard/NewGameForm.tsx` | Escolha de nível e número de perguntas |
| `components/game/OrderInput.tsx` | Resposta de ordenar no telemóvel |
| `components/game/VerseReveal.tsx` | Bloco do versículo na revelação (ecrã e telemóvel) |
| `app/dashboard/discover/page.tsx` | Explorador do banco |

---

### Task 0: Repositório git

O projeto ainda não é um repositório git.

- [ ] **Step 1:** Acrescentar `data/` ao `.gitignore`.
- [ ] **Step 2:** `git init && git add -A && git commit -m "chore: estado inicial do Lumen Quiz"`. Esperado: commit sem `.env.local` nem `node_modules`.

### Task 1: Esquema do banco

**Files:**
- Create: `supabase/migrations/0002_question_bank.sql`
- Modify: `scripts/test-db.mjs` (reescrever)
- Modify: `package.json` (`test:db` mantém-se)

**Interfaces:**
- Produces (SQL):
  - enums `public.q_type ('choice','order','verse')`, `public.q_level ('easy','medium','hard')`
  - `bank_questions(id text pk, type q_type, level q_level, testament text check in ('ot','nt'), book text, chapter int, verse_start int, verse_end int, active bool default true, reported_count int default 0, updated_at timestamptz)`
  - `bank_question_texts(question_id text, locale text, prompt text, bible_ref text, verse_text text null, pk(question_id, locale))`
  - `bank_options(id uuid pk, question_id text, position int, is_correct bool default false, unique(question_id, position))`. Em `order`, `position` é a ordem certa.
  - `bank_option_texts(option_id uuid, locale text, text text, ref text null, pk(option_id, locale))`
  - `upsert_bank_question(p jsonb) returns text`: só `service_role` e o dono da base (revogar de `public, anon, authenticated`).
  - `bank_counts() returns jsonb` → `{"easy":n,"medium":n,"hard":n}` de perguntas ativas; só registados (`not_registered` caso contrário).
- Formato de `p` (igual a cada item de `content/bank.generated.json`):
  ```json
  { "id": "gen-easy-001", "type": "choice", "level": "easy", "testament": "ot",
    "book": "GEN", "chapter": 6, "verse_start": 14, "verse_end": 14,
    "texts": { "pt": { "prompt": "…", "bible_ref": "Génesis 6:14", "verse_text": "…" } },
    "options": [ { "position": 1, "is_correct": true, "texts": { "pt": { "text": "Noé", "ref": null } } } ] }
  ```

- [ ] **Step 1: Reescrever o arranque de `scripts/test-db.mjs`.** Manter a simulação de `auth`, acrescentar `create role service_role;`, aplicar 0001 e depois 0002. Testes (com `expectError` existente):
  - `✓ tabelas de quizzes removidas`: `select to_regclass('public.quizzes')` é `null`.
  - `✓ upsert`: duas chamadas a `upsert_bank_question` com o mesmo `id` deixam 1 linha em `bank_questions` e as opções da segunda chamada.
  - `✓ reimportar não reativa`: `update bank_questions set active=false, reported_count=1`, voltar a importar, `active` continua `false`, `reported_count` continua `1`.
  - `✓ anónimo não lê o banco`: como anónimo, `select count(*) from bank_options` com `set role authenticated` devolve `0`; `bank_counts()` dá `not_registered`.
  - `✓ bank_counts`: como registado, devolve as contagens de ativas por nível.
  - `✓ autenticado não importa`: `set role authenticated; select upsert_bank_question(...)` falha com `permission denied`.
  Para os testes de RLS, correr as queries com `set role authenticated` e `reset role` à volta.
- [ ] **Step 2:** `npm run test:db`. Esperado: FAIL, migração 0002 não existe.
- [ ] **Step 3: Escrever a parte de esquema de `0002_question_bank.sql`.** Começa por `drop function` de `save_quiz`, `get_quiz_for_edit`, `create_session(uuid)`, `can_view_quiz`, `can_view_option`, `get_current_question`, `submit_answer`, depois `drop table` de `answers`, `game_sessions` (recriadas na Task 2), `option_translations`, `options`, `question_translations`, `questions`, `quiz_translations`, `quizzes`. RLS ligado nas 4 tabelas do banco, com policy `for select to authenticated using (public.is_registered())`. `upsert_bank_question` é `security definer`, apaga e recria textos e opções da pergunta, preserva `active` e `reported_count` em conflito.
- [ ] **Step 4:** `npm run test:db`. Esperado: os 6 testes acima PASS.
- [ ] **Step 5:** `git commit -m "feat(db): banco de perguntas e importação"`

### Task 2: Funções do jogo sorteado

**Files:**
- Modify: `supabase/migrations/0002_question_bank.sql`
- Modify: `scripts/test-db.mjs`

**Interfaces:**
- Consumes: tabelas da Task 1.
- Produces (SQL):
  - `game_sessions(id uuid pk, host_id uuid default auth.uid(), pin text, status session_status, level q_level, question_count int, time_limit_s int, current_position int, question_started_at timestamptz, created_at)`, índice único de PIN ativo como em 0001, na publicação Realtime.
  - `session_questions(session_id uuid, position int, question_id text, display_order uuid[], reported bool default false, pk(session_id, position))`, RLS sem policies.
  - `answers(id, session_id, player_id, question_id text, option_id uuid null, order_ids uuid[] null, is_correct bool, points_awarded int, answered_at, unique(player_id, question_id))`, na publicação Realtime, policy de leitura igual a 0001.
  - `players` mantém-se; recriar policies que dependiam de `game_sessions`.
  - `create_session(p_level text, p_count int) returns jsonb {session_id, pin}`. Erros: `not_registered`, `invalid_count` (fora de 5/10/15/20), `invalid_level`, `not_enough_questions`. `time_limit_s` vem de `profiles.default_time_limit_s`.
  - `join_session`, `next_question`, `reveal_answer`, `end_session`: mesmas assinaturas e erros de 0001; `next_question` usa `session_questions`.
  - `get_current_question(p_session_id uuid, p_locale text) returns jsonb`:
    ```
    { question_id, type, position, total, time_limit_s, started_at, server_now, status,
      bible_ref, text,
      options: [{ id, position, text, ref, is_correct }],
      correct_order: uuid[] | null,
      verse_text: text | null,
      reported: bool }
    ```
    `options` segue `display_order` e `position` é 1..n de ecrã. `is_correct` só em `reveal` e só para `choice`/`verse`; senão `null`. `correct_order` só em `reveal` e só para `order`. `verse_text` só em `reveal` e só para `choice`/`verse`. `ref` só para `order`. `time_limit_s` = sessão + 10 em `order`. Textos na língua pedida, com recurso a `pt`.
  - `submit_answer(p_session_id uuid, p_option_id uuid) returns void`: só `choice`/`verse`, senão `wrong_type`. Erros de 0001 mantidos.
  - `submit_order(p_session_id uuid, p_order uuid[]) returns void`: só `order` (`wrong_type`); `p_order` tem de ser uma permutação das 4 opções (`invalid_order`); certo só se igual à ordem por `position`.
  - `report_question(p_session_id uuid) returns void`: só anfitrião (`not_host`), só em `reveal` (`not_in_reveal`); marca `session_questions.reported`, e só na primeira vez faz `active=false, reported_count+1`.
  - Permissões: execute só para `authenticated`, como em 0001.
- Baralhar `display_order` em `create_session`; para `order`, repetir até ser diferente da ordem certa.

- [ ] **Step 1: Testes em `scripts/test-db.mjs`.** Importar, com `upsert_bank_question`, 6 perguntas `easy` (2 de cada tipo) e 1 `medium`. Cenário:
  - `create_session('easy', 5)` com 6 ativas funciona; `create_session('medium', 5)` dá `not_enough_questions`; `create_session('easy', 7)` dá `invalid_count`; anónimo dá `not_registered`.
  - `session_questions` tem 5 linhas sem `question_id` repetido.
  - Para cada `order` sorteado, `display_order` difere da ordem por `position`.
  - Durante `question`, para cada tipo: `is_correct`, `correct_order` e `verse_text` são `null`; as `position` devolvidas são `1..n`; num `order`, a sequência de `id` devolvida não é a ordem certa.
  - `submit_answer` num `order` dá `wrong_type`; `submit_order` com 3 ids dá `invalid_order`; ordem certa dá pontos > 900 e `is_correct`; segunda submissão dá `already_answered`; ordem errada dá 0.
  - `time_limit_s` de um `order` = `profiles.default_time_limit_s + 10`.
  - Em `reveal`: `verse_text` não nulo em `choice`/`verse` e em `fr`; `correct_order` com 4 ids em `order`.
  - `report_question` como jogador dá `not_host`; em `question` dá `not_in_reveal`; em `reveal`, duas chamadas deixam `reported_count = 1` e `active = false`; `bank_counts()` desce 1.
  - Avançar até ao fim termina com `status = 'finished'`.
- [ ] **Step 2:** `npm run test:db`. Esperado: FAIL nas funções novas.
- [ ] **Step 3:** Escrever as funções acima em `0002_question_bank.sql`.
- [ ] **Step 4:** `npm run test:db`. Esperado: todos PASS, terminando com a linha de sucesso do script.
- [ ] **Step 5:** `git commit -m "feat(db): sessões sorteadas, ordenar, completar versículo e reportar"`

### Task 3: Livros e Bíblias de domínio público

**Files:**
- Create: `lib/bible-books.json`, `lib/bible-books.ts`, `scripts/bible/fetch-bibles.mjs`, `scripts/lib/bible.mjs`, `scripts/bible.test.mjs`, `scripts/fixtures/bibles/{pt,fr,en,es}.tsv`
- Modify: `package.json` (scripts `bibles:fetch`, `test:bank` = `node --test scripts/`)

**Interfaces:**
- `lib/bible-books.json`: array de 66 `{ "code": "GEN", "testament": "ot", "names": { "pt": "Génesis", "fr": "Genèse", "en": "Genesis", "es": "Génesis" } }`, ordem canónica protestante, códigos USFM. Nomes pt na forma de Portugal (Génesis, Deuteronómio, Filémon, Atos).
- `lib/bible-books.ts`: `export type BookCode`, `export const BOOKS`, `export function bookName(code: string, locale: Locale): string`.
- `data/bibles/<locale>.tsv`: uma linha por versículo, `GEN\t1\t1\ttexto`.
- `scripts/lib/bible.mjs`:
  - `loadBible(locale: string, dir?: string): Map<string, string>` com chave `"GEN 1:1"`.
  - `getPassage(bible, { book, chapter, verse_start, verse_end }): string | null`: versículos unidos por espaço; `null` se faltar algum.
  - `formatRef(locale, { book, chapter, verse_start, verse_end }): string` → `"João 3:16"`, `"João 3:16-17"`, `"Génesis 7"` quando `verse_start` é `null`.
- `fetch-bibles.mjs`: descarrega de eBible.org (formato VPL ou USFM) `engkjv`, `fraLSG`, `spaRV1909` e a tradução pt escolhida, e converte para o TSV. Antes de escolher a pt, confirmar no próprio eBible.org o estado de direitos de cada edição portuguesa e registar a escolha e a licença em `content/SOURCES.md`, seguindo a regra pt das Global Constraints. Se não houver nenhuma tradução pt utilizável, não criar `data/bibles/pt.tsv`; nesse caso `buildQuestion` deixa `verse_text` pt a `null` e o validador verifica as referências e a palavra em falta de `verse` só nas outras línguas, exigindo que perguntas `verse` tenham `blank.pt` presente no enunciado pt escrito à mão.

- [ ] **Step 1: Testes `scripts/bible.test.mjs`** com as fixtures (João 3:16-17 e Génesis 1:1 nas 4 línguas):
  - `getPassage(pt, JHN 3:16)` igual ao texto da fixture; `JHN 3:16-17` une os dois; `JHN 3:99` → `null`.
  - `formatRef('pt', JHN 3:16-17)` → `"João 3:16-17"`; `formatRef('fr', GEN 1:1)` → `"Genèse 1:1"`.
  - `BOOKS.length === 66`, 39 `ot`, 27 `nt`, todos com os 4 nomes.
- [ ] **Step 2:** `npm run test:bank`. Esperado: FAIL.
- [ ] **Step 3:** Implementar `bible-books.json`, `bible-books.ts`, `bible.mjs`.
- [ ] **Step 4:** `npm run test:bank`. Esperado: PASS.
- [ ] **Step 5:** Implementar e correr `npm run bibles:fetch`. Esperado: 4 ficheiros em `data/bibles/`, cada um com mais de 30 000 linhas; `getPassage` de `JHN 3:16` não nulo nas 4.
- [ ] **Step 6:** `git commit -m "feat(bank): livros bíblicos e leitura das traduções"`

### Task 4: Validador e construção do banco

**Files:**
- Create: `scripts/lib/validate-bank.mjs`, `scripts/build-bank.mjs`, `scripts/validate-bank.test.mjs`, `scripts/fixtures/questions/sample.json`
- Modify: `package.json` (script `bank:build`)

**Interfaces:**
- Consumes: `scripts/lib/bible.mjs`, `lib/bible-books.json`.
- Formato de autoria (`content/questions/*.json`, array):
  ```json
  { "id": "jhn-easy-003", "type": "choice|order|verse", "level": "easy",
    "book": "JHN", "chapter": 3, "verse_start": 16, "verse_end": 16,
    "prompt": { "pt": "…", "fr": "…", "en": "…", "es": "…" },
    "options": [ { "correct": true, "text": { "pt": "…", "fr": "…", "en": "…", "es": "…" } } ],
    "items": [ { "book": "GEN", "chapter": 7, "verse_start": null, "verse_end": null, "text": { "pt": "…" } } ],
    "blank": { "pt": "amou", "fr": "aimé", "en": "loved", "es": "amó" },
    "distractors": [ { "pt": "…", "fr": "…", "en": "…", "es": "…" } ] }
  ```
  `choice` usa `prompt` + `options`; `order` usa `prompt` + `items` pela ordem certa; `verse` usa `blank` + 3 `distractors` (o enunciado é gerado). `testament` deriva do livro.
- `validateQuestion(q, bibles): { errors: string[], warnings: string[] }`.
- `buildQuestion(q, bibles): object` no formato de `upsert_bank_question` (Task 1). Em `verse`, `prompt` de cada língua = versículo oficial com a primeira ocorrência de `blank` (palavra inteira, sem distinguir maiúsculas) trocada por `_____`, e as 4 opções baralhadas com a certa marcada. Em `order`, `options[i].position = i+1` e `ref = formatRef(item)`.
- `build-bank.mjs`: lê `content/questions/*.json`, escreve `content/bank.generated.json` e um `supabase/seed/bank-<nome>.sql` por ficheiro (`select public.upsert_bank_question($json$…$json$::jsonb);` por pergunta), imprime contagem por nível e tipo, sai com código 1 se houver erros.

Regras de `validateQuestion`:
- `id` único em todo o banco, formato `^[a-z0-9]+-(easy|medium|hard)-\d{3}$`; `type` e `level` válidos; `book` existe.
- Todas as strings de texto presentes e não vazias nas 4 línguas.
- Referência existe nas 4 Bíblias; no máximo 2 versículos; versículo > 360 caracteres em qualquer língua = erro, > 300 = aviso.
- `choice`: 2 a 4 opções, exatamente 1 `correct`.
- `order`: exatamente 4 `items`, cada referência existe nas 4 Bíblias.
- `verse`: `blank` existe como palavra inteira no versículo de cada língua (erro se não), aviso se aparecer mais de uma vez; 3 `distractors` diferentes de `blank`; nível `easy` só com um versículo e versículo ≤ 200 caracteres em `pt`.
- Português de Portugal: aviso se `prompt`/opções `pt` contiverem `você`, `vocês`, `celular`, `tela`, `Gênesis`, `Antônio`, `ônibus`.

- [ ] **Step 1: Testes `scripts/validate-bank.test.mjs`** com as fixtures da Task 3:
  - `choice` válido → sem erros; com 2 opções `correct` → erro; sem `es` → erro.
  - `verse` com `blank: {pt:"amou",…}` em JHN 3:16 → `buildQuestion(...).texts.pt.prompt` contém `_____` e não contém a palavra; `blank` inexistente → erro; palavra repetida → aviso.
  - `order` com 3 itens → erro; com 4 itens válidos → `options[2].position === 3`.
  - Referência `JHN 3:99` → erro; `JHN 3:16-18` → erro (3 versículos).
  - `prompt.pt` com "você" → aviso.
  - `buildQuestion` preenche `verse_text` e `bible_ref` nas 4 línguas.
- [ ] **Step 2:** `npm run test:bank`. Esperado: FAIL.
- [ ] **Step 3:** Implementar `validate-bank.mjs` e `build-bank.mjs`.
- [ ] **Step 4:** `npm run test:bank`. Esperado: PASS. Correr `node scripts/build-bank.mjs` com a pasta de fixtures e importar o SQL gerado no `test-db.mjs` em vez das perguntas escritas à mão da Task 2; `npm run test:db` PASS.
- [ ] **Step 5:** `git commit -m "feat(bank): validação e geração do banco"`

### Task 5: Extração do material de base

**Files:**
- Create: `scripts/extract-sources.py`, `data/sources/*.txt`, `data/sources/evangelhos.md` (fora do git)

- [ ] **Step 1:** `extract-sources.py` usa `pypdf` num venv fora do repositório e escreve um `.txt` por PDF de `~/Desktop/biblia`, com marcadores `=== página N ===`.
- [ ] **Step 2:** "OS 4 EVANGELHOS .pdf" não tem texto: ler as 4 páginas como imagem e resumir o conteúdo em `data/sources/evangelhos.md`.
- [ ] **Step 3:** Verificar que existem 5 ficheiros não vazios em `data/sources/`.
- [ ] **Step 4:** `git commit -m "chore: script de extração das fontes"` (só o script).

### Tasks 6 a 10: Escrita do banco

Uma task por secção, todas iguais em forma. Cada uma cria um ficheiro com **60 perguntas**: por nível, 12 `choice`, 4 `order`, 4 `verse`.

| Task | Ficheiro | Cobertura | Fontes principais |
|---|---|---|---|
| 6 | `content/questions/pentateuco.json` | Génesis a Deuteronómio | Jornada partes 1 e 2 |
| 7 | `content/questions/historicos.json` | Josué a Ester | Jornada partes 2 e 3 |
| 8 | `content/questions/poeticos-profetas.json` | Job a Malaquias | Jornada parte 3 |
| 9 | `content/questions/evangelhos.json` | Mateus a João | Jornada parte 4, evangelhos.md |
| 10 | `content/questions/atos-apocalipse.json` | Atos a Apocalipse | Jornada parte 4 |

Regras de escrita, para todas:
- Cada facto tem de estar no versículo citado; os PDFs servem para escolher temas e episódios, não como prova.
- Fácil: personagens e episódios conhecidos, frases curtas, vocabulário de criança. Médio: pormenores das histórias. Difícil: nomes, números, ordem fina, livros menos lidos.
- Distratores plausíveis e do mesmo tipo da resposta.
- `order`: quatro episódios com ordem bíblica inequívoca, cada um com a sua referência.
- `verse`: em fácil, versículos curtos e conhecidos; a palavra em falta é significativa, nunca artigo ou preposição.
- `id`: prefixo da secção, por exemplo `pent-easy-001`.

Passos de cada task:
- [ ] **Step 1:** Escrever o ficheiro.
- [ ] **Step 2:** `npm run bank:build`. Esperado: 0 erros, as contagens do ficheiro batem com 20 por nível e 12/4/4 por tipo. Resolver todos os avisos de português do Brasil.
- [ ] **Step 3:** `git commit -m "content: perguntas de <secção>"`

### Task 11: Verificação independente dos factos

Feita por um agente que não escreveu as perguntas.

**Files:**
- Create: `content/fact-check.md`
- Modify: `content/questions/*.json`

- [ ] **Step 1:** Para cada pergunta, ler o versículo citado em `data/bibles/pt.tsv` e `en.tsv` e confirmar: a resposta certa está lá, nenhum distrator também é verdadeiro, a ordem de cada `order` é a ordem bíblica, as traduções dizem o mesmo que o pt, o pt é de Portugal e o nível é adequado.
- [ ] **Step 2:** Corrigir ou apagar cada pergunta com problema; registar em `content/fact-check.md` uma linha por pergunta alterada ou removida, com o motivo.
- [ ] **Step 3:** `npm run bank:build`. Esperado: 0 erros, cada nível com ≥ 60 perguntas e os 3 tipos presentes. Se um nível ficar abaixo de 60, escrever perguntas novas nessa secção e repetir os passos 1 e 2 só para elas.
- [ ] **Step 4:** `git commit -m "content: verificação dos factos"`

### Task 12: Remover o editor e criar o "Novo jogo"

**Files:**
- Delete: `app/dashboard/quizzes/` (inteira), `components/dashboard/QuizEditor.tsx`, `components/dashboard/QuizCard.tsx`
- Create: `components/dashboard/NewGameForm.tsx`
- Modify: `app/dashboard/page.tsx`, `components/dashboard/DashboardNav.tsx`, `components/dashboard/SettingsForm.tsx`, `lib/quiz.ts` (fica só `ANSWER_STYLES`), `lib/types.ts`, `app/page.tsx`, `messages/{pt,fr,en,es}.json`

**Interfaces:**
- Consumes: `bank_counts()`, `create_session(p_level, p_count)`.
- `app/dashboard/page.tsx` (server) chama `bank_counts()` e renderiza `<NewGameForm counts={{ easy, medium, hard }} />`.
- `NewGameForm`: 3 cartões de nível (fácil, médio, difícil, com descrição curta) e botões 5/10/15/20, com 10 escolhido por defeito; números acima das perguntas disponíveis do nível ficam desativados; nível sem 5 perguntas fica desativado. Botão "Começar jogo" chama `create_session` e navega para `/host/<session_id>`. Erro mostra `common.error`.
- `lib/types.ts`: remover `EditorOption`, `EditorQuestion`, `EditorQuiz`, `QuizSummary`; `GameSession` troca `quiz_id` por `level: 'easy' | 'medium' | 'hard'` e `question_count: number`; `CurrentQuestion` ganha os campos da Task 2 (`type`, `options[].ref`, `correct_order`, `verse_text`, `reported`).
- Navegação: "Novo jogo" (`/dashboard`), "Descobrir", "Definições", "Sair".
- `SettingsForm`: retirar o campo da língua dos novos quizzes. Decisão do plano: a coluna `default_locale` fica na base, sem uso.
- Mensagens: remover o grupo `editor` e as chaves de quizzes de `dashboard`; acrescentar `newGame` (título, níveis com descrições, número de perguntas, começar, indisponível); reescrever no `landing` os passos e textos que falam em criar quizzes ("Escolhe o nível", "Partilha o PIN", "Joguem juntos"). As 4 línguas; pt de Portugal.

- [ ] **Step 1:** Apagar os ficheiros e escrever as alterações acima.
- [ ] **Step 2:** `npx tsc --noEmit`. Esperado: 0 erros.
- [ ] **Step 3:** `grep -rn "save_quiz\|get_quiz_for_edit\|quiz_translations\|QuizEditor\|QuizCard" app components lib messages`. Esperado: nada.
- [ ] **Step 4:** Verificar que as 4 mensagens têm as mesmas chaves: `node -e` que compara as chaves achatadas de `messages/*.json`. Esperado: sem diferenças.
- [ ] **Step 5:** `git commit -m "feat(ui): novo jogo por nível, editor removido"`

### Task 13: Ecrã do anfitrião e telemóvel para os 3 tipos

**Files:**
- Create: `components/game/OrderInput.tsx`, `components/game/VerseReveal.tsx`
- Modify: `components/game/HostGame.tsx`, `components/game/PlayerGame.tsx`, `messages/{pt,fr,en,es}.json`

**Interfaces:**
- Consumes: `CurrentQuestion` da Task 12, `submit_order`, `report_question`.
- `OrderInput({ items: QuestionOption[], disabled: boolean, onSubmit: (ids: string[]) => void })`: tocar nos itens por ordem atribui 1 a 4; tocar num item já numerado retira-o e os seguintes; botão "Confirmar" só ativo com os 4.
- `VerseReveal({ reference: string | null, text: string | null, size: 'lg' | 'sm' })`: referência e texto do versículo, com uma linha pequena com o nome da tradução (`bible.source` nas mensagens: Louis Segond 1910, King James Version, Reina-Valera 1909 e a pt escolhida, com a atribuição exigida pela licença registada em `content/SOURCES.md`); não renderiza nada sem texto e sem referência.
- Anfitrião:
  - `choice`: como hoje.
  - `verse`: enunciado com o versículo e `_____` em destaque; opções como hoje.
  - `order`: 4 cartões com as letras A a D na ordem de ecrã; na revelação, a lista pela ordem certa com a referência de cada item.
  - Revelação de `choice`/`verse`: `VerseReveal` grande por cima da classificação.
  - Botão "Reportar pergunta" na revelação; depois de carregar, mostra "Pergunta reportada" e fica desativado; usa `question.reported` para o estado inicial.
- Jogador:
  - `order`: `OrderInput`; envia com `submit_order`; depois mostra o ecrã "respondido" atual.
  - `myAnswer` passa a ler `option_id, order_ids, is_correct, points_awarded`.
  - Revelação: mantém certo/errado e pontos; `choice`/`verse` mostram `VerseReveal` pequeno; `order` mostra a ordem certa em lista.
- Mensagens novas nas 4 línguas: `bible.source`, instrução de ordenar, confirmar, limpar, ordem certa, completar o versículo, reportar, reportada.

- [ ] **Step 1:** Implementar as alterações acima.
- [ ] **Step 2:** `npx tsc --noEmit` e `npm run build`. Esperado: ambos sem erros.
- [ ] **Step 3:** Verificação manual contra uma base local de teste não é possível; a verificação de ponta a ponta fica na Task 15.
- [ ] **Step 4:** `git commit -m "feat(game): ordenar, completar versículo, versículo na revelação e reportar"`

### Task 14: Descobrir como explorador do banco

**Files:**
- Modify: `app/dashboard/discover/page.tsx`, `messages/{pt,fr,en,es}.json`

**Interfaces:**
- Consumes: tabelas do banco (Task 1, leitura para registados), `BOOKS` e `bookName` (Task 3).
- Parâmetros de URL: `level` (`easy|medium|hard`, opcional), `book` (código USFM, opcional), `page` (1 por defeito), 30 perguntas por página, ordenadas por ordem canónica do livro, capítulo, versículo.
- Cada cartão: tipo, nível, referência, enunciado na língua do utilizador e a resposta: opção certa, ordem certa com referências, ou a palavra em falta. Só perguntas ativas.
- Filtros: botões de nível e uma lista de livros só com os livros que têm perguntas; link "anterior/seguinte".

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `npx tsc --noEmit` e `npm run build`. Esperado: sem erros.
- [ ] **Step 3:** `git commit -m "feat(discover): explorar o banco por nível e livro"`

### Task 15: Publicar no Supabase e testar de ponta a ponta

- [ ] **Step 1:** No SQL Editor do projeto `lumen-quiz` (organização empresas_cru), aplicar `0002_question_bank.sql`. Esperado: "Success".
- [ ] **Step 2:** Aplicar cada `supabase/seed/bank-*.sql`. Esperado: `select level, count(*) from bank_questions where active group by level` com ≥ 60 em cada nível.
- [ ] **Step 3:** `npm run dev`, criar conta de anfitrião, lançar um jogo fácil com 5 perguntas; noutro separador anónimo, entrar com o PIN em francês. Confirmar: perguntas dos 3 tipos aparecem ao longo de alguns jogos; o versículo aparece na revelação nos dois ecrãs e na língua de cada um; ordenar funciona no telemóvel; reportar tira a pergunta de `bank_counts`; o pódio aparece no fim; o Descobrir filtra por nível e livro; no formulário, um nível com menos de 20 perguntas ativas desativa os números acima do disponível.
- [ ] **Step 4:** Atualizar `01 Projetos/Lumen Quiz.md` no segundo cérebro com o estado e as contagens finais do banco.
- [ ] **Step 5:** `git commit -m "chore: banco publicado"` se algum ficheiro mudou.
