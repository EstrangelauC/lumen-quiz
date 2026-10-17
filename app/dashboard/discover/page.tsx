import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import QuizCard from '@/components/dashboard/QuizCard';
import { getRegisteredUser } from '@/lib/supabase/server';
import { QUIZ_SUMMARY_SELECT, toSummary } from '@/lib/quiz';
import { isLocale, localeNames, locales } from '@/i18n/config';

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const t = await getTranslations('discover');
  const locale = await getLocale();
  const { lang } = await searchParams;
  const filter = isLocale(lang) ? lang : null;
  const { supabase } = await getRegisteredUser();

  const { data: rows } = await supabase
    .from('quizzes')
    .select(QUIZ_SUMMARY_SELECT)
    .eq('is_public', true)
    .order('updated_at', { ascending: false })
    .limit(60);

  // Com filtro, o título aparece na língua escolhida
  const quizzes = (rows ?? [])
    .map((row) => ({ summary: toSummary(row, filter ?? locale) }))
    .filter(({ summary }) => !filter || summary.languages.includes(filter));

  const chip = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold transition ${active ? 'bg-ink text-white' : 'bg-white text-ink/70 border border-ink/15 hover:text-ink'}`;

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">{t('title')}</h1>
      <p className="mt-1 text-ink/60">{t('subtitle')}</p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/dashboard/discover" className={chip(!filter)}>
          {t('all')}
        </Link>
        {locales.map((l) => (
          <Link key={l} href={`/dashboard/discover?lang=${l}`} className={chip(filter === l)}>
            {localeNames[l]}
          </Link>
        ))}
      </div>

      {quizzes.length === 0 ? (
        <div className="card mt-8 p-10 text-center text-ink/60">{t('empty')}</div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {quizzes.map(({ summary }) => (
            <QuizCard key={summary.id} quiz={summary} mine={false} />
          ))}
        </div>
      )}
    </div>
  );
}
