import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(new URL('../lib/biblical-background.ts', import.meta.url));
const source = readFileSync(new URL('../lib/biblical-background.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(require, module, module.exports);
const { biblicalScene, BOOK_SCENES } = module.exports;
const books = JSON.parse(readFileSync(new URL('../lib/bible-books.json', import.meta.url), 'utf8'));
test('all 66 books resolve in every supported language', () => {
  assert.equal(books.length, 66);
  for (const book of books) {
    assert.ok(Number.isInteger(BOOK_SCENES[book.code]), book.code);
    for (const name of Object.values(book.names)) {
      const scene = biblicalScene(`${name} 1:1`);
      assert.ok(Number.isInteger(scene) && scene >= 0 && scene < 24, name);
    }
  }
});
test('major chapter ranges select different artwork', () => {
  assert.equal(biblicalScene('Génesis 1:1'), 0);
  assert.equal(biblicalScene('Genesis 6:14'), 1);
  assert.equal(biblicalScene('Genesis 40:1'), 3);
  assert.equal(biblicalScene('Rute 1:1'), 8);
  assert.equal(biblicalScene('Mateus 28:1'), 21);
  assert.equal(biblicalScene('Apocalipse 22:1'), 23);
  assert.equal(biblicalScene('João 11:25'), 19);
});
test('unknown or absent references use neutral fallback', () => {
  for (const ref of [null, '', 'Unknown 1:1', 'invalid']) assert.equal(biblicalScene(ref), null);
});
