import type { Locale } from '@/i18n/config';

export type SessionStatus = 'lobby' | 'question' | 'reveal' | 'finished';

export type GameSession = {
  id: string;
  level: 'easy' | 'medium' | 'hard';
  question_count: number;
  pin: string;
  status: SessionStatus;
  current_position: number | null;
  question_started_at: string | null;
};

export type QuestionOption = {
  id: string;
  position: number;
  text: string;
  ref: string | null; // só nos itens de 'order', na revelação
  is_correct: boolean | null; // null até à revelação
};

export type CurrentQuestion = {
  question_id: string;
  type: 'choice' | 'order' | 'verse';
  position: number;
  total: number;
  time_limit_s: number;
  started_at: string;
  server_now: string;
  status: SessionStatus;
  bible_ref: string | null;
  text: string;
  options: QuestionOption[];
  correct_order: string[] | null; // só na revelação
  verse_text: string | null; // só na revelação
  reported: boolean;
  my_answered: boolean;
};

export type Player = {
  id: string;
  user_id: string;
  nickname: string;
  locale: Locale;
  score: number;
  streak?: number; // respostas certas seguidas (bónus de sequência)
};
