import books from '../../lib/bible-books.json' with { type: 'json' };
import { getPassage, formatRef } from './bible.mjs';

export const LOCALES = ['pt', 'fr', 'en', 'es'];
const LEVELS = ['easy', 'medium', 'hard'];
const TYPES = ['choice', 'order', 'verse'];
const ID_RE = /^[a-z0-9]+-(easy|medium|hard)-\d{3}$/;
const PT_PT_FORBIDDEN = ['você', 'vocês', 'celular', 'tela', 'Gênesis', 'Antônio', 'ônibus'];
export const BLANK = '_____';

const bookOf = (code) => books.find((b) => b.code === code);
const filled = (s) => typeof s === 'string' && s.trim() !== '';
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w, flags = 'giu') => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(w)}(?![\\p{L}\\p{N}])`, flags);

// Bíblias presentes (pt pode faltar se data/bibles/pt.tsv não existir)
const activeLocales = (bibles) => LOCALES.filter((l) => bibles[l]);

const chapterIndex = new WeakMap();
function hasChapter(bible, book, chapter) {
  let idx = chapterIndex.get(bible);
  if (!idx) {
    idx = new Set();
    for (const k of bible.keys()) idx.add(k.slice(0, k.indexOf(':')));
    chapterIndex.set(bible, idx);
  }
  return idx.has(`${book} ${chapter}`);
}

// Verso(s) a que uma referência se refere, ou null se não existir (capítulo inteiro: basta o capítulo existir)
function passageOrNull(bible, ref) {
  if (ref.verse_start == null) return hasChapter(bible, ref.book, ref.chapter) ? '' : null;
  return getPassage(bible, ref);
}

const normRef = (q) => ({ ...q, verse_end: q.verse_end ?? q.verse_start });

function checkLocalized(obj, label, errors) {
  if (!obj || typeof obj !== 'object') return errors.push(`${label}: em falta`);
  for (const l of LOCALES) if (!filled(obj[l])) errors.push(`${label}.${l}: em falta ou vazio`);
}

function checkRef(ref, label, bibles, errors, { maxVerses = 2 } = {}) {
  if (!bookOf(ref.book)) return errors.push(`${label}: livro desconhecido "${ref.book}"`);
  if (!Number.isInteger(ref.chapter) || ref.chapter < 1) return errors.push(`${label}: capítulo inválido`);
  if (ref.verse_start != null) {
    if (!Number.isInteger(ref.verse_start) || ref.verse_start < 1) return errors.push(`${label}: verse_start inválido`);
    const end = ref.verse_end ?? ref.verse_start;
    if (!Number.isInteger(end) || end < ref.verse_start) return errors.push(`${label}: verse_end inválido`);
    if (end - ref.verse_start + 1 > maxVerses) errors.push(`${label}: no máximo ${maxVerses} versículos (tem ${end - ref.verse_start + 1})`);
  }
  for (const l of activeLocales(bibles)) {
    if (passageOrNull(bibles[l], ref) === null) errors.push(`${label}: ${formatRef('pt', ref)} não existe na Bíblia ${l}`);
  }
}

const isPsalm = (code) => code === 'PSA';
const PSALM_WARNING = 'numeração dos Salmos pode diferir em fr; confirmar o versículo';

export function validateQuestion(q, bibles, ctx = {}) {
  const errors = [];
  const warnings = [];
  const id = q?.id;

  if (typeof id !== 'string' || !ID_RE.test(id)) errors.push(`id inválido: ${JSON.stringify(id)} (esperado ${ID_RE})`);
  else if (ctx.ids) {
    if (ctx.ids.has(id)) errors.push(`id duplicado: ${id}`);
    ctx.ids.add(id);
  }
  if (!TYPES.includes(q.type)) errors.push(`type inválido: ${q.type}`);
  if (!LEVELS.includes(q.level)) errors.push(`level inválido: ${q.level}`);
  if (typeof id === 'string' && ID_RE.test(id) && LEVELS.includes(q.level) && !id.includes(`-${q.level}-`))
    errors.push(`id ${id} não corresponde ao nível ${q.level}`);

  const ptNote = (label, s) => {
    if (typeof s !== 'string') return;
    for (const w of PT_PT_FORBIDDEN) if (wordRe(w).test(s)) warnings.push(`${label}: "${w}" não é português de Portugal`);
  };

  if (q.type === 'order') {
    // A referência do topo é opcional em 'order': por omissão, a do primeiro episódio
    if (q.book != null) checkRef(normRef(q), 'referência', bibles, errors);
    checkLocalized(q.prompt, 'prompt', errors);
    ptNote('prompt.pt', q.prompt?.pt);
    if (!Array.isArray(q.items) || q.items.length !== 4) errors.push(`order precisa de exatamente 4 items (tem ${q.items?.length ?? 0})`);
    else q.items.forEach((it, i) => {
      checkRef(normRef(it), `items[${i}]`, bibles, errors);
      checkLocalized(it.text, `items[${i}].text`, errors);
      ptNote(`items[${i}].text.pt`, it.text?.pt);
    });
    const psa = isPsalm(q.book) || (q.items ?? []).some((it) => isPsalm(it.book));
    if (psa) warnings.push(PSALM_WARNING);
    return { errors, warnings };
  }

  // choice e verse citam uma passagem
  const ref = normRef(q);
  checkRef(ref, 'referência', bibles, errors);
  if (isPsalm(q.book)) warnings.push(PSALM_WARNING);
  const texts = {};
  for (const l of activeLocales(bibles)) {
    const t = bookOf(q.book) && Number.isInteger(q.verse_start) ? getPassage(bibles[l], ref) : null;
    if (t == null) continue;
    texts[l] = t;
    if (t.length > 360) errors.push(`versículo em ${l} tem ${t.length} caracteres (máximo 360)`);
    else if (t.length > 300) warnings.push(`versículo em ${l} tem ${t.length} caracteres (acima de 300)`);
  }

  if (q.type === 'choice') {
    checkLocalized(q.prompt, 'prompt', errors);
    ptNote('prompt.pt', q.prompt?.pt);
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4)
      errors.push(`choice precisa de 2 a 4 options (tem ${q.options?.length ?? 0})`);
    else {
      const n = q.options.filter((o) => o.correct === true).length;
      if (n !== 1) errors.push(`choice precisa de exatamente 1 option correct (tem ${n})`);
      q.options.forEach((o, i) => {
        checkLocalized(o.text, `options[${i}].text`, errors);
        ptNote(`options[${i}].text.pt`, o.text?.pt);
      });
    }
  }

  if (q.type === 'verse') {
    checkLocalized(q.blank, 'blank', errors);
    if (!Array.isArray(q.distractors) || q.distractors.length !== 3) errors.push(`verse precisa de 3 distractors (tem ${q.distractors?.length ?? 0})`);
    else q.distractors.forEach((d, i) => {
      checkLocalized(d, `distractors[${i}]`, errors);
      for (const l of LOCALES) {
        if (filled(d?.[l]) && filled(q.blank?.[l]) && d[l].trim().toLowerCase() === q.blank[l].trim().toLowerCase())
          errors.push(`distrator ${i} igual ao blank em ${l}`);
      }
    });
    if (q.distractors?.length === 3) for (const l of LOCALES) {
      const set = new Set(q.distractors.map((d) => d?.[l]?.trim().toLowerCase()));
      if (set.size !== 3) errors.push(`distrator repetido em ${l}`);
    }
    for (const l of Object.keys(texts)) {
      if (!filled(q.blank?.[l])) continue;
      const hits = texts[l].match(wordRe(q.blank[l].trim())) ?? [];
      if (hits.length === 0) errors.push(`blank "${q.blank[l]}" não existe como palavra inteira no versículo em ${l}`);
      else if (hits.length > 1) warnings.push(`blank "${q.blank[l]}" aparece mais de uma vez no versículo em ${l}; só a primeira fica em branco`);
    }
    if (q.level === 'easy') {
      if (ref.verse_end !== ref.verse_start) errors.push('verse easy só pode ter um versículo');
      if (texts.pt && texts.pt.length > 200) errors.push(`verse easy: versículo pt tem ${texts.pt.length} caracteres (máximo 200)`);
    }
    if (!texts.pt && !bibles.pt) errors.push('verse precisa da Bíblia pt');
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------

function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, seed) {
  const rnd = mulberry32(hashSeed(seed));
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Formato esperado por public.upsert_bank_question(p jsonb)
export function buildQuestion(q, bibles) {
  const locales = activeLocales(bibles);
  const topRef = q.type === 'order' && q.book == null
    ? { book: q.items[0].book, chapter: q.items[0].chapter, verse_start: q.items[0].verse_start ?? 1, verse_end: q.items[0].verse_end ?? q.items[0].verse_start ?? 1 }
    : normRef(q);
  const base = {
    id: q.id, type: q.type, level: q.level, testament: bookOf(q.book ?? topRef.book).testament,
    book: topRef.book, chapter: topRef.chapter, verse_start: topRef.verse_start ?? 1, verse_end: topRef.verse_end ?? topRef.verse_start ?? 1,
  };
  const refText = (l) => formatRef(l, q.type === 'order' && q.book == null
    ? { ...topRef, verse_start: q.items[0].verse_start, verse_end: q.items[0].verse_end } : topRef);

  const texts = {};
  for (const l of LOCALES) {
    const passage = q.type === 'order' || !bibles[l] ? null : getPassage(bibles[l], topRef);
    texts[l] = { prompt: q.prompt?.[l] ?? '', bible_ref: refText(l), verse_text: passage };
  }

  if (q.type === 'choice') {
    const options = q.options.map((o, i) => ({
      position: i + 1, is_correct: o.correct === true,
      texts: Object.fromEntries(LOCALES.map((l) => [l, { text: o.text[l] }])),
    }));
    return { ...base, texts, options };
  }

  if (q.type === 'order') {
    const options = q.items.map((it, i) => ({
      position: i + 1, is_correct: false,
      texts: Object.fromEntries(LOCALES.map((l) => [l, { text: it.text[l], ref: formatRef(l, it) }])),
    }));
    return { ...base, texts, options };
  }

  // verse: o enunciado é o versículo com a 1.ª ocorrência de blank trocada por _____
  for (const l of LOCALES) {
    const full = texts[l].verse_text;
    texts[l].prompt = full == null ? '' : full.replace(wordRe(q.blank[l].trim(), 'iu'), BLANK);
  }
  const raw = [{ correct: true, text: q.blank }, ...q.distractors.map((d) => ({ correct: false, text: d }))];
  const options = seededShuffle(raw, q.id).map((o, i) => ({
    position: i + 1, is_correct: o.correct,
    texts: Object.fromEntries(LOCALES.map((l) => [l, { text: o.text[l] }])),
  }));
  return { ...base, texts, options };
}
