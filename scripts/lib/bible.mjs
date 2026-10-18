import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import books from '../../lib/bible-books.json' with { type: 'json' };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_BIBLE_DIR = path.join(ROOT, 'data', 'bibles');

export const DEFAULT_CORRECTIONS = path.join(ROOT, 'content', 'bible-corrections.json');

// O mesmo diretório escrito de outra forma (relativo, com "/" final, "..") conta como o por omissão.
export function isDefaultBibleDir(dir) {
  return path.resolve(dir) === path.resolve(DEFAULT_BIBLE_DIR);
}

// Lê <dir>/<locale>.tsv (CÓDIGO\tcapítulo\tversículo\ttexto) para um Map "GEN 1:1" -> texto.
// `corrections` (objeto { locale: { "GEN 1:1": texto } } ou caminho para um JSON) corrige gralhas
// tipográficas da fonte; por omissão aplica content/bible-corrections.json só à Bíblia real
// (dir por omissão), nunca a fixtures. Uma correção para um versículo inexistente é um erro.
export function loadBible(locale, dir = DEFAULT_BIBLE_DIR, corrections = isDefaultBibleDir(dir) ? DEFAULT_CORRECTIONS : null) {
  const file = path.join(dir, `${locale}.tsv`);
  if (!fs.existsSync(file)) throw new Error(`Bíblia não encontrada: ${file} (corra npm run bibles:fetch)`);
  const bible = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    const [book, chapter, verse, ...rest] = line.split('\t');
    bible.set(`${book} ${Number(chapter)}:${Number(verse)}`, rest.join('\t'));
  }
  if (locale === 'es') fixDropCaps(bible);
  if (corrections) {
    const all = typeof corrections === 'string' ? JSON.parse(fs.readFileSync(corrections, 'utf8')) : corrections;
    for (const [key, text] of Object.entries(all[locale] ?? {})) {
      if (!bible.has(key)) throw new Error(`Correção para versículo inexistente: ${locale} ${key}`);
      bible.set(key, text);
    }
  }
  return bible;
}

// A Reina-Valera 1909 escreve em maiúsculas a(s) primeira(s) palavra(s) de cada capítulo
// ("Y HABÍA un varón", "HIJOS, obedeced"). Repõe a caixa normal: cada palavra fica na forma
// (minúscula ou nome próprio) mais frequente no resto da Bíblia, e a primeira leva maiúscula.
const CAPS_WORD = /^[A-ZÁÉÍÓÚÑÜ]+$/;
function fixDropCaps(bible) {
  const freq = new Map();
  for (const text of bible.values()) {
    for (const w of text.match(/\p{L}+/gu) ?? []) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  for (const [key, text] of bible) {
    const words = text.split(' ');
    let n = 0;
    while (n < words.length && CAPS_WORD.test(words[n].replace(/[^\p{L}]/gu, '')) && words[n].replace(/[^\p{L}]/gu, '')) n++;
    if (!words.slice(0, n).some((w) => w.replace(/[^\p{L}]/gu, '').length > 1)) continue;
    for (let i = 0; i < n; i++) {
      words[i] = words[i].replace(/\p{L}+/gu, (w) => {
        const lower = w.toLowerCase();
        const title = lower[0].toUpperCase() + lower.slice(1);
        const word = (freq.get(title) ?? 0) > (freq.get(lower) ?? 0) ? title : lower;
        return i === 0 ? word[0].toUpperCase() + word.slice(1) : word;
      });
    }
    bible.set(key, words.join(' '));
  }
}

// Versículos de verse_start a verse_end (inclusive) unidos por espaço; null se faltar algum.
export function getPassage(bible, { book, chapter, verse_start, verse_end }) {
  if (verse_start == null) return null;
  const end = verse_end ?? verse_start;
  if (end < verse_start) return null;
  const parts = [];
  for (let v = verse_start; v <= end; v++) {
    const text = bible.get(`${book} ${chapter}:${v}`);
    if (text === undefined) return null;
    parts.push(text);
  }
  return parts.join(' ');
}

// "João 3:16", "João 3:16-17", "Génesis 7" (sem versículo).
export function formatRef(locale, { book, chapter, verse_start, verse_end }) {
  const entry = books.find((b) => b.code === book);
  if (!entry) throw new Error(`Livro desconhecido: ${book}`);
  const name = entry.names[locale];
  if (verse_start == null) return `${name} ${chapter}`;
  const range = verse_end != null && verse_end !== verse_start ? `${verse_start}-${verse_end}` : `${verse_start}`;
  return `${name} ${chapter}:${range}`;
}
