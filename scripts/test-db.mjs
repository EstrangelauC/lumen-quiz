// Testa a migração num Postgres local (PGlite) e simula um jogo completo.
// Uso: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();

// Simula o que o Supabase fornece: schema auth, auth.uid(), auth.jwt(), roles e publicação
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
  create role anon; create role authenticated;
  create publication supabase_realtime;
`);

await db.exec(readFileSync(new URL('../supabase/migrations/0001_init.sql', import.meta.url), 'utf8'));
console.log('✓ migração aplicada');

const HOST = '11111111-1111-1111-1111-111111111111';
const P1 = '22222222-2222-2222-2222-222222222222';
const P2 = '33333333-3333-3333-3333-333333333333';

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

// Registo: o trigger cria o perfil só para contas com e-mail
await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"display_name":"Neves"}')`, [HOST]);
await db.query(`insert into auth.users (id, is_anonymous) values ($1, true), ($2, true)`, [P1, P2]);
const prof = await one(`select count(*)::int n, max(display_name) name from profiles`);
if (prof.n !== 1 || prof.name !== 'Neves') throw new Error('perfil');
console.log('✓ perfil criado só para o anfitrião');

// Anónimo não pode criar quizzes
await as(P1, true);
await expectError(() => db.query(`select save_quiz('{}'::jsonb)`), 'not_registered');

// Anfitrião cria um quiz multilingue
await as(HOST);
const quiz = {
  default_locale: 'pt', is_public: false,
  titles: { pt: 'Teste', fr: 'Test', en: '' },
  questions: [
    { time_limit_s: 20, bible_ref: 'João 3:16', texts: { pt: 'Quem amou o mundo?', fr: 'Qui a aimé le monde ?' },
      options: [{ is_correct: true, texts: { pt: 'Deus', fr: 'Dieu' } }, { is_correct: false, texts: { pt: 'Pedro' } }] },
    { time_limit_s: 10, bible_ref: '', texts: { pt: 'Verdadeiro?' },
      options: [{ is_correct: false, texts: { pt: 'Não' } }, { is_correct: true, texts: { pt: 'Sim' } }] },
  ],
};
await expectError(() => db.query(`select save_quiz($1)`, [{ ...quiz, questions: [{ ...quiz.questions[0], options: quiz.questions[0].options.map(o => ({ ...o, is_correct: true })) }] }]), 'need_one_correct');
const { save_quiz: quizId } = await one(`select save_quiz($1)`, [quiz]);
const edit = (await one(`select get_quiz_for_edit($1) j`, [quizId])).j;
if (edit.questions.length !== 2 || edit.titles.en !== undefined || edit.questions[0].options[0].is_correct !== true) throw new Error('edit');
console.log('✓ save_quiz + get_quiz_for_edit (traduções vazias ignoradas)');

// Editar (substituir) mantém o mesmo id
await one(`select save_quiz($1)`, [{ ...edit, is_public: true }]);
if (!(await one(`select is_public from quizzes where id=$1`, [quizId])).is_public) throw new Error('update');
console.log('✓ editar quiz');

// Sessão
const sess = (await one(`select create_session($1) j`, [quizId])).j;
if (!/^\d{6}$/.test(sess.pin)) throw new Error('pin');
console.log(`✓ sessão criada com PIN ${sess.pin}`);

await as(P1, true);
await expectError(() => db.query(`select create_session($1)`, [quizId]), 'not_registered');
await expectError(() => db.query(`select join_session('000000','Ana','pt')`), 'session_not_found');
const j1 = (await one(`select join_session($1,'Ana','fr') j`, [sess.pin])).j;
const j1b = (await one(`select join_session($1,'Ana','fr') j`, [sess.pin])).j;
if (j1.player_id !== j1b.player_id) throw new Error('idempotente');
console.log('✓ jogador entra (e reentrar devolve o mesmo jogador)');
await as(P2, true);
await expectError(() => db.query(`select join_session($1,'ana','pt')`, [sess.pin]), 'nickname_taken');
await one(`select join_session($1,'Bruno','pt')`, [sess.pin]);

// Jogador não pode avançar o jogo
await expectError(() => db.query(`select next_question($1)`, [sess.session_id]), 'not_host');

// Pergunta 1
await as(HOST);
await one(`select next_question($1)`, [sess.session_id]);
await as(P1, true);
const q1 = (await one(`select get_current_question($1,'fr') j`, [sess.session_id])).j;
if (q1.text !== 'Qui a aimé le monde ?' || q1.options[1].text !== 'Pedro' || q1.options[0].is_correct !== null) throw new Error('q1 fr/fallback');
console.log('✓ pergunta em francês, fallback para pt na opção sem tradução, resposta escondida');
await one(`select submit_answer($1,$2)`, [sess.session_id, q1.options[0].id]);
await expectError(() => db.query(`select submit_answer($1,$2)`, [sess.session_id, q1.options[0].id]), 'already_answered');
await as(P2, true);
await one(`select submit_answer($1,$2)`, [sess.session_id, q1.options[1].id]);

await as(HOST);
await one(`select reveal_answer($1)`, [sess.session_id]);
const rev = (await one(`select get_current_question($1,'pt') j`, [sess.session_id])).j;
if (rev.options[0].is_correct !== true) throw new Error('reveal');
await as(P1, true);
await expectError(() => db.query(`select submit_answer($1,$2)`, [sess.session_id, q1.options[0].id]), 'not_accepting_answers');
const scores = (await db.query(`select nickname, score from players order by score desc`)).rows;
if (scores[0].nickname !== 'Ana' || scores[0].score < 900 || scores[1].score !== 0) throw new Error('scores ' + JSON.stringify(scores));
console.log('✓ pontuação:', scores.map(s => `${s.nickname}=${s.score}`).join(', '));

// Pergunta 2 e fim
await as(HOST);
await one(`select next_question($1)`, [sess.session_id]);
await one(`select next_question($1)`, [sess.session_id]);
const st = await one(`select status from game_sessions where id=$1`, [sess.session_id]);
if (st.status !== 'finished') throw new Error('finished');
console.log('✓ jogo terminado');

// Quiz oficial público + apagar quiz próprio
const pub = await one(`select count(*)::int n from quizzes where is_public`);
await one(`delete from quizzes where id=$1 returning id`, [quizId]);
console.log(`✓ ${pub.n} quizzes públicos; apagar quiz com sessões funciona (cascata)`);

console.log('\nTODOS OS TESTES PASSARAM');
