import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import QuizCard from '@/components/dashboard/QuizCard';
import { getRegisteredUser } from '@/lib/supabase/server';
import { QUIZ_SUMMARY_SELECT, toSummary } from '@/lib/quiz';

export default async function MyQuizzesPage() {
  const t = await getTranslations('dashboard');
  const locale = await getLocale();
  const { supabase, user } = await getRegisteredUser();

  const [{ data: rows }, { data: profile }] = await Promise.all([
    supabase.from('quizzes').select(QUIZ_SUMMARY_SELECT).eq('owner_id', user!.id).order('updated_at', { ascending: false }),
    supabase.from('profiles').select('display_name').eq('id', user!.id).maybeSingle(),
  ]);

  const quizzes = (rows ?? []).map((row) => toSummary(row, locale));
  const name = profile?.display_name || user!.email?.split('@')[0] || '';

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink/60">{t('hello', { name })}</p>
          <h1 className="font-display text-3xl font-semibold">{t('title')}</h1>
        </div>
        <Link href="/dashboard/quizzes/new" className="btn-primary">
          + {t('newQuiz')}
        </Link>
      </div>

      {quizzes.length === 0 ? (
        <div className="card mt-8 p-10 text-center text-ink/60">{t('empty')}</div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((q) => (
            <QuizCard key={q.id} quiz={q} mine />
          ))}
        </div>
      )}
    </div>
  );
}
