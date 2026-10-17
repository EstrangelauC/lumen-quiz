import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import books from '../lib/bible-books.json' with { type: 'json' };
import { loadBible, getPassage, formatRef } from './lib/bible.mjs';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'bibles');
const LOCALES = ['pt', 'fr', 'en', 'es'];
const bibles = Object.fromEntries(LOCALES.map((l) => [l, loadBible(l, fixtures)]));

test('getPassage devolve o texto de um versículo', () => {
  const pt = bibles.pt;
  const v16 = pt.get('JHN 3:16');
  assert.ok(v16 && v16.length > 10);
  assert.equal(getPassage(pt, { book: 'JHN', chapter: 3, verse_start: 16, verse_end: 16 }), v16);
  assert.equal(getPassage(pt, { book: 'JHN', chapter: 3, verse_start: 16, verse_end: null }), v16);
});

test('getPassage une versículos com espaço', () => {
  const pt = bibles.pt;
  assert.equal(
    getPassage(pt, { book: 'JHN', chapter: 3, verse_start: 16, verse_end: 17 }),
    `${pt.get('JHN 3:16')} ${pt.get('JHN 3:17')}`,
  );
});

test('getPassage devolve null se faltar algum versículo', () => {
  assert.equal(getPassage(bibles.pt, { book: 'JHN', chapter: 3, verse_start: 99, verse_end: 99 }), null);
  assert.equal(getPassage(bibles.pt, { book: 'JHN', chapter: 3, verse_start: 17, verse_end: 99 }), null);
});

test('loadBible lê as 4 línguas com os versículos de fixture', () => {
  const refs = ['GEN 1:1', 'GEN 7:1', 'EXO 3:2', 'EXO 14:21', 'JHN 3:16', 'JHN 3:17', 'JHN 3:18'];
  for (const l of LOCALES) for (const r of refs) assert.ok(bibles[l].get(r), `${l} ${r}`);
});

test('formatRef', () => {
  assert.equal(formatRef('pt', { book: 'JHN', chapter: 3, verse_start: 16, verse_end: 17 }), 'João 3:16-17');
  assert.equal(formatRef('pt', { book: 'JHN', chapter: 3, verse_start: 16, verse_end: 16 }), 'João 3:16');
  assert.equal(formatRef('fr', { book: 'GEN', chapter: 1, verse_start: 1, verse_end: 1 }), 'Genèse 1:1');
  assert.equal(formatRef('pt', { book: 'GEN', chapter: 7, verse_start: null, verse_end: null }), 'Génesis 7');
});

test('66 livros, 39 AT e 27 NT, com os 4 nomes', () => {
  assert.equal(books.length, 66);
  assert.equal(books.filter((b) => b.testament === 'ot').length, 39);
  assert.equal(books.filter((b) => b.testament === 'nt').length, 27);
  assert.equal(new Set(books.map((b) => b.code)).size, 66);
  for (const b of books) for (const l of LOCALES) assert.ok(b.names[l], `${b.code} ${l}`);
  assert.equal(books[0].code, 'GEN');
  assert.equal(books[65].code, 'REV');
});

test('loadBible aplica as correções do locale', () => {
  const corrected = loadBible('pt', fixtures, { pt: { 'JHN 3:16': 'texto corrigido' }, en: { 'JHN 3:16': 'outro' } });
  assert.equal(corrected.get('JHN 3:16'), 'texto corrigido');
  assert.equal(corrected.get('JHN 3:17'), bibles.pt.get('JHN 3:17'));
});

test('loadBible lança erro se a correção aponta para um versículo inexistente', () => {
  assert.throws(() => loadBible('pt', fixtures, { pt: { 'HAG 1:1': 'x' } }), /inexistente/);
});

test('loadBible sem correções deixa as fixtures intactas', () => {
  for (const l of LOCALES) assert.equal(bibles[l].get('JHN 3:16'), loadBible(l, fixtures, null).get('JHN 3:16'));
});
