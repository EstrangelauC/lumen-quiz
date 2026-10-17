import type { QuizSummary } from './types';

type QuizRow = {
  id: string;
  default_locale: string;
  is_public: boolean;
  quiz_translations: { locale: string; title: string }[];
  questions: { count: number }[];
};

export const QUIZ_SUMMARY_SELECT =
  'id, default_locale, is_public, updated_at, quiz_translations(locale, title), questions(count)';

/** Escolhe o título na língua do utilizador, senão na língua principal do quiz. */
export function toSummary(row: QuizRow, locale: string): QuizSummary {
  const tr = row.quiz_translations ?? [];
  const title =
    tr.find((t) => t.locale === locale)?.title ??
    tr.find((t) => t.locale === row.default_locale)?.title ??
    tr[0]?.title ??
    '—';
  return {
    id: row.id,
    title,
    questionCount: row.questions?.[0]?.count ?? 0,
    isPublic: row.is_public,
    languages: tr.map((t) => t.locale),
  };
}

// Cores e formas das 4 opções (como no Kahoot, para quem não lê bem também se orientar)
export const ANSWER_STYLES = [
  { bg: 'bg-rose-500', ring: 'ring-rose-300', shape: '▲' },
  { bg: 'bg-sky-500', ring: 'ring-sky-300', shape: '◆' },
  { bg: 'bg-amber-400', ring: 'ring-amber-200', shape: '●' },
  { bg: 'bg-emerald-500', ring: 'ring-emerald-300', shape: '■' },
] as const;
