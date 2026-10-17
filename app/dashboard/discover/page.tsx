import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { VerseGapText } from '@/components/game/VerseReveal';
import { BOOKS, bookName } from '@/lib/bible-books';
import { getRegisteredUser } from '@/lib/supabase/server';
import type { Locale } from '@/i18n/config';

const PAGE_SIZE = 30;
const LEVELS = ['easy', 'medium', 'hard'] as const;
type Level = (typeof LEVELS)[number];
const BOOK_INDEX = new Map<string, number>(BOOKS.map((b, i) => [b.code, i]));

type Row = { id: string; book: string; chapter: number | null; verse_start: number | null };
type Detail = { id: string; type: 'choice' | 'order' | 'verse'; level: Level };
type TextRow = { question_id: string; locale: string; prompt: string; bible_ref: string | null };
type OptRow = {
  id: string;
  question_id: string;
  position: number;
  is_correct: boolean;
  bank_option_texts: { locale: string; text: string; ref: string | null }[];
};

/** Texto na língua do utilizador, com pt como alternativa. */
function pick<T extends { locale: string }>(items: T[] | undefined, locale: string): T | undefined {
  return items?.find((i) => i.locale === locale) ?? items?.find((i) => i.locale === 'pt');
}

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ level?: string; book?: string; page?: string }> }) {
  const t = await getTranslations('discover');
  const locale = (await getLocale()) as Locale;
  const sp = await searchParams;
  const level = LEVELS.find((l) => l === sp.level) ?? null;
  const book = sp.book && BOOK_INDEX.has(sp.book) ? sp.book : null;
  const { supabase } = await getRegisteredUser();

  // O banco tem ~300 perguntas: a ordem canónica não é uma coluna, por isso ordena-se em JS.
  const base = () => {
    let q = supabase.from('bank_questions').select('id, book, chapter, verse_start').eq('active', true).limit(5000);
    if (level) q = q.eq('level', level);
    return q;
  };
  const { data: levelRows } = await base();
  const allRows = (levelRows ?? []) as Row[];
  const bookCodes = new Set(allRows.map((r) => r.book));
  const books = BOOKS.filter((b) => bookCodes.has(b.code));

  const rows = allRows
    .filter((r) => !book || r.book === book)
    .sort(
      (a, b) =>
        (BOOK_INDEX.get(a.book) ?? 0) - (BOOK_INDEX.get(b.book) ?? 0) ||
        (a.chapter ?? 0) - (b.chapter ?? 0) ||
        (a.verse_start ?? 0) - (b.verse_start ?? 0),
    );
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(Math.max(parseInt(sp.page ?? '1', 10) || 1, 1), totalPages);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const ids = pageRows.map((r) => r.id);

  const [detailRes, textRes, optRes] = ids.length
    ? await Promise.all([
        supabase.from('bank_questions').select('id, type, level').in('id', ids),
        supabase.from('bank_question_texts').select('question_id, locale, prompt, bible_ref').in('question_id', ids).in('locale', [locale, 'pt']),
        supabase
          .from('bank_options')
          .select('id, question_id, position, is_correct, bank_option_texts(locale, text, ref)')
          .in('question_id', ids)
          .order('position'),
      ])
    : [null, null, null];

  const details = new Map(((detailRes?.data ?? []) as Detail[]).map((d) => [d.id, d]));
  const texts = new Map<string, TextRow[]>();
  for (const r of (textRes?.data ?? []) as TextRow[]) texts.set(r.question_id, [...(texts.get(r.question_id) ?? []), r]);
  const options = new Map<string, OptRow[]>();
  for (const o of (optRes?.data ?? []) as unknown as OptRow[]) options.set(o.question_id, [...(options.get(o.question_id) ?? []), o]);

  const href = (p: { level?: string | null; book?: string | null; page?: number }) => {
    const qs = new URLSearchParams();
    if (p.level) qs.set('level', p.level);
    if (p.book) qs.set('book', p.book);
    if (p.page && p.page > 1) qs.set('page', String(p.page));
    const s = qs.toString();
    return `/dashboard/discover${s ? `?${s}` : ''}`;
  };
  const chip = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold transition ${active ? 'bg-ink text-white' : 'bg-white text-ink/70 border border-ink/15 hover:text-ink'}`;
  const badge = 'rounded-full bg-ink/10 px-2.5 py-0.5 text-xs font-semibold text-ink/70';

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">{t('title')}</h1>
      <p className="mt-1 text-ink/60">{t('subtitle')}</p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href={href({ book })} className={chip(!level)}>
          {t('allLevels')}
        </Link>
        {LEVELS.map((l) => (
          <Link key={l} href={href({ level: l, book })} className={chip(level === l)}>
            {t(l)}
          </Link>
        ))}
      </div>

      <form action="/dashboard/discover" className="mt-4 flex flex-wrap items-center gap-2">
        {level && <input type="hidden" name="level" value={level} />}
        <label htmlFor="book" className="text-sm font-semibold text-ink/70">
          {t('book')}
        </label>
        <select id="book" name="book" defaultValue={book ?? ''} className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm">
          <option value="">{t('allBooks')}</option>
          {books.map((b) => (
            <option key={b.code} value={b.code}>
              {bookName(b.code, locale)}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">
          OK
        </button>
        <span className="ml-auto text-sm text-ink/50">{t('count', { count: rows.length })}</span>
      </form>

      {pageRows.length === 0 ? (
        <div className="card mt-8 p-10 text-center text-ink/60">{t('empty')}</div>
      ) : (
        <ul className="mt-6 grid gap-4">
          {pageRows.map((row) => {
            const d = details.get(row.id);
            const tx = pick(texts.get(row.id), locale);
            const opts = options.get(row.id) ?? [];
            const optText = (o: OptRow) => pick(o.bank_option_texts, locale);
            const correct = opts.find((o) => o.is_correct);
            return (
              <li key={row.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  {d && <span className={badge}>{t(d.type)}</span>}
                  {d && <span className={badge}>{t(d.level)}</span>}
                  {tx?.bible_ref && <span className="text-sm font-semibold text-gold">📖 {tx.bible_ref}</span>}
                </div>
                <p className="mt-3 font-display text-lg leading-snug">
                  {d?.type === 'verse' && tx ? <VerseGapText text={tx.prompt} /> : tx?.prompt}
                </p>
                <div className="mt-3 rounded-xl bg-ink/5 px-4 py-3 text-sm">
                  {d?.type === 'order' ? (
                    <>
                      <p className="font-semibold text-ink/60">{t('correctOrder')}</p>
                      <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                        {opts.map((o) => {
                          const ot = optText(o);
                          return (
                            <li key={o.id}>
                              {ot?.text}
                              {ot?.ref && <span className="text-ink/50"> ({ot.ref})</span>}
                            </li>
                          );
                        })}
                      </ol>
                    </>
                  ) : (
                    <p>
                      <span className="font-semibold text-ink/60">{d?.type === 'verse' ? t('missingWord') : t('answer')}: </span>
                      <span className="font-semibold">{correct ? optText(correct)?.text : ''}</span>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-between text-sm font-semibold">
          {page > 1 ? (
            <Link href={href({ level, book, page: page - 1 })} className={chip(false)}>
              ← {t('prev')}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink/50">{t('pageOf', { page, total: totalPages })}</span>
          {page < totalPages ? (
            <Link href={href({ level, book, page: page + 1 })} className={chip(false)}>
              {t('next')} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
