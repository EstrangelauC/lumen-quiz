// Testa as migrações num Postgres local (PGlite).
// Uso: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();

// Simula o que o Supabase fornece: schema auth, auth.uid(), auth.jwt(), roles, grants e publicação
await db.exec(`
  create schema auth;
  create table auth.users (
    id uuid primary key, is_anonymous boolean default false,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb $$;
  create role anon; create role authenticated; create role service_role;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
  create publication supabase_realtime;
`);

for (const f of ['0001_init.sql', '0002_question_bank.sql']) {
  await db.exec(readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'));
  console.log(`✓ migração ${f} aplicada`);
}

const HOST = '11111111-1111-1111-1111-111111111111';
const P1 = '22222222-2222-2222-2222-222222222222';

async function as(uid, anon = false) {
  await db.exec(`select set_config('test.uid', '${uid}', false),
                        set_config('test.jwt', '{"is_anonymous": ${anon}}', false);`);
}
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
async function expectError(fn, code) {
  try { await fn(); } catch (e) {
    if (String(e.message).includes(code)) return console.log(`✓ erro esperado: ${code}`);
    throw new Error(`esperava ${code}, obtive ${e.message}`);
  }
  throw new Error(`esperava erro ${code}`);
}
// Corre fn com o papel `authenticated` (como o PostgREST), repondo o papel no fim
async function asAuthenticated(fn) {
  await db.exec('set role authenticated');
  try { return await fn(); } finally { await db.exec('reset role'); }
}

await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"display_name":"Neves"}')`, [HOST]);
await db.query(`insert into auth.users (id, is_anonymous) values ($1, true)`, [P1]);

const q = (id, level, texts = { prompt: 'Quem?' }, optionTexts = ['Noé', 'Moisés']) => ({
  id, type: 'choice', level, testament: 'ot', book: 'GEN', chapter: 6, verse_start: 14, verse_end: 14,
  texts: { pt: { bible_ref: 'Génesis 6:14', verse_text: null, ...texts } },
  options: optionTexts.map((t, i) => ({ position: i + 1, is_correct: i === 0, texts: { pt: { text: t, ref: null } } })),
});

// 1. Tabelas do quiz antigo removidas
const gone = await one(`select to_regclass('public.quizzes') r`);
if (gone.r !== null) throw new Error('quizzes ainda existe');
console.log('✓ tabelas de quizzes removidas');

// 2. Upsert: mesmo id duas vezes = 1 linha, com as opções da segunda chamada
await one(`select upsert_bank_question($1)`, [q('t-001', 'easy', { prompt: 'Primeira' }, ['A', 'B', 'C'])]);
const r2 = await one(`select upsert_bank_question($1) id`, [q('t-001', 'easy', { prompt: 'Segunda' }, ['X', 'Y'])]);
if (r2.id !== 't-001') throw new Error('upsert devolve o id');
const nq = await one(`select count(*)::int n from bank_questions where id = 't-001'`);
const opts = (await db.query(
  `select t.text from bank_options o join bank_option_texts t on t.option_id = o.id
    where o.question_id = 't-001' order by o.position`)).rows.map(r => r.text);
const pr = await one(`select prompt from bank_question_texts where question_id = 't-001' and locale = 'pt'`);
if (nq.n !== 1 || opts.join() !== 'X,Y' || pr.prompt !== 'Segunda') throw new Error('upsert ' + JSON.stringify({ nq, opts, pr }));
const orphans = await one(`select (select count(*) from bank_options)::int o, (select count(*) from bank_option_texts)::int t`);
if (orphans.o !== 2 || orphans.t !== 2) throw new Error('opções antigas por apagar');
console.log('✓ upsert: 1 linha, opções e textos da segunda chamada');

// 2b. Reimportar mantém os UUID das opções; menos opções apaga só as que sobram
const optIds = async (id) => (await db.query(
  `select id from bank_options where question_id = $1 order by position`, [id])).rows.map(r => r.id);
