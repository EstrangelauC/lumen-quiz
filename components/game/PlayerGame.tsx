'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ANSWER_STYLES } from '@/lib/quiz';
import type { CurrentQuestion, GameSession, Player } from '@/lib/types';
import { useCountdown } from '@/hooks/useCountdown';
import TimerBadge from './TimerBadge';

type MyAnswer = { option_id: string; is_correct: boolean | null; points_awarded: number | null };

export default function PlayerGame({ sessionId }: { sessionId: string }) {
  const t = useTranslations('play');
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [me, setMe] = useState<Player | null>(null);
  const [session, setSession] = useState<GameSession | null>(null);
  const [question, setQuestion] = useState<CurrentQuestion | null>(null);
  const [offset, setOffset] = useState(0);
  const [myAnswer, setMyAnswer] = useState<MyAnswer | null>(null);
  const [sending, setSending] = useState(false);
  const [ranking, setRanking] = useState<{ rank: number; total: number; score: number } | null>(null);

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
    const { data } = await supabase.from('players').select('id, score').eq('session_id', sessionId).order('score', { ascending: false });
    const list = (data ?? []) as { id: string; score: number }[];
    const idx = list.findIndex((p) => p.id === me.id);
    setRanking({ rank: idx + 1, total: list.length, score: list[idx]?.score ?? 0 });
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
      const { data } = await supabase.rpc('get_current_question', { p_session_id: sessionId, p_locale: me.locale });
      if (cancelled || !data) return;
      const q = data as CurrentQuestion;
      setQuestion(q);
      setOffset(Date.parse(q.server_now) - Date.now());
      const { data: ans } = await supabase
        .from('answers')
        .select('option_id, is_correct, points_awarded')
        .eq('player_id', me.id)
        .eq('question_id', q.question_id)
        .maybeSingle();
      if (cancelled) return;
      setMyAnswer(ans ? (status === 'reveal' ? (ans as MyAnswer) : { option_id: ans.option_id, is_correct: null, points_awarded: null }) : null);
      if (status === 'reveal') loadRanking();
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, sessionId, me, status, position, loadRanking]);

  const remaining = useCountdown(question?.started_at, question?.time_limit_s ?? 0, offset, status === 'question');

  async function answer(optionId: string) {
    if (myAnswer || sending || remaining === 0) return;
    setSending(true);
    setMyAnswer({ option_id: optionId, is_correct: null, points_awarded: null });
    const { error } = await supabase.rpc('submit_answer', { p_session_id: sessionId, p_option_id: optionId });
    setSending(false);
    if (error && !error.message.includes('already_answered')) setMyAnswer(null);
  }

  if (!me || !session) {
    return <div className="flex min-h-dvh items-center justify-center bg-night text-white/60">…</div>;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-night text-white">
      <header className="flex items-center justify-between px-4 py-3">
        <span className="font-semibold">{me.nickname}</span>
        {ranking && status !== 'lobby' && <span className="rounded-full bg-white/10 px-3 py-1 text-sm tabular-nums">{ranking.score} pts</span>}
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
      {status === 'question' && question && (
        <main className="flex flex-1 flex-col px-4 pb-6">
          <div className="flex items-start gap-3">
            <h1 className="font-display flex-1 text-xl font-semibold leading-snug sm:text-2xl">{question.text}</h1>
            <TimerBadge remaining={remaining} total={question.time_limit_s} size="sm" />
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
          ) : (
            <div className="mt-6 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              {question.options.map((o, i) => (
                <button
                  key={o.id}
                  onClick={() => answer(o.id)}
                  disabled={sending}
                  className={`${ANSWER_STYLES[i].bg} flex min-h-20 items-center gap-3 rounded-2xl px-5 py-4 text-left text-lg font-bold text-white shadow-lg transition active:scale-[0.97]`}
                >
                  <span className="text-xl opacity-80">{ANSWER_STYLES[i].shape}</span>
                  <span>{o.text}</span>
                </button>
              ))}
            </div>
          )}
        </main>
      )}

      {/* Revelação */}
      {status === 'reveal' && question && (
        <RevealView question={question} myAnswer={myAnswer} ranking={ranking} />
      )}

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
}: {
  question: CurrentQuestion;
  myAnswer: MyAnswer | null;
  ranking: { rank: number; total: number; score: number } | null;
}) {
  const t = useTranslations('play');
  const correct = question.options.find((o) => o.is_correct);
  const right = myAnswer?.is_correct === true;

  return (
    <div className={`flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center ${right ? 'bg-emerald-600' : myAnswer ? 'bg-rose-600' : ''}`}>
      <p className="text-6xl">{right ? '✅' : myAnswer ? '❌' : '⌛'}</p>
      <h1 className="font-display mt-4 text-4xl font-semibold">{right ? t('correct') : myAnswer ? t('wrong') : t('noAnswer')}</h1>
      {right && myAnswer?.points_awarded != null && (
        <p className="mt-3 rounded-full bg-white/20 px-5 py-2 text-xl font-bold">{t('points', { points: myAnswer.points_awarded })}</p>
      )}
      {!right && correct && <p className="mt-4 text-lg text-white/90">{t('rightAnswer', { answer: correct.text })}</p>}
      {question.bible_ref && <p className="mt-3 text-sm text-white/70">📖 {question.bible_ref}</p>}
      {ranking && <p className="mt-8 font-semibold">{t('rank', { rank: ranking.rank })}</p>}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">{children}</div>;
}
