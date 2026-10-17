'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ANSWER_STYLES } from '@/lib/quiz';
import { localeNames, locales, type Locale } from '@/i18n/config';
import type { EditorQuestion, EditorQuiz, Texts } from '@/lib/types';
import { TIME_CHOICES } from './SettingsForm';

const ERROR_KEYS = [
  'missing_title',
  'no_questions',
  'missing_question_text',
  'missing_option_text',
  'invalid_option_count',
  'need_one_correct',
] as const;

const newQuestion = (time: number): EditorQuestion => ({
  time_limit_s: time,
  bible_ref: '',
  texts: {},
  options: [0, 1, 2, 3].map((i) => ({ is_correct: i === 0, texts: {} })),
});

/** Remove espaços e textos vazios, para que o servidor use a língua principal como recurso. */
function clean(texts: Texts): Texts {
  const out: Texts = {};
  for (const l of locales) {
    const v = texts[l]?.trim();
    if (v) out[l] = v;
  }
  return out;
}

type Props = { initial?: EditorQuiz; defaultLocale: Locale; defaultTime: number };

export default function QuizEditor({ initial, defaultLocale, defaultTime }: Props) {
  const t = useTranslations('editor');
  const tc = useTranslations('common');
  const router = useRouter();

  const [quiz, setQuiz] = useState<EditorQuiz>(
    initial ?? { default_locale: defaultLocale, is_public: false, titles: {}, questions: [newQuestion(defaultTime)] },
  );
  const [lang, setLang] = useState<Locale>(quiz.default_locale);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const main = quiz.default_locale;
  const isMain = lang === main;

  // Atualização imutável e simples: copia o quiz, altera, guarda
  const update = (fn: (draft: EditorQuiz) => void) =>
    setQuiz((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      return draft;
    });

  // Uma língua está completa quando tem título, todas as perguntas e todas as opções
  const isComplete = (l: Locale) =>
    !!quiz.titles[l]?.trim() &&
    quiz.questions.every((q) => q.texts[l]?.trim() && q.options.every((o) => o.texts[l]?.trim()));

  const placeholder = (texts: Texts, fallback: string) => (!isMain && texts[main]?.trim() ? texts[main] : fallback);

  async function save() {
    setSaving(true);
    setError(null);
    const payload = {
      ...quiz,
      titles: clean(quiz.titles),
      questions: quiz.questions.map((q) => ({
        ...q,
        bible_ref: q.bible_ref.trim(),
        texts: clean(q.texts),
        options: q.options.map((o) => ({ ...o, texts: clean(o.texts) })),
      })),
    };
    const { error } = await createClient().rpc('save_quiz', { p: payload });
    setSaving(false);
    if (error) {
      const key = ERROR_KEYS.find((k) => error.message.includes(k));
      setError(key ? t(`errors.${key}`) : tc('error'));
      if (key) setLang(main);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="pb-28">
      <Link href="/dashboard" className="text-sm font-semibold text-ink/60 hover:text-ink">
        ← {tc('back')}
      </Link>
      <h1 className="font-display mt-2 text-3xl font-semibold">{initial ? t('editTitle') : t('newTitle')}</h1>

      {/* Definições gerais do quiz */}
      <section className="card mt-6 grid gap-5 p-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="main_lang">
            {t('mainLanguage')}
          </label>
          <select
            id="main_lang"
            className="field"
            value={main}
            onChange={(e) => update((d) => void (d.default_locale = e.target.value as Locale))}
          >
            {locales.map((l) => (
              <option key={l} value={l}>
                {localeNames[l]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-3 self-end rounded-xl border border-ink/10 bg-parchment px-4 py-3">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[#1b1640]"
            checked={quiz.is_public}
            onChange={(e) => update((d) => void (d.is_public = e.target.checked))}
          />
          <span className="text-sm font-medium">{t('isPublic')}</span>
        </label>
      </section>

      {/* Separadores de língua */}
      <section className="sticky top-[116px] z-10 -mx-4 mt-6 bg-parchment/95 px-4 py-3 backdrop-blur sm:top-[64px]">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/50">{t('editingLanguage')}</p>
        <div className="flex flex-wrap gap-2">
          {locales.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                lang === l ? 'bg-ink text-white' : 'border border-ink/15 bg-white text-ink/70 hover:text-ink'
              }`}
            >
              {localeNames[l]}
              {l === main ? (
                <span className={`rounded px-1.5 text-[10px] uppercase ${lang === l ? 'bg-gold text-ink' : 'bg-gold-soft'}`}>
                  {t('mainBadge')}
                </span>
              ) : (
                <span aria-hidden className={isComplete(l) ? 'text-emerald-500' : 'opacity-40'}>
                  {isComplete(l) ? '✓' : '○'}
                </span>
              )}
            </button>
          ))}
        </div>
        {!isMain && <p className="mt-2 text-xs text-ink/60">{t('editingHint')}</p>}
      </section>

      {/* Título */}
      <section className="card mt-4 p-5">
        <label className="label" htmlFor="title">
          {t('title')} · {localeNames[lang]}
        </label>
        <input
          id="title"
          className="field font-display text-lg"
          value={quiz.titles[lang] ?? ''}
          placeholder={placeholder(quiz.titles, '')}
          onChange={(e) => update((d) => void (d.titles[lang] = e.target.value))}
        />
      </section>

      {/* Perguntas */}
      <div className="mt-4 space-y-4">
        {quiz.questions.map((q, qi) => (
          <section key={qi} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">{t('question', { n: qi + 1 })}</h2>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`time-${qi}`}>
                  {t('timeLimit')}
                </label>
                <select
                  id={`time-${qi}`}
                  className="rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm"
                  value={q.time_limit_s}
                  onChange={(e) => update((d) => void (d.questions[qi].time_limit_s = Number(e.target.value)))}
                >
                  {TIME_CHOICES.map((s) => (
                    <option key={s} value={s}>
                      ⏱ {s}s
                    </option>
                  ))}
                </select>
                {quiz.questions.length > 1 && (
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1.5 text-sm text-rose-600 hover:bg-rose-50"
                    onClick={() => update((d) => void d.questions.splice(qi, 1))}
                  >
                    {t('remove')}
                  </button>
                )}
              </div>
            </div>

            <textarea
              className="field mt-3 min-h-20 resize-y"
              aria-label={t('questionText')}
              value={q.texts[lang] ?? ''}
              placeholder={placeholder(q.texts, t('questionText'))}
              onChange={(e) => update((d) => void (d.questions[qi].texts[lang] = e.target.value))}
            />

            <input
              className="field mt-3 !py-2 text-sm"
              aria-label={t('bibleRef')}
              value={q.bible_ref}
              placeholder={`📖 ${t('bibleRef')} — ${t('bibleRefPlaceholder')}`}
              onChange={(e) => update((d) => void (d.questions[qi].bible_ref = e.target.value))}
            />

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {q.options.map((o, oi) => (
                <div
                  key={oi}
                  className={`flex items-center gap-2 rounded-xl border-2 p-1.5 pr-2 transition ${
                    o.is_correct ? 'border-emerald-500 bg-emerald-50' : 'border-transparent bg-parchment'
                  }`}
                >
                  <span className={`${ANSWER_STYLES[oi].bg} flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white`}>
                    {ANSWER_STYLES[oi].shape}
                  </span>
                  <input
                    className="min-w-0 flex-1 bg-transparent px-1 py-2 outline-none placeholder:text-ink/35"
                    aria-label={t('option', { n: oi + 1 })}
                    value={o.texts[lang] ?? ''}
                    placeholder={placeholder(o.texts, t('option', { n: oi + 1 }))}
                    onChange={(e) => update((d) => void (d.questions[qi].options[oi].texts[lang] = e.target.value))}
                  />
                  <button
                    type="button"
                    title={t('correct')}
                    onClick={() =>
                      update((d) => d.questions[qi].options.forEach((opt, k) => (opt.is_correct = k === oi)))
                    }
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
                      o.is_correct ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink/20 text-transparent hover:border-emerald-400'
                    }`}
                  >
                    ✓
                  </button>
                  {q.options.length > 2 && (
                    <button
                      type="button"
                      aria-label={t('remove')}
                      className="px-1 text-ink/40 hover:text-rose-600"
                      onClick={() =>
                        update((d) => {
                          const opts = d.questions[qi].options;
                          const wasCorrect = opts[oi].is_correct;
                          opts.splice(oi, 1);
                          if (wasCorrect) opts[0].is_correct = true;
                        })
                      }
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {q.options.length < 4 && (
              <button
                type="button"
                className="mt-3 text-sm font-semibold text-ink/60 hover:text-ink"
                onClick={() => update((d) => void d.questions[qi].options.push({ is_correct: false, texts: {} }))}
              >
                + {t('addOption')}
              </button>
            )}
          </section>
        ))}
      </div>

      <button
        type="button"
        className="btn-ghost mt-4 w-full border-dashed py-4"
        onClick={() => update((d) => void d.questions.push(newQuestion(defaultTime)))}
      >
        + {t('addQuestion')}
      </button>

      {/* Barra de gravação fixa */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-4 px-4 py-3">
          {error && <p className="flex-1 text-sm font-medium text-rose-600">{error}</p>}
          <button type="button" onClick={save} disabled={saving} className="btn-primary px-8">
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
