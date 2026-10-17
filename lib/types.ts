import type { Locale } from '@/i18n/config';

export type SessionStatus = 'lobby' | 'question' | 'reveal' | 'finished';

export type GameSession = {
  id: string;
  quiz_id: string;
  pin: string;
  status: SessionStatus;
  current_position: number | null;
  question_started_at: string | null;
};

export type QuestionOption = {
  id: string;
  position: number;
  text: string;
  is_correct: boolean | null; // null até à revelação
};

export type CurrentQuestion = {
  question_id: string;
  position: number;
  total: number;
  time_limit_s: number;
  started_at: string;
  server_now: string;
  status: SessionStatus;
  bible_ref: string | null;
  text: string;
  options: QuestionOption[];
};

export type Player = {
  id: string;
  user_id: string;
  nickname: string;
  locale: Locale;
  score: number;
};

export type Texts = Partial<Record<Locale, string>>;

export type EditorOption = { is_correct: boolean; texts: Texts };
export type EditorQuestion = {
  time_limit_s: number;
  bible_ref: string;
  texts: Texts;
  options: EditorOption[];
};
export type EditorQuiz = {
  id?: string;
  default_locale: Locale;
  is_public: boolean;
  titles: Texts;
  questions: EditorQuestion[];
};

export type QuizSummary = {
  id: string;
  title: string;
  questionCount: number;
  isPublic: boolean;
  languages: string[];
};
