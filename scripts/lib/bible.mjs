import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import books from '../../lib/bible-books.json' with { type: 'json' };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_BIBLE_DIR = path.join(ROOT, 'data', 'bibles');

// Lê <dir>/<locale>.tsv (CÓDIGO\tcapítulo\tversículo\ttexto) para um Map "GEN 1:1" -> texto.
export function loadBible(locale, dir = DEFAULT_BIBLE_DIR) {
  const file = path.join(dir, `${locale}.tsv`);
  if (!fs.existsSync(file)) throw new Error(`Bíblia não encontrada: ${file} (corra npm run bibles:fetch)`);
  const bible = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    const [book, chapter, verse, ...rest] = line.split('\t');
    bible.set(`${book} ${Number(chapter)}:${Number(verse)}`, rest.join('\t'));
  }
  return bible;
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
