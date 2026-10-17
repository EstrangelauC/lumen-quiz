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

console.log('\nTODOS OS TESTES PASSARAM');
