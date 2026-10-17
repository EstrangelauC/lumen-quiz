'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ANSWER_STYLES } from '@/lib/quiz';
import type { CurrentQuestion, GameSession, Player } from '@/lib/types';
import { useCountdown } from '@/hooks/useCountdown';
import TimerBadge from './TimerBadge';
import LanguageSwitcher from '../LanguageSwitcher';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function HostGame({ sessionId, pin }: { sessionId: string; pin: string }) {
  const t = useTranslations('host');
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);

  const [session, setSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [question, setQuestion] = useState<CurrentQuestion | null>(null);
  const [offset, setOffset] = useState(0);
  const [answersCount, setAnswersCount] = useState(0);
  const [joinUrl, setJoinUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const revealedFor = useRef<string | null>(null);

  useEffect(() => setJoinUrl(`${window.location.origin}/j/${pin}`), [pin]);

  const loadPlayers = useCallback(async () => {
    const { data } = await supabase
      .from('players')
      .select('id, user_id, nickname, locale, score')
      .eq('session_id', sessionId)
      .order('score', { ascending: false })
      .order('joined_at', { ascending: true });
    setPlayers((data as Player[]) ?? []);
  }, [supabase, sessionId]);

  // Estado inicial + subscrições em tempo real
  useEffect(() => {
    supabase
      .from('game_sessions')
      .select('id, pin, status, level, question_count, current_position, question_started_at')
      .eq('id', sessionId)
      .single()
      .then(({ data }) => data && setSession(data as GameSession));
    loadPlayers();

    const channel = supabase
      .channel(`host-${sessionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` }, (payload) =>
        setSession(payload.new as GameSession),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `session_id=eq.${sessionId}` }, () =>
        loadPlayers(),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers', filter: `session_id=eq.${sessionId}` }, () =>
        setAnswersCount((c) => c + 1),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionId, loadPlayers]);

  // Quando muda a pergunta ou o estado, vai buscar a pergunta atual
  const status = session?.status;
  const position = session?.current_position;
  useEffect(() => {
    if (status !== 'question' && status !== 'reveal') {
      setQuestion(null);
      if (status === 'finished') loadPlayers();
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('get_current_question', { p_session_id: sessionId, p_locale: locale });
      if (cancelled || !data) return;
      const q = data as CurrentQuestion;
      setQuestion(q);
      setOffset(Date.parse(q.server_now) - Date.now());
      const { count } = await supabase
        .from('answers')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('question_id', q.question_id);
      if (!cancelled) setAnswersCount(count ?? 0);
      if (status === 'reveal') loadPlayers();
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, sessionId, status, position, locale, loadPlayers]);

  const remaining = useCountdown(question?.started_at, question?.time_limit_s ?? 0, offset, status === 'question');

  // Revela automaticamente quando o tempo acaba ou quando todos já responderam
  useEffect(() => {
    if (status !== 'question' || !question || question.status !== 'question') return;
    const everyone = players.length > 0 && answersCount >= players.length;
    if ((remaining === 0 || everyone) && revealedFor.current !== question.question_id) {
      revealedFor.current = question.question_id;
      supabase.rpc('reveal_answer', { p_session_id: sessionId }).then(() => undefined);
    }
  }, [status, question, remaining, answersCount, players.length, supabase, sessionId]);

  async function call(fn: 'next_question' | 'reveal_answer' | 'end_session') {
    setBusy(true);
    if (fn === 'reveal_answer' && question) revealedFor.current = question.question_id;
    await supabase.rpc(fn, { p_session_id: sessionId });
    setBusy(false);
  }

  async function share() {
    const text = t('shareText', { pin });
    if (navigator.share) {
      try {
        await navigator.share({ title: text, text, url: joinUrl });
        return;
      } catch {
        /* cancelado: cai para o WhatsApp */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${joinUrl}`)}`, '_blank');
  }

  async function copy() {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!session) {
    return <div className="flex min-h-dvh items-center justify-center bg-night text-white/60">…</div>;
  }

  const isLast = question ? question.position >= question.total : false;

  return (
    <div className="flex min-h-dvh flex-col bg-night text-white">
      {/* Barra superior */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold tracking-widest">PIN {pin}</span>
          <span className="text-sm text-white/60">👥 {players.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher dark />
          {status !== 'finished' && (
            <button
              onClick={() => confirm(t('confirmFinish')) && call('end_session')}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white"
            >
              {t('finish')}
            </button>
          )}
        </div>
      </header>

      {/* ---------------- SALA DE ESPERA ---------------- */}
      {status === 'lobby' && (
        <main className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 pb-10 pt-4 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
          <section className="flex flex-col items-center justify-center rounded-3xl bg-white p-6 text-center text-ink sm:p-10">
            <p className="text-sm font-semibold uppercase tracking-widest text-ink/50">{t('pin')}</p>
            <p className="font-display mt-1 text-6xl font-bold tracking-[0.15em] sm:text-8xl">{pin}</p>
            <p className="mt-6 text-ink/60">{t('joinAt')}</p>
            <p className="break-all text-lg font-semibold">{joinUrl.replace(/^https?:\/\//, '')}</p>
            {joinUrl && (
              <div className="mt-5 rounded-2xl border border-ink/10 p-3">
                <QRCodeSVG value={joinUrl} size={200} fgColor="#1b1640" marginSize={1} />
              </div>
            )}
            <p className="mt-2 text-sm text-ink/50">{t('scan')}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button onClick={share} className="btn-gold">
                📤 {t('share')}
              </button>
              <button onClick={copy} className="btn-ghost">
                {copied ? `✓ ${t('copied')}` : `🔗 ${t('copy')}`}
              </button>
            </div>
          </section>

          <section className="flex flex-col">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold">{t('players', { count: players.length })}</h2>
            </div>
            <div className="mt-4 flex flex-1 flex-wrap content-start gap-2 rounded-3xl border border-white/10 bg-white/5 p-4">
              {players.length === 0 ? (
                <p className="m-auto animate-pulse text-white/50">{t('waiting')}</p>
              ) : (
                players.map((p) => (
                  <span key={p.id} className="animate-[pop_0.3s_ease-out] rounded-full bg-white px-4 py-2 font-semibold text-ink">
                    {p.nickname}
                    <span className="ml-2 text-xs font-bold uppercase text-ink/40">{p.locale}</span>
                  </span>
                ))
              )}
            </div>
            <button onClick={() => call('next_question')} disabled={busy || players.length === 0} className="btn-gold mt-5 py-4 text-lg">
              ▶ {t('start')}
            </button>
          </section>
        </main>
      )}

      {/* ---------------- PERGUNTA / REVELAÇÃO ---------------- */}
      {(status === 'question' || status === 'reveal') && question && (
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 sm:px-6">
          <div className="flex items-center justify-between gap-4 py-2">
            <p className="text-sm font-semibold uppercase tracking-widest text-white/50">
              {t('questionOf', { n: question.position, total: question.total })}
            </p>
            {status === 'question' ? (
              <TimerBadge remaining={remaining} total={question.time_limit_s} />
            ) : (
              <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold">
                {t('answers', { count: answersCount, total: players.length })}
              </span>
            )}
          </div>

          <div className="py-6 text-center">
            {question.bible_ref && <p className="mb-2 text-sm font-medium text-gold">📖 {question.bible_ref}</p>}
            <h1 className="font-display mx-auto max-w-4xl text-3xl font-semibold leading-tight sm:text-5xl">{question.text}</h1>
          </div>

          <div className="mt-auto grid gap-3 sm:grid-cols-2">
            {question.options.map((o, i) => {
              const revealed = status === 'reveal';
              const faded = revealed && !o.is_correct;
              return (
                <div
                  key={o.id}
                  className={`${ANSWER_STYLES[i].bg} flex min-h-20 items-center gap-4 rounded-2xl px-5 py-4 text-xl font-bold text-white shadow-lg transition sm:min-h-28 sm:text-2xl ${
                    faded ? 'opacity-25' : ''
                  } ${revealed && o.is_correct ? `ring-4 ${ANSWER_STYLES[i].ring}` : ''}`}
                >
                  <span className="text-2xl opacity-80">{ANSWER_STYLES[i].shape}</span>
                  <span className="flex-1">{o.text}</span>
                  {revealed && o.is_correct && <span className="text-3xl">✓</span>}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            {status === 'question' ? (
              <>
                <span className="text-lg font-semibold text-white/80">{t('answers', { count: answersCount, total: players.length })}</span>
                <button onClick={() => call('reveal_answer')} disabled={busy} className="btn-ghost">
                  {t('reveal')}
                </button>
              </>
            ) : (
              <>
                <Leaderboard players={players.slice(0, 5)} title={t('leaderboard')} pointsLabel={(p) => t('points', { points: p })} />
                <button onClick={() => call('next_question')} disabled={busy} className="btn-gold px-8 py-4 text-lg">
                  {isLast ? `🏆 ${t('podium')}` : `${t('next')} →`}
                </button>
              </>
            )}
          </div>
        </main>
      )}

      {/* ---------------- PÓDIO ---------------- */}
      {status === 'finished' && (
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 pb-10 pt-6 text-center">
          <h1 className="font-display text-4xl font-semibold sm:text-5xl">{t('gameOver')}</h1>

          <div className="mt-10 flex w-full items-end justify-center gap-3">
            {[1, 0, 2].map((idx) => {
              const p = players[idx];
              if (!p) return <div key={idx} className="flex-1" />;
              const heights = ['h-44', 'h-32', 'h-24'];
              return (
                <div key={p.id} className="flex flex-1 flex-col items-center">
                  <span className="text-4xl">{MEDALS[idx]}</span>
                  <span className="mt-1 max-w-full truncate text-lg font-bold">{p.nickname}</span>
                  <span className="text-sm text-white/60">{t('points', { points: p.score })}</span>
                  <div className={`mt-2 w-full rounded-t-2xl ${idx === 0 ? 'bg-gold' : 'bg-white/20'} ${heights[idx]}`} />
                </div>
              );
            })}
          </div>

          {players.length > 3 && (
            <ol className="mt-8 w-full space-y-1.5 text-left" start={4}>
              {players.slice(3).map((p, i) => (
                <li key={p.id} className="flex justify-between rounded-xl bg-white/5 px-4 py-2">
                  <span>
                    {i + 4}. {p.nickname}
                  </span>
                  <span className="font-semibold tabular-nums">{p.score}</span>
                </li>
              ))}
            </ol>
          )}

          <Link href="/dashboard" className="btn-gold mt-10">
            {t('back')}
          </Link>
        </main>
      )}
    </div>
  );
}

function Leaderboard({ players, title, pointsLabel }: { players: Player[]; title: string; pointsLabel: (p: number) => string }) {
  return (
    <div className="min-w-64 flex-1 rounded-2xl bg-white/5 p-3">
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-white/50">{title}</p>
      <ol className="space-y-1">
        {players.map((p, i) => (
          <li key={p.id} className="flex items-center justify-between rounded-lg px-2 py-1">
            <span className="truncate font-semibold">
              {MEDALS[i] ?? `${i + 1}.`} {p.nickname}
            </span>
            <span className="tabular-nums text-white/70">{pointsLabel(p.score)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