await one(`select upsert_bank_question($1)`, [q('t-007', 'easy', undefined, ['A', 'B', 'C'])]);
const ids1 = await optIds('t-007');
await one(`select upsert_bank_question($1)`, [q('t-007', 'easy', undefined, ['A2', 'B2', 'C2'])]);
const ids2 = await optIds('t-007');
if (ids1.length !== 3 || ids1.join() !== ids2.join()) throw new Error('reimportar mudou os UUID ' + JSON.stringify({ ids1, ids2 }));
const txt2 = (await db.query(`select t.text from bank_options o join bank_option_texts t on t.option_id = o.id
                               where o.question_id = 't-007' order by o.position`)).rows.map(r => r.text);
if (txt2.join() !== 'A2,B2,C2') throw new Error('textos das opções não substituídos ' + txt2);
await one(`select upsert_bank_question($1)`, [q('t-007', 'easy', undefined, ['A3', 'B3'])]);
const ids3 = await optIds('t-007');
if (ids3.join() !== ids1.slice(0, 2).join()) throw new Error('menos opções ' + JSON.stringify({ ids1, ids3 }));
const orph7 = await one(`select count(*)::int n from bank_option_texts where option_id = $1`, [ids1[2]]);
if (orph7.n !== 0) throw new Error('textos da opção apagada ficaram');
await db.query(`delete from bank_questions where id = 't-007'`);
console.log('✓ reimportar mantém os UUID das opções e apaga só as que sobram');

// 3. Reimportar não reativa nem repõe o contador
await db.query(`update bank_questions set active = false, reported_count = 1 where id = 't-001'`);
await one(`select upsert_bank_question($1)`, [q('t-001', 'easy')]);
const st = await one(`select active, reported_count from bank_questions where id = 't-001'`);
if (st.active !== false || st.reported_count !== 1) throw new Error('reativou ' + JSON.stringify(st));
console.log('✓ reimportar não reativa');

// 4. Anónimo não lê o banco
await as(P1, true);
const anonRead = await asAuthenticated(async () => ({
  opts: (await one(`select count(*)::int n from bank_options`)).n,
  qs: (await one(`select count(*)::int n from bank_questions`)).n,
}));
if (anonRead.opts !== 0 || anonRead.qs !== 0) throw new Error('anónimo leu o banco');
await asAuthenticated(() => expectError(() => db.query(`select bank_counts()`), 'not_registered'));
console.log('✓ anónimo não lê o banco');

// 5. bank_counts para registado (só ativas)
await one(`select upsert_bank_question($1)`, [q('t-002', 'easy')]);
await one(`select upsert_bank_question($1)`, [q('t-003', 'medium')]);
await one(`select upsert_bank_question($1)`, [q('t-004', 'hard')]);
await one(`select upsert_bank_question($1)`, [q('t-005', 'hard')]);
await as(HOST);
const counts = await asAuthenticated(async () => ({
  c: (await one(`select bank_counts() c`)).c,
  readable: (await one(`select count(*)::int n from bank_questions`)).n,
}));
if (counts.c.easy !== 1 || counts.c.medium !== 1 || counts.c.hard !== 2) throw new Error('bank_counts ' + JSON.stringify(counts.c));
if (counts.readable !== 5) throw new Error('registado deve ler o banco');
console.log('✓ bank_counts:', JSON.stringify(counts.c));

// 6. Autenticado não importa
await asAuthenticated(() => expectError(() => db.query(`select upsert_bank_question($1)`, [q('t-999', 'easy')]), 'permission denied'));

// service_role pode importar
await db.exec('set role service_role');
try { await one(`select upsert_bank_question($1)`, [q('t-006', 'easy')]); } finally { await db.exec('reset role'); }
console.log('✓ service_role importa');

// =====================================================================
// JOGO SORTEADO (Task 2)
// =====================================================================
const P2 = '33333333-3333-3333-3333-333333333333';
const P3 = '44444444-4444-4444-4444-444444444444';   // entra a meio de um 'order'
const P4 = '55555555-5555-5555-5555-555555555555';   // nunca entra
for (const u of [P2, P3, P4]) await db.query(`insert into auth.users (id, is_anonymous) values ($1, true)`, [u]);
// O Supabase dá select nas tabelas a anon/authenticated; quem filtra é a RLS
await db.exec(`grant select on public.game_sessions, public.session_questions, public.players, public.answers
                 to anon, authenticated`);
await db.query(`update profiles set default_time_limit_s = 25 where id = $1`, [HOST]);

