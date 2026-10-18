'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ANSWER_STYLES } from '@/lib/quiz';
import type { CurrentQuestion, GameSession, Player } from '@/lib/types';
import { useCountdown } from '@/hooks/useCountdown';
import TimerBadge from './TimerBadge';
import OrderInput from './OrderInput';
import VerseReveal, { VerseGapText } from './VerseReveal';
import LanguageSwitcher from '../LanguageSwitcher';

// Antes da revelação só se sabe que respondi (is_correct e pontos ficam a null)
type Ranking = { rank: number; total: number; score: number; ahead: { name: string; gap: number } | null };
type MyAnswer = { option_id: string | null; order_ids: string[] | null; is_correct: boolean | null; points_awarded: number | null };
const ANSWERED: MyAnswer = { option_id: null, order_ids: null, is_correct: null, points_awarded: null };

export default function PlayerGame({ sessionId }: { sessionId: string }) {
  const t = useTranslations('play');
  // A língua da interface manda também nas perguntas: o seletor no topo muda as duas a meio do jogo
  const locale = useLocale();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [me, setMe] = useState<Player | null>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [question, setQuestion] = useState<CurrentQuestion | null>(null);
  const [offset, setOffset] = useState(0);
  const [myAnswer, setMyAnswer] = useState<MyAnswer | null>(null);
  const [sending, setSending] = useState(false);
  const [ranking, setRanking] = useState<Ranking | null>(null);

  // Quem sou eu neste jogo?
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return router.replace('/join');
      const { data: player } = await supabase
        .from('players')
        .select('id, user_id, nickname, locale, score')
        .eq('session_id', sessionId)
        .eq('user_id', auth.user.id)
        .maybeSingle();
      if (!player) return router.replace('/join');
      setMe(player as Player);
      const { data: s } = await supabase
        .from('game_sessions')
        .select('id, pin, status, level, question_count, current_position, question_started_at')
        .eq('id', sessionId)
        .single();
      if (s) setSession(s as GameSession);
    })();

    const channel = supabase
      .channel(`play-${sessionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` }, (payload) =>
        setSession(payload.new as GameSession),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionId, router]);

  const loadRanking = useCallback(async () => {
    if (!me) return;
    const { data } = await supabase
      .from('players')
      .select('id, nickname, score')
      .eq('session_id', sessionId)
      .order('score', { ascending: false })
      .order('joined_at', { ascending: true });
    const list = (data ?? []) as { id: string; nickname: string; score: number }[];
    const idx = list.findIndex((p) => p.id === me.id);
    const score = list[idx]?.score ?? 0;
    const above = idx > 0 ? list[idx - 1] : null;
    setRanking({ rank: idx + 1, total: list.length, score, ahead: above ? { name: above.nickname, gap: above.score - score } : null });
  }, [supabase, sessionId, me]);

  // Cada mudança de estado: pergunta na MINHA língua + a minha resposta
  const status = session?.status;
  const position = session?.current_position;
  useEffect(() => {
    if (!me) return;
    if (status === 'finished') {
      loadRanking();
      return;
    }
    if (status !== 'question' && status !== 'reveal') {
      setQuestion(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('get_current_question', { p_session_id: sessionId, p_locale: locale });
      if (cancelled || !data) return;
      const q = data as CurrentQuestion;
      // Durante a pergunta a minha linha em answers está escondida (RLS): uso my_answered.
      // Depois da revelação leio-a (certo/errado e pontos).
      let mine: MyAnswer | null = q.my_answered ? ANSWERED : null;
      if (q.status === 'reveal') {
        const { data: ans } = await supabase
          .from('answers')
          .select('option_id, order_ids, is_correct, points_awarded')
          .eq('player_id', me.id)
          .eq('question_id', q.question_id)
          .maybeSingle();
        mine = (ans as MyAnswer | null) ?? null;
      }
      if (cancelled) return;
      // Pergunta e resposta mudam juntas (evita mostrar a resposta da pergunta anterior)
      setQuestion(q);
      setMyAnswer(mine);
      setOffset(Date.parse(q.server_now) - Date.now());
      if (q.status === 'reveal') loadRanking();
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, sessionId, me, status, position, locale, loadRanking]);

  const remaining = useCountdown(question?.started_at, question?.time_limit_s ?? 0, offset, status === 'question');

  async function answer(optionId: string) {
    if (myAnswer || sending || remaining === 0) return;
    setSending(true);
    setMyAnswer({ ...ANSWERED, option_id: optionId });
    const { error } = await supabase.rpc('submit_answer', { p_session_id: sessionId, p_option_id: optionId });
    setSending(false);
    if (error && !error.message.includes('already_answered')) setMyAnswer(null);
  }

  async function answerOrder(ids: string[]) {
    if (myAnswer || sending || remaining === 0) return;
    setSending(true);
    setMyAnswer({ ...ANSWERED, order_ids: ids });
    const { error } = await supabase.rpc('submit_order', { p_session_id: sessionId, p_order: ids });
    setSending(false);
    if (error && !error.message.includes('already_answered')) setMyAnswer(null);
  }

  // Só mostra a pergunta carregada se ainda for a do estado atual da sessão
  const current = question && question.status === status && question.position === position ? question : null;

  if (!me || !session) {
    return <div className="flex min-h-dvh items-center justify-center bg-night text-white/60">…</div>;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-night text-white">
      <header className="flex items-center justify-between px-4 py-3">
        <span className="font-semibold">{me.nickname}</span>
        <div className="flex items-center gap-2">
          {ranking && status !== 'lobby' && <span className="rounded-full bg-white/10 px-3 py-1 text-sm tabular-nums">{ranking.score} pts</span>}
          <LanguageSwitcher dark />
        </div>
      </header>

      {/* Sala de espera */}
      {status === 'lobby' && (
        <Centered>
          <p className="text-6xl">🙌</p>
          <h1 className="font-display mt-4 text-3xl font-semibold">{t('youAreIn')}</h1>
          <p className="mt-2 text-white/70">{t('seeName')}</p>
          <p className="mt-8 animate-pulse text-sm text-white/50">{t('waitStart')}</p>
        </Centered>
      )}

      {/* Pergunta */}
      {status === 'question' && current && (
        <main className="flex flex-1 flex-col px-4 pb-6">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              {current.type === 'verse' && (
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gold">{t('completeVerse')}</p>
              )}
              <h1 className="font-display text-xl font-semibold leading-snug sm:text-2xl">
                {current.type === 'verse' ? <VerseGapText text={current.text} /> : current.text}
              </h1>
              {current.type === 'verse' && current.bible_ref && <p className="mt-1 text-sm text-white/60">📖 {current.bible_ref}</p>}
            </div>
            <TimerBadge remaining={remaining} total={current.time_limit_s} size="sm" />
          </div>

          {myAnswer ? (
            <Centered>
              <p className="text-5xl">⏳</p>
              <h2 className="font-display mt-4 text-2xl font-semibold">{t('answered')}</h2>
              <p className="mt-2 text-white/60">{t('waitOthers')}</p>
            </Centered>
          ) : remaining === 0 ? (
            <Centered>
              <p className="text-5xl">⌛</p>
              <h2 className="font-display mt-4 text-2xl font-semibold">{t('timeUp')}</h2>
            </Centered>
          ) : current.type === 'order' ? (
            <OrderInput key={current.question_id} items={current.options} disabled={sending} onSubmit={answerOrder} />
          ) : (
            <div className="mt-6 grid flex-1 grid-cols-2 grid-rows-2 gap-3">
              {/* Grelha 2×2 como no Kahoot, mas com o texto na língua de cada jogador */}
              {current.options.map((o, i) => (
                <button
                  key={o.id}
                  onClick={() => answer(o.id)}
                  disabled={sending}
                  className={`${ANSWER_STYLES[i].bg} flex min-h-32 flex-col items-start justify-between gap-2 rounded-2xl p-4 text-left text-lg font-bold leading-snug text-white shadow-lg transition active:scale-[0.97]`}
                >
                  <span className="text-2xl opacity-80">{ANSWER_STYLES[i].shape}</span>
                  <span className="break-words">{o.text}</span>
                </button>
              ))}
            </div>
          )}
        </main>
      )}

      {/* Revelação */}
      {status === 'reveal' && current && <RevealView question={current} myAnswer={myAnswer} ranking={ranking} locale={locale} />}

      {/* Fim */}
      {status === 'finished' && (
        <Centered>
          <p className="text-6xl">{ranking?.rank === 1 ? '🏆' : ranking && ranking.rank <= 3 ? '🎉' : '🙏'}</p>
          <h1 className="font-display mt-4 text-3xl font-semibold">{t('gameOver')}</h1>
          {ranking && (
            <>
              <p className="mt-3 text-xl">{t('finalRank', { rank: ranking.rank, total: ranking.total })}</p>
              <p className="mt-1 text-white/60">{t('score', { score: ranking.score })}</p>
            </>
          )}
          <p className="mt-8 text-white/70">{t('thanks')}</p>
          <Link href="/" className="btn-gold mt-6">
            {t('home')}
          </Link>
        </Centered>
      )}
    </div>
  );
}

function RevealView({
  question,
  myAnswer,
  ranking,
  locale,
}: {
  question: CurrentQuestion;
  myAnswer: MyAnswer | null;
  ranking: Ranking | null;
  locale: string;
}) {
  const t = useTranslations('play');
  const correct = question.options.find((o) => o.is_correct);
  const right = myAnswer?.is_correct === true;
  const rightOrder =
    question.type === 'order' && question.correct_order
      ? question.correct_order.map((id) => question.options.find((o) => o.id === id)).filter((o) => o !== undefined)
      : [];

  return (
    <div className={`flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center ${right ? 'bg-emerald-600' : myAnswer ? 'bg-rose-600' : ''}`}>
      <p className="text-6xl">{right ? '✅' : myAnswer ? '❌' : '⌛'}</p>
      <h1 className="font-display mt-4 text-4xl font-semibold">{right ? t('correct') : myAnswer ? t('wrong') : t('noAnswer')}</h1>
      {right && myAnswer?.points_awarded != null && (
        <p className="mt-3 rounded-full bg-white/20 px-5 py-2 text-xl font-bold">{t('points', { points: myAnswer.points_awarded })}</p>
      )}
      {!right && correct && <p className="mt-4 text-lg text-white/90">{t('rightAnswer', { answer: correct.text })}</p>}
      {question.type === 'order' ? (
        <>
          {rightOrder.length > 0 && (
            <div className="mt-5 w-full max-w-md text-left">
              <p className="mb-2 text-center text-sm font-semibold uppercase tracking-widest text-white/80">{t('rightOrder')}</p>
              <ol className="space-y-1.5">
                {rightOrder.map((o, i) => (
                  <li key={o.id} className="flex items-baseline gap-3 rounded-xl bg-black/20 px-3 py-2">
                    <span className="font-bold tabular-nums">{i + 1}.</span>
                    <span className="flex-1">
                      <span className="font-semibold">{o.text}</span>
                      {o.ref && <span className="block text-xs text-white/70">📖 {o.ref}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      ) : (
        <div className="mt-5 w-full max-w-md">
          <VerseReveal reference={question.bible_ref} text={question.verse_text} size="sm" locale={locale} />
        </div>
      )}
      {ranking && (
        <div className="mt-8">
          <p className="text-lg font-semibold">{t('rank', { rank: ranking.rank })}</p>
          {ranking.ahead && (
            <p className="mt-1 text-sm text-white/80">
              {ranking.ahead.gap === 0
                ? t('tied', { name: ranking.ahead.name })
                : t('behind', { points: ranking.ahead.gap, name: ranking.ahead.name })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">{children}</div>;
}
