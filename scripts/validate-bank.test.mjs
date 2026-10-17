import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBible } from './lib/bible.mjs';
import { validateQuestion, buildQuestion } from './lib/validate-bank.mjs';
import { buildBank } from './build-bank.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'bibles');
const bibles = Object.fromEntries(['pt', 'fr', 'en', 'es'].map((l) => [l, loadBible(l, FIX)]));
const L = (pt, fr = pt, en = pt, es = pt) => ({ pt, fr, en, es });

const choice = (over = {}) => ({
  id: 'jhn-easy-001', type: 'choice', level: 'easy', book: 'JHN', chapter: 3, verse_start: 16, verse_end: 16,
  prompt: L('Quem Deus amou?', 'Qui Dieu a-t-il aimé ?', 'Whom did God love?', '¿A quién amó Dios?'),
  options: [
    { correct: true, text: L('O mundo', 'Le monde', 'The world', 'El mundo') },
    { correct: false, text: L('Os anjos', 'Les anges', 'The angels', 'Los ángeles') },
  ],
  ...over,
});
const verse = (over = {}) => ({
  id: 'jhn-easy-002', type: 'verse', level: 'easy', book: 'JHN', chapter: 3, verse_start: 16, verse_end: 16,
  blank: L('amou', 'aimé', 'loved', 'amó'),
  distractors: [L('odiou', 'haï', 'hated', 'odió'), L('enviou', 'envoyé', 'sent', 'envió'), L('viu', 'vu', 'saw', 'vio')],
  ...over,
});
const item = (book, chapter, verse_start = null, verse_end = null, name = 'x') => ({ book, chapter, verse_start, verse_end, text: L(name) });
const order = (items) => ({
  id: 'gen-easy-002', type: 'order', level: 'easy',
  prompt: L('Ordena os episódios.', 'Mets en ordre.', 'Put in order.', 'Ordena.'),
  items: items ?? [item('GEN', 1, 1, 1, 'a'), item('GEN', 7, 1, 1, 'b'), item('EXO', 3, 2, 2, 'c'), item('EXO', 14, 21, 21, 'd')],
});
const v = (q, ctx) => validateQuestion(q, bibles, ctx);

test('choice válido: sem erros', () => {
  const r = v(choice());
  assert.deepEqual(r.errors, []);
});

test('choice com 2 opções correct: erro', () => {
  const q = choice();
  q.options[1].correct = true;
  assert.ok(v(q).errors.some((e) => /correct/.test(e)));
});

test('choice sem es: erro', () => {
  const q = choice();
  delete q.prompt.es;
  assert.ok(v(q).errors.some((e) => /es/.test(e)));
});

test('id inválido e duplicado: erro', () => {
  assert.ok(v(choice({ id: 'Bad_ID' })).errors.some((e) => /id/.test(e)));
  const ctx = { ids: new Set() };
  assert.deepEqual(v(choice(), ctx).errors, []);
  assert.ok(v(choice(), ctx).errors.some((e) => /duplicado/.test(e)));
});

test('verse: prompt tem _____ e não tem a palavra; verse_text completo', () => {
  const q = verse();
  assert.deepEqual(v(q).errors, []);
  const b = buildQuestion(q, bibles);
  assert.match(b.texts.pt.prompt, /_____/);
  assert.doesNotMatch(b.texts.pt.prompt, /\bamou\b/);
  assert.match(b.texts.pt.verse_text, /amou/);
  assert.equal(b.options.length, 4);
  assert.equal(b.options.filter((o) => o.is_correct).length, 1);
  const correct = b.options.find((o) => o.is_correct);
  assert.equal(correct.texts.fr.text, 'aimé');
  assert.deepEqual(b.options.map((o) => o.position), [1, 2, 3, 4]);
});

test('verse: blank inexistente é erro', () => {
  const q = verse({ blank: L('xyzzy', 'aimé', 'loved', 'amó') });
  assert.ok(v(q).errors.some((e) => /blank/.test(e)));
});

test('verse: só palavra inteira (am não está em amou)', () => {
  const q = verse({ blank: L('am', 'aimé', 'loved', 'amó') });
  assert.ok(v(q).errors.some((e) => /blank/.test(e)));
});

test('verse: palavra repetida dá aviso e só a primeira fica em branco', () => {
  const q = verse({ id: 'jhn-medium-002', level: 'medium', verse_end: 17, blank: L('mundo', 'monde', 'world', 'mundo') });
  const r = v(q);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /mais de uma vez/.test(w)));
  const b = buildQuestion(q, bibles);
  assert.equal(b.texts.pt.prompt.match(/_____/g).length, 1);
});

test('verse: distractor igual ao blank e número de distractors: erro', () => {
  const q = verse();
  q.distractors[0] = L('amou', 'haï', 'hated', 'odió');
  assert.ok(v(q).errors.some((e) => /distrator/.test(e)));
  assert.ok(v(verse({ distractors: [verse().distractors[0]] })).errors.some((e) => /3 distractors/.test(e)));
});

