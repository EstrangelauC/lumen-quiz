// Uso: node scripts/build-bank.mjs [pastaDePerguntas] [--bibles <dir>] [--out <dir>]
//   por omissão: content/questions -> content/bank.generated.json e supabase/seed/bank-<nome>.sql
//   com --out, tudo (json e sql) vai para essa pasta (útil para fixtures e testes)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBible, DEFAULT_BIBLE_DIR } from './lib/bible.mjs';
import { validateQuestion, buildQuestion, LOCALES } from './lib/validate-bank.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadBibles(biblesDir = DEFAULT_BIBLE_DIR) {
  const bibles = {};
  for (const l of LOCALES) {
    if (l === 'pt' && !fs.existsSync(path.join(biblesDir, 'pt.tsv'))) {
      // Sem Bíblia pt: o versículo pt fica sem texto (só a referência)
      console.warn('aviso: sem pt.tsv; pt mostra só a referência');
      continue;
    }
    bibles[l] = loadBible(l, biblesDir);
  }
  return bibles;
}

export function buildBank({ dir = path.join(ROOT, 'content', 'questions'), biblesDir = DEFAULT_BIBLE_DIR, outDir } = {}) {
  const bibles = loadBibles(biblesDir);
  const jsonOut = outDir ? path.join(outDir, 'bank.generated.json') : path.join(ROOT, 'content', 'bank.generated.json');
  const sqlDir = outDir ?? path.join(ROOT, 'supabase', 'seed');
  const errors = [];
  const warnings = [];
  const counts = {};
  const all = [];
  const perFile = [];
  const ctx = { ids: new Set() };

  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
  for (const f of files) {
    const list = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!Array.isArray(list)) { errors.push(`${f}: tem de ser um array`); continue; }
    const built = [];
    for (const q of list) {
      const r = validateQuestion(q, bibles, ctx);
      errors.push(...r.errors.map((e) => `${f} ${q?.id}: ${e}`));
      warnings.push(...r.warnings.map((w) => `${f} ${q?.id}: ${w}`));
      if (r.errors.length) continue;
      const b = buildQuestion(q, bibles);
      built.push(b);
      counts[q.level] ??= {};
      counts[q.level][q.type] = (counts[q.level][q.type] ?? 0) + 1;
    }
    all.push(...built);
    perFile.push([path.basename(f, '.json'), built]);
  }

  if (!errors.length) {
    fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
    fs.mkdirSync(sqlDir, { recursive: true });
    fs.writeFileSync(jsonOut, JSON.stringify(all, null, 2) + '\n');
    for (const [name, built] of perFile) {
      const sql = built.map((b) => `select public.upsert_bank_question($json$${JSON.stringify(b)}$json$::jsonb);`).join('\n') + '\n';
      fs.writeFileSync(path.join(sqlDir, `bank-${name}.sql`), sql);
    }
  }
  return { errors, warnings, counts, total: all.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const biblesDir = opt('--bibles');
  const outDir = opt('--out');
  const dir = args[0];
  const r = buildBank({ dir: dir ? path.resolve(dir) : undefined, biblesDir: biblesDir && path.resolve(biblesDir), outDir: outDir && path.resolve(outDir) });
  for (const w of r.warnings) console.warn(`aviso: ${w}`);
  for (const e of r.errors) console.error(`erro: ${e}`);
  for (const [level, byType] of Object.entries(r.counts)) {
    console.log(`${level}: ${Object.entries(byType).map(([t, n]) => `${t} ${n}`).join(', ')}`);
  }
  console.log(`${r.total} perguntas`);
  if (r.errors.length) process.exit(1);
}