// Banco limpo: 6 perguntas easy (2 de cada tipo) e 1 medium
await db.exec(`select set_config('test.uid', '', false), set_config('test.jwt', '', false);`);
await db.exec(`delete from bank_questions`);
const loc2 = (pt, fr) => ({ pt, fr });
const bank = (id, type, level) => {
  const base = { id, type, level, testament: 'ot', book: 'GEN', chapter: 1, verse_start: 1, verse_end: 1 };
  if (type === 'choice') return { ...base,
    texts: loc2({ prompt: `PT ${id}`, bible_ref: 'Génesis 1:1', verse_text: 'No princípio criou Deus os céus e a terra.' },
                { prompt: `FR ${id}`, bible_ref: 'Genèse 1:1', verse_text: 'Au commencement, Dieu créa les cieux et la terre.' }),
    options: ['Deus', 'Moisés', 'Noé'].map((t, i) => ({ position: i + 1, is_correct: i === 0,
      texts: loc2({ text: t }, { text: `fr-${t}` }) })) };
  if (type === 'order') return { ...base,
    texts: loc2({ prompt: `PT ${id}`, bible_ref: 'Génesis 1-4' }, { prompt: `FR ${id}`, bible_ref: 'Genèse 1-4' }),
    options: ['Criação', 'Queda', 'Caim', 'Dilúvio'].map((t, i) => ({ position: i + 1, is_correct: false,
      texts: loc2({ text: t, ref: `Gn ${i + 1}` }, { text: `fr-${t}`, ref: `Gn ${i + 1}` }) })) };
  return { ...base,
    texts: loc2({ prompt: `PT ${id}`, bible_ref: 'Génesis 1:1', verse_text: 'No princípio criou Deus os céus e a terra.' },
                { prompt: `FR ${id}`, bible_ref: 'Genèse 1:1', verse_text: 'Au commencement, Dieu créa les cieux et la terre.' }),
    options: ['Deus', 'Homem', 'Anjo', 'Rei'].map((t, i) => ({ position: i + 1, is_correct: i === 0,
      texts: loc2({ text: t }, { text: `fr-${t}` }) })) };
};
for (const [id, type] of [['g-c1', 'choice'], ['g-c2', 'choice'], ['g-o1', 'order'], ['g-o2', 'order'], ['g-v1', 'verse'], ['g-v2', 'verse']]) {
  await one(`select upsert_bank_question($1)`, [bank(id, type, 'easy')]);
}
await one(`select upsert_bank_question($1)`, [bank('g-m1', 'choice', 'medium')]);
console.log('✓ banco de jogo semeado (6 easy, 1 medium)');

// create_session: erros e sucesso
await as(P1, true);
await asAuthenticated(() => expectError(() => db.query(`select create_session('easy', 5)`), 'not_registered'));
await as(HOST);
await asAuthenticated(() => expectError(() => db.query(`select create_session('easy', 7)`), 'invalid_count'));
await asAuthenticated(() => expectError(() => db.query(`select create_session('medium', 5)`), 'not_enough_questions'));
await asAuthenticated(() => expectError(() => db.query(`select create_session('nope', 5)`), 'invalid_level'));
const created = await asAuthenticated(async () => (await one(`select create_session('easy', 5) s`)).s);
const SID = created.session_id;
if (!SID || !/^\d{6}$/.test(created.pin)) throw new Error('create_session ' + JSON.stringify(created));
const gs = await one(`select level::text, question_count, time_limit_s, status::text from game_sessions where id = $1`, [SID]);
if (gs.level !== 'easy' || gs.question_count !== 5 || gs.time_limit_s !== 25 || gs.status !== 'lobby')
  throw new Error('game_sessions ' + JSON.stringify(gs));
console.log('✓ create_session easy/5 com tempo do perfil');

// session_questions: 5 linhas, sem repetidos, order baralhado
const sqs = (await db.query(
  `select sq.position, sq.question_id, q.type::text type, to_jsonb(sq.display_order) d,
          (select jsonb_agg(o.id order by o.position) from bank_options o where o.question_id = sq.question_id) c
     from session_questions sq join bank_questions q on q.id = sq.question_id
    where sq.session_id = $1 order by sq.position`, [SID])).rows;