test('verse: easy com mais de um versículo é erro', () => {
  const q = verse({ verse_end: 17, blank: L('amou', 'aimé', 'loved', 'amó') });
  assert.ok(v(q).errors.some((e) => /easy/.test(e)));
});

test('verse: baralhar é determinístico por id', () => {
  const a = buildQuestion(verse(), bibles);
  const b = buildQuestion(verse(), bibles);
  assert.deepEqual(a, b);
});

test('order com 3 itens: erro; com 4 itens: position 3 em options[2]', () => {
  const three = order([item('GEN', 1, 1, 1), item('GEN', 7, 1, 1), item('EXO', 3, 2, 2)]);
  assert.ok(v(three).errors.some((e) => /4 items/.test(e)));
  const q = order();
  assert.deepEqual(v(q).errors, []);
  const b = buildQuestion(q, bibles);
  assert.equal(b.options[2].position, 3);
  assert.equal(b.options[2].texts.pt.ref, 'Êxodo 3:2');
  assert.equal(b.options[0].is_correct, false);
  assert.equal(b.book, 'GEN');
});

test('order com capítulo inteiro (verse_start null) é aceite', () => {
  const q = order([item('GEN', 1), item('GEN', 7), item('EXO', 3), item('EXO', 14)]);
  assert.deepEqual(v(q).errors, []);
  assert.equal(buildQuestion(q, bibles).options[1].texts.pt.ref, 'Génesis 7');
});

test('order com referência inexistente: erro', () => {
  const q = order([item('GEN', 1, 1, 1), item('GEN', 7, 99, 99), item('EXO', 3, 2, 2), item('EXO', 14, 21, 21)]);
  assert.ok(v(q).errors.some((e) => /não existe/.test(e)));
});

test('referência inexistente e 3 versículos: erro', () => {
  assert.ok(v(choice({ verse_start: 99, verse_end: 99 })).errors.some((e) => /não existe/.test(e)));
  assert.ok(v(choice({ verse_start: 16, verse_end: 18 })).errors.some((e) => /versículos/.test(e)));
});

test('versículo longo: aviso > 300, erro > 360', () => {
  const mk = (n) => ({ ...bibles, pt: new Map([...bibles.pt, ['JHN 3:16', 'a'.repeat(n)]]) });
  assert.ok(validateQuestion(choice(), mk(310)).warnings.some((w) => /300/.test(w)));
  assert.ok(validateQuestion(choice(), mk(400)).errors.some((e) => /360/.test(e)));
});

test('português de Portugal: aviso com "você"', () => {
  const q = choice();
  q.prompt.pt = 'O que você acha?';
  assert.ok(v(q).warnings.some((w) => /você/.test(w)));
});

test('Salmos: aviso de numeração em fr', () => {
  const q = choice({ book: 'PSA', chapter: 23, verse_start: 1, verse_end: 1 });
  const r = validateQuestion(q, { ...bibles, ...Object.fromEntries(['pt', 'fr', 'en', 'es'].map((l) => [l, new Map([...bibles[l], ['PSA 23:1', 'x']])])) });
  assert.ok(r.warnings.some((w) => /Salmos/.test(w)));
});

test('buildQuestion choice: verse_text e bible_ref nas 4 línguas', () => {
  const b = buildQuestion(choice(), bibles);
  for (const l of ['pt', 'fr', 'en', 'es']) {
    assert.ok(b.texts[l].verse_text.length > 10);
    assert.ok(b.texts[l].bible_ref);
  }
  assert.equal(b.texts.fr.bible_ref, 'Jean 3:16');
  assert.equal(b.testament, 'nt');
  assert.equal(b.options[0].position, 1);
});

test('buildBank sobre as fixtures: sem erros, SQL e json num diretório temporário', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bank-'));
  const r = buildBank({ dir: path.join(HERE, 'fixtures', 'questions'), biblesDir: FIX, outDir: out });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.counts.easy, { choice: 2, order: 2, verse: 2 });
  assert.equal(r.counts.medium.choice, 1);
  const sql = fs.readFileSync(path.join(out, 'bank-sample.sql'), 'utf8');
  assert.equal((sql.match(/upsert_bank_question\(\$json\$/g) ?? []).length, 7);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'bank.generated.json'), 'utf8')).length, 7);
  // reconstruir dá o mesmo SQL
  const out2 = fs.mkdtempSync(path.join(os.tmpdir(), 'bank-'));
  buildBank({ dir: path.join(HERE, 'fixtures', 'questions'), biblesDir: FIX, outDir: out2 });
  assert.equal(fs.readFileSync(path.join(out2, 'bank-sample.sql'), 'utf8'), sql);
});
