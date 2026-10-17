// Descarrega as Bíblias de domínio público/licença aberta de eBible.org (formato VPL)
// e converte-as para data/bibles/<locale>.tsv (CÓDIGO\tcapítulo\tversículo\ttexto).
// Fontes e licenças: content/SOURCES.md.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import books from '../../lib/bible-books.json' with { type: 'json' };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = path.join(ROOT, 'data', 'bibles');
const RAW_DIR = path.join(OUT_DIR, 'raw');

const TRANSLATIONS = {
  pt: 'porbr2018', // Bíblia Livre (CC BY 4.0), a partir de Almeida
  fr: 'fraLSG', // Louis Segond 1910
  en: 'eng-kjv', // King James Version (1769)
  es: 'spaRV1909', // Reina-Valera 1909
};

// Códigos do VPL do eBible que diferem do USFM.
const EBIBLE_TO_USFM = {
  SOL: 'SNG', EZE: 'EZK', JOE: 'JOL', NAH: 'NAM', MAR: 'MRK', JOH: 'JHN',
  PHI: 'PHP', JAM: 'JAS', '1JO': '1JN', '2JO': '2JN', '3JO': '3JN',
};
const CANON = new Set(books.map((b) => b.code)); // exclui apócrifos

export function cleanText(text) {
  return text
    .replace(/¶/g, ' ') // marca de parágrafo
    .replace(/[\[\]]/g, '') // palavras acrescentadas pelos tradutores: fica o texto, sai a marca
    .replace(/\\[a-z]+\*?/gi, ' ') // restos de marcadores USFM
    .replace(/\s+/g, ' ')
    .trim();
}

export function vplToTsv(vpl) {
  const lines = [];
  for (const raw of vpl.split(/\r?\n/)) {
    const m = /^(\S+) (\d+):(\d+) (.*)$/.exec(raw);
    if (!m) continue;
    const code = EBIBLE_TO_USFM[m[1]] ?? m[1];
    if (!CANON.has(code)) continue;
    const text = cleanText(m[4]);
    if (!text) continue;
    lines.push(`${code}\t${Number(m[2])}\t${Number(m[3])}\t${text}`);
  }
  return lines.join('\n') + '\n';
}

// Falha com mensagem clara se a conversão não parecer uma Bíblia completa.
export function validateTsv(label, tsv) {
  const lines = tsv.split('\n').filter(Boolean);
  if (lines.length < 30000) throw new Error(`${label}: só ${lines.length} versículos (mínimo 30000)`);
  const present = new Set(lines.map((l) => l.split('\t')[0]));
  const missing = books.filter((b) => !present.has(b.code)).map((b) => b.code);
  if (missing.length) throw new Error(`${label}: faltam livros: ${missing.join(', ')}`);
  if (!lines.some((l) => l.startsWith('JHN\t3\t16\t'))) throw new Error(`${label}: falta JHN 3:16`);
}

async function download(id, dest) {
  const url = `https://ebible.org/Scriptures/${id}_vpl.zip`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  fs.writeFileSync(`${dest}.part`, Buffer.from(await res.arrayBuffer()));
  fs.renameSync(`${dest}.part`, dest);
}

async function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  for (const [locale, id] of Object.entries(TRANSLATIONS)) {
    const zip = path.join(RAW_DIR, `${id}_vpl.zip`);
    const dir = path.join(RAW_DIR, id);
    if (!fs.existsSync(zip)) await download(id, zip);
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('unzip', ['-o', '-q', zip, `${id}_vpl.txt`, '-d', dir]);
    const tsv = vplToTsv(fs.readFileSync(path.join(dir, `${id}_vpl.txt`), 'utf8'));
    validateTsv(`${locale} (${id})`, tsv);
    fs.writeFileSync(path.join(OUT_DIR, `${locale}.tsv`), tsv);
    console.log(`${locale}: ${id} -> data/bibles/${locale}.tsv (${tsv.split('\n').length - 1} versículos)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
