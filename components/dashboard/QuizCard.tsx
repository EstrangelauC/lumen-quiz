'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { QuizSummary } from '@/lib/types';

export default function QuizCard({ quiz, mine }: { quiz: QuizSummary; mine: boolean }) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const router = useRouter();
  const [busy, setBusy] = useState<'play' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function play() {
    setBusy('play');
    setError(null);
    const { data, error } = await createClient().rpc('create_session', { p_quiz_id: quiz.id });
    if (error || !data) {
      setBusy(null);
      return setError(tc('error'));
    }
    router.push(`/host/${(data as { session_id: string }).session_id}`);
  }

  async function remove() {
    if (!confirm(t('confirmDelete'))) return;
    setBusy('delete');
    const { error } = await createClient().from('quizzes').delete().eq('id', quiz.id);
    setBusy(null);
    if (error) return setError(tc('error'));
    router.refresh();
  }

  return (
    <article className="card flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-semibold leading-snug">{quiz.title}</h3>
        {mine && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              quiz.isPublic ? 'bg-emerald-100 text-emerald-800' : 'bg-ink/5 text-ink/60'
            }`}
          >
            {quiz.isPublic ? t('public') : t('private')}
          </span>
        )}
      </div>

      <p className="mt-1 text-sm text-ink/60">{t('questions', { count: quiz.questionCount })}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {quiz.languages.map((l) => (
          <span key={l} className="rounded-md bg-gold-soft px-2 py-0.5 text-xs font-bold uppercase text-ink/80">
            {l}
          </span>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <div className="mt-5 flex flex-wrap gap-2 pt-1">
        <button onClick={play} disabled={busy !== null || quiz.questionCount === 0} className="btn-gold flex-1">
          {busy === 'play' ? t('starting') : `▶ ${t('play')}`}
        </button>
        {mine && (
          <>
            <Link href={`/dashboard/quizzes/${quiz.id}/edit`} className="btn-ghost">
              {t('edit')}
            </Link>
            <button onClick={remove} disabled={busy !== null} className="btn-ghost text-rose-600" aria-label={t('delete')}>
              🗑
            </button>
          </>
        )}
      </div>
    </article>
  );
}