if (sqs.length !== 5 || new Set(sqs.map(r => r.question_id)).size !== 5) throw new Error('session_questions ' + JSON.stringify(sqs));
if (sqs.map(r => r.position).join() !== '1,2,3,4,5') throw new Error('posições de session_questions');
for (const r of sqs) {
  if ([...r.d].sort().join() !== [...r.c].sort().join()) throw new Error('display_order não tem as opções ' + r.question_id);
  if (r.type === 'order' && r.d.join() === r.c.join()) throw new Error('order não baralhado ' + r.question_id);
}
console.log('✓ session_questions: 5 sem repetidos, order baralhado');

// Ninguém lê session_questions diretamente
async function expectNoRows(sql) {
  try {
    const n = (await one(sql)).n;
    if (n !== 0) throw new Error(`leu ${n} linhas: ${sql}`);
  } catch (e) { if (!String(e.message).includes('permission denied')) throw e; }
}
await asAuthenticated(() => expectNoRows(`select count(*)::int n from session_questions`));
await as(P1, true);
await asAuthenticated(() => expectNoRows(`select count(*)::int n from session_questions`));
console.log('✓ session_questions inacessível');

// Jogadores entram
await asAuthenticated(() => one(`select join_session($1, 'Ana', 'fr')`, [created.pin]));
await as(P2, true);
await asAuthenticated(() => one(`select join_session($1, 'Rui', 'pt')`, [created.pin]));
console.log('✓ jogadores entram');

const cur = (uid, locale, anon = true) => (async () => {
  await as(uid, anon);
  return asAuthenticated(async () => (await one(`select get_current_question($1, $2) q`, [SID, locale])).q);
})();
const asUser = async (uid, anon, fn) => { await as(uid, anon); return asAuthenticated(fn); };
const submitOrder = (ids) => db.query(
  `select submit_order($1, array(select jsonb_array_elements_text($2::jsonb)::uuid))`, [SID, JSON.stringify(ids)]);
const hostDo = (fn) => asUser(HOST, false, () => db.query(`select ${fn}($1)`, [SID]));

// Antes de começar: lobby devolve null
if ((await cur(P1, 'fr')) !== null) throw new Error('lobby deve devolver null');
await asUser(P4, true, () => expectError(() => db.query(`select get_current_question($1, 'fr')`, [SID]), 'not_member'));

const scores = async () => Object.fromEntries((await db.query(
  `select user_id, score from players where session_id = $1`, [SID])).rows.map(r => [r.user_id, r.score]));
const pointsFor = async (qid) => Object.fromEntries((await db.query(
  `select p.user_id, a.points_awarded from answers a join players p on p.id = a.player_id
    where a.session_id = $1 and a.question_id = $2`, [SID, qid])).rows.map(r => [r.user_id, r.points_awarded]));
const ownVisible = (uid, qid) => asUser(uid, true, async () =>
  (await one(`select count(*)::int n from answers where question_id = $1`, [qid])).n);
let testedForeign = false, testedHidden = false;

