import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, vplToTsv, validateTsv } from './bible/fetch-bibles.mjs';

test('cleanText remove [ ] mantendo as palavras', () => {
  assert.equal(cleanText('darkness [was] upon the face of the deep'), 'darkness was upon the face of the deep');
  assert.equal(cleanText('a [b] [c], d'), 'a b c, d');
});

test('cleanText remove ¶, colapsa espaços e apara', () => {
  assert.equal(cleanText('¶ For  God\t so   loved '), 'For God so loved');
});

test('vplToTsv mapeia códigos para USFM, filtra apócrifos e salta vazios', () => {
  const vpl = [
    'GEN 1:1 In the [beginning]',
    'JOH 3:16 ¶ For God',
    'SOL 1:1 Song',
    '1JO 1:1 First John',
    'TOB 1:1 Apocrypha',
    'GEN 1:2 ',
    'GEN 1:3 [ ]',
    'linha inválida',
  ].join('\n');
  assert.equal(
    vplToTsv(vpl),
    'GEN\t1\t1\tIn the beginning\nJHN\t3\t16\tFor God\nSNG\t1\t1\tSong\n1JN\t1\t1\tFirst John\n',
  );
});

test('validateTsv rejeita resultados incompletos', () => {
  assert.throws(() => validateTsv('xx', 'GEN\t1\t1\ttexto\n'), /xx/);
});