let testedOrder = false, testedReport = false;
for (let pos = 1; pos <= 5; pos++) {
  await hostDo('next_question');
  const row = sqs[pos - 1];
  const g = await cur(P1, 'fr');

  // Durante a pergunta: nada que revele a resposta
  if (g.status !== 'question' || g.position !== pos || g.total !== 5 || g.type !== row.type) throw new Error('cabeçalho ' + JSON.stringify(g));
  if (g.correct_order !== null || g.verse_text !== null) throw new Error('fuga antes da revelação ' + JSON.stringify(g));
  if (g.options.some(o => o.is_correct !== null)) throw new Error('is_correct antes da revelação');
  if (g.options.map(o => o.position).join() !== g.options.map((_, i) => i + 1).join()) throw new Error('posições não são 1..n');
  if (g.options.map(o => o.id).join() !== row.d.join()) throw new Error('opções não seguem display_order');
  if (g.text !== `FR ${row.question_id}`) throw new Error('texto fr ' + g.text);
  if (g.reported !== false) throw new Error('reported inicial');
  if (g.my_answered !== false) throw new Error('my_answered antes de responder');
  const hostView = await cur(HOST, 'fr', false);
  if (hostView.my_answered !== false) throw new Error('my_answered do anfitrião');
  const scoresBefore = await scores();
  if (row.type === 'order') {
    if (g.options.map(o => o.id).join() === row.c.join()) throw new Error('order mostrado na ordem certa');
    if (g.time_limit_s !== 35) throw new Error('tempo de order ' + g.time_limit_s);
    if (g.options.some(o => o.ref !== null)) throw new Error('ref de order antes da revelação');
  } else {
    if (g.time_limit_s !== 25) throw new Error('tempo ' + g.time_limit_s);
    if (g.options.some(o => o.ref !== null)) throw new Error('ref fora de order');
  }
  if (pos === 1) {
    const es = await cur(P1, 'es');
    if (es.text !== `PT ${row.question_id}`) throw new Error('fallback pt ' + es.text);
    console.log('✓ recurso a pt quando falta a língua');
  }

  // Respostas
  if (row.type === 'order') {
    await asUser(P1, true, async () => {
      if (!testedOrder) {
        await expectError(() => db.query(`select submit_answer($1, $2)`, [SID, row.c[0]]), 'wrong_type');
        await expectError(() => submitOrder(row.c.slice(0, 3)), 'invalid_order');
        await expectError(() => submitOrder([row.c[0], row.c[0], row.c[1], row.c[2]]), 'invalid_order');
      }
      await submitOrder(row.c);
    });
    if ((await cur(P1, 'fr')).my_answered !== true) throw new Error('my_answered depois de responder');
    const a = await one(`select a.is_correct, a.points_awarded, a.option_id, to_jsonb(a.order_ids) o
                           from answers a join players p on p.id = a.player_id
                          where p.user_id = $1 and a.question_id = $2`, [P1, row.question_id]);
    if (!a.is_correct || a.points_awarded <= 900 || a.option_id !== null || a.o.join() !== row.c.join())
      throw new Error('ordem certa ' + JSON.stringify(a));
    if (!testedOrder) {
      // recarregar: volta a entrar e tenta de novo
      await asUser(P1, true, () => one(`select join_session($1, 'Ana', 'fr')`, [created.pin]));
      const again = await cur(P1, 'fr');
      if (again.question_id !== row.question_id) throw new Error('recarregar não devolve a pergunta atual');
      await asUser(P1, true, () => expectError(() => submitOrder(row.c), 'already_answered'));
      await asUser(P2, true, () => submitOrder([...row.c].reverse()));
      const b = await one(`select a.is_correct, a.points_awarded from answers a join players p on p.id = a.player_id
                            where p.user_id = $1 and a.question_id = $2`, [P2, row.question_id]);
      if (b.is_correct !== false || b.points_awarded !== 0) throw new Error('ordem errada ' + JSON.stringify(b));
      console.log('✓ submit_order: certa > 900, repetida recusada, errada 0');
      // Jogador novo entra a meio do 'order': recebe a pergunta e responde uma vez
      await asUser(P3, true, () => one(`select join_session($1, 'Eva', 'pt')`, [created.pin]));
      const late = await cur(P3, 'pt');
      if (late.question_id !== row.question_id || late.my_answered !== false || late.options.length !== 4)
        throw new Error('entrada a meio ' + JSON.stringify(late));
      await asUser(P3, true, () => submitOrder(late.options.map(o => o.id)));
      await asUser(P3, true, () => expectError(() => submitOrder(row.c), 'already_answered'));
      console.log('✓ jogador que entra a meio de um order responde uma vez');
      testedOrder = true;
    }
  } else {
    const correctId = (await one(`select id from bank_options where question_id = $1 and is_correct`, [row.question_id])).id;
    const foreign = (await one(`select o.id from bank_options o where o.question_id = 'g-m1' limit 1`)).id;
    await asUser(P1, true, async () => {
      await expectError(() => submitOrder(row.d), 'wrong_type');
      if (!testedForeign) {
        await expectError(() => db.query(`select submit_answer($1, $2)`, [SID, foreign]), 'invalid_option');
        testedForeign = true;
      }
      await db.query(`select submit_answer($1, $2)`, [SID, correctId]);
    });
    if ((await cur(P1, 'fr')).my_answered !== true) throw new Error('my_answered depois de responder');
  }

  // Antes da revelação: o jogador não vê a sua resposta e o marcador não mexe
  const pts = await pointsFor(row.question_id);
  if (!(P1 in pts)) throw new Error('resposta não gravada');
  if ((await ownVisible(P1, row.question_id)) !== 0) throw new Error('jogador viu a sua resposta antes da revelação');
  const hostSees = await asUser(HOST, false, async () =>
    (await one(`select count(*)::int n from answers where question_id = $1`, [row.question_id])).n);
  if (hostSees !== Object.keys(pts).length) throw new Error('anfitrião não vê as respostas');
  const scoresMid = await scores();
  if (Object.entries(scoresMid).some(([u, sc]) => sc !== (scoresBefore[u] ?? 0))) throw new Error('marcador mexeu antes da revelação');
  if (!testedHidden) { console.log('✓ antes da revelação: resposta escondida do jogador e marcador parado'); testedHidden = true; }

  // report antes da revelação / por jogador
  if (!testedReport) {
    await asUser(HOST, false, () => expectError(() => db.query(`select report_question($1)`, [SID]), 'not_in_reveal'));
  }

  await hostDo('reveal_answer');
  const scoresAfter = await scores();
  for (const [u, sc] of Object.entries(scoresAfter)) {
    if (sc !== (scoresBefore[u] ?? 0) + (pts[u] ?? 0)) throw new Error('marcador após revelação ' + JSON.stringify({ u, scoresBefore, scoresAfter, pts }));
  }
  if ((await ownVisible(P1, row.question_id)) !== 1) throw new Error('jogador não vê a resposta após revelação');
  await asUser(HOST, false, () => expectError(() => db.query(`select reveal_answer($1)`, [SID]), 'cannot_reveal'));
  if (JSON.stringify(await scores()) !== JSON.stringify(scoresAfter)) throw new Error('pontos somados duas vezes');
  const r = await cur(P1, 'fr');
  if (r.status !== 'reveal') throw new Error('status reveal');
  if (row.type === 'order') {
    if (!r.correct_order || r.correct_order.length !== 4 || r.correct_order.join() !== row.c.join()) throw new Error('correct_order ' + JSON.stringify(r));
    if (r.verse_text !== null || r.options.some(o => o.is_correct !== null)) throw new Error('order em reveal');
    if (r.options.some(o => !o.ref)) throw new Error('order sem ref na revelação');
  } else {
    if (!r.verse_text || !r.verse_text.startsWith('Au commencement')) throw new Error('verse_text fr ' + r.verse_text);
    if (r.correct_order !== null) throw new Error('correct_order fora de order');
    if (r.options.filter(o => o.is_correct === true).length !== 1 || r.options.some(o => typeof o.is_correct !== 'boolean'))
      throw new Error('is_correct em reveal ' + JSON.stringify(r.options));
  }

  if (!testedReport) {
    await asUser(P1, true, () => expectError(() => db.query(`select report_question($1)`, [SID]), 'not_host'));
    const before = await asUser(HOST, false, async () => (await one(`select bank_counts() c`)).c);
    await hostDo('report_question');
    await hostDo('report_question');
    const st2 = await one(`select active, reported_count from bank_questions where id = $1`, [row.question_id]);
    if (st2.active !== false || st2.reported_count !== 1) throw new Error('report ' + JSON.stringify(st2));
    const after = await asUser(HOST, false, async () => (await one(`select bank_counts() c`)).c);
    if (after.easy !== before.easy - 1) throw new Error('bank_counts após report ' + JSON.stringify({ before, after }));
    const rr = await cur(P1, 'fr');
    if (rr.reported !== true) throw new Error('reported após report');
    console.log('✓ report_question: só anfitrião, só em reveal, conta uma vez');
    testedReport = true;
  }
}
if (!testedOrder) throw new Error('nenhum order sorteado');
console.log('✓ sem fugas antes da revelação em todas as perguntas; revelação correta');

await hostDo('next_question');
const fin = await one(`select status::text from game_sessions where id = $1`, [SID]);
if (fin.status !== 'finished') throw new Error('não terminou ' + fin.status);
if ((await cur(P1, 'fr')) !== null) throw new Error('finished deve devolver null');
console.log('✓ jogo termina em finished');

console.log('\nTODOS OS TESTES PASSARAM');
