'use client';

import Link from 'next/link';
import BiblicalArt from '@/components/BiblicalArt';
import QuestionBackdrop from './QuestionBackdrop';
import { useLocale, useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ANSWER_STYLES } from '@/lib/quiz';
import type { CurrentQuestion, GameSession, Player } from '@/lib/types';
import { useCountdown, useQuestionIntro } from '@/hooks/useCountdown';
import TimerBadge from './TimerBadge';
import QuestionIntro from './QuestionIntro';
import VerseReveal, { VerseGapText } from './VerseReveal';
import LanguageSwitcher from '../LanguageSwitcher';
import Celebration from './Celebration';

const MEDALS = ['🥇', '🥈', '🥉'];
const LETTERS = 'ABCD';

export default function HostGame({ sessionId, pin }: { sessionId: string; pin: string }) {
  const t = useTranslations('host');
  const tc = useTranslations('common');
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);

  const [session, setSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [question, setQuestion] = useState<CurrentQuestion | null>(null);
  const [offset, setOffset] = useState(0);
  // Ids das respostas à pergunta atual: um Set não conta duas vezes a mesma resposta
  // (INSERT em tempo real + carga inicial) nem respostas de outra pergunta
  const [answerIds, setAnswerIds] = useState<Set<string>>(() => new Set());
  const answersCount = answerIds.size;
  const currentQuestionId = useRef<string | null>(null);
  const [joinUrl, setJoinUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reportedNow, setReportedNow] = useState<string | null>(null); // question_id reportada agora
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null); // question_id cuja reportação falhou
  const revealedFor = useRef<string | null>(null);
  // Classificação entre perguntas (como no Kahoot): mostrada no ecrã do anfitrião depois da revelação
  const [boardFor, setBoardFor] = useState<string | null>(null); // question_id cuja classificação está aberta
  const playersRef = useRef<Player[]>([]);
  // Pontos de cada jogador antes da pergunta atual (os pontos só entram na revelação)
  const prevScores = useRef<Map<string, number> | null>(null);

  // O link/QR leva a língua do anfitrião: quem entra vê o formulário na língua do jogo (pode mudar depois)
  useEffect(() => setJoinUrl(`${window.location.origin}/j/${pin}?l=${locale}`), [pin, locale]);

  const loadPlayers = useCallback(async () => {
    const { data } = await supabase
      .from('players')
      .select('id, user_id, nickname, locale, score, streak')
      .eq('session_id', sessionId)
      .order('score', { ascending: false })
      .order('joined_at', { ascending: true });
    const list = (data as Player[]) ?? [];
    playersRef.current = list;
    setPlayers(list);
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers', filter: `session_id=eq.${sessionId}` }, (payload) => {
        const row = payload.new as { id?: string; question_id?: string };
        if (!row.id || !currentQuestionId.current || row.question_id !== currentQuestionId.current) return;
        const id = row.id;
        setAnswerIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
      })
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
      // A partir daqui os INSERT em tempo real só contam para esta pergunta; os que chegarem
      // durante a carga juntam-se ao Set sem duplicar os que a consulta também devolve
      if (currentQuestionId.current !== q.question_id) {
        currentQuestionId.current = q.question_id;
        setAnswerIds(new Set());
        // Fotografia dos pontos antes desta pergunta; se a página abriu já na revelação não há base
        prevScores.current = q.status === 'question' ? new Map(playersRef.current.map((p) => [p.id, p.score])) : null;
      }
      const { data: rows } = await supabase
        .from('answers')
        .select('id')
        .eq('session_id', sessionId)
        .eq('question_id', q.question_id);
      if (cancelled) return;
      // Pergunta e contagem mudam juntas: com a contagem da pergunta anterior
      // ("todos responderam") a revelação automática disparava logo
      setQuestion(q);
      setAnswerIds((prev) => {
        const next = new Set(prev);
        for (const r of (rows as { id: string }[] | null) ?? []) next.add(r.id);
        return next;
      });
      setOffset(Date.parse(q.server_now) - Date.now());
      if (q.status === 'reveal') loadPlayers();
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, sessionId, status, position, locale, loadPlayers]);

  const remaining = useCountdown(question?.started_at, question?.time_limit_s ?? 0, offset, status === 'question');
  const introRemaining = useQuestionIntro(question?.started_at, offset, status === 'question');

  // Revela automaticamente quando o tempo acaba ou quando todos já responderam
  useEffect(() => {
    if (status !== 'question' || !question || question.status !== 'question' || question.position !== position) return;
    const everyone = players.length > 0 && answersCount >= players.length;
    if ((remaining === 0 || everyone) && revealedFor.current !== question.question_id) {
      revealedFor.current = question.question_id;
      supabase.rpc('reveal_answer', { p_session_id: sessionId }).then(() => undefined);
    }
  }, [status, position, question, remaining, answersCount, players.length, supabase, sessionId]);

  async function call(fn: 'next_question' | 'reveal_answer' | 'end_session') {
    setBusy(true);
    if (fn === 'reveal_answer' && question) revealedFor.current = question.question_id;
    await supabase.rpc(fn, { p_session_id: sessionId });
    setBusy(false);
  }

  async function report() {
    if (!question || !confirm(t('confirmReport'))) return;
    const qid = question.question_id;
    setReporting(true);
    setReportError(null);
    const { error } = await supabase.rpc('report_question', { p_session_id: sessionId });
    setReporting(false);
    if (error) setReportError(qid);
    else setReportedNow(qid);
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
  // Só mostra a pergunta carregada se ainda for a do estado atual da sessão
  const current = question && question.status === status && question.position === position ? question : null;
  const reported = current ? current.reported || reportedNow === current.question_id : false;
  const showBoard = status === 'reveal' && current !== null && boardFor === current.question_id;
  const showIntro = status === 'question' && current !== null && introRemaining > 0;
  const rightOrder =
    current?.type === 'order' && current.correct_order
      ? current.correct_order
          .map((id) => {
            const i = current.options.findIndex((o) => o.id === id);
            return i === -1 ? null : { option: current.options[i], i };
          })
          .filter((x) => x !== null)
      : [];

  return (
    // Ecrã do anfitrião = exatamente a janela (sem deslizar): tamanhos em vh e as respostas
    // esticam ou encolhem para caber; só em janelas muito baixas cada zona desliza por dentro
    <div className={`lumen-game lumen-game--${status} flex h-dvh flex-col overflow-hidden bg-night text-white`}>
      {(status === 'question' || status === 'reveal') && <QuestionBackdrop reference={showIntro ? null : (current?.bible_ref ?? null)} revealed={status === 'reveal' && current !== null} />}
      {/* Barra superior */}
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-2 sm:px-6">
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
        <main className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 gap-[3vh] overflow-y-auto px-4 pb-[3vh] pt-[1vh] sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-8">
          <section className="flex flex-col items-center justify-center rounded-3xl bg-white p-[2.5vh] text-center text-ink sm:p-[4vh]">
            <p className="text-sm font-semibold uppercase tracking-widest text-ink/50">{t('pin')}</p>
            <p className="lobby-pin font-display mt-1 text-[clamp(2.5rem,11vh,6rem)] font-bold leading-none tracking-[0.15em]">{pin}</p>
            <p className="mt-[2vh] text-ink/60">{t('joinAt')}</p>
            <p className="break-all text-lg font-semibold">{joinUrl.replace(/^https?:\/\//, '').replace(/\?.*$/, '')}</p>
            {joinUrl && (
              <div className="mt-[2vh] rounded-2xl border border-ink/10 p-2">
                <QRCodeSVG value={joinUrl} size={200} fgColor="#1b1640" marginSize={1} style={{ height: 'min(26vh, 200px)', width: 'auto' }} />
              </div>
            )}
            <p className="mt-2 text-sm text-ink/50">{t('scan')}</p>
            <div className="mt-[2vh] flex flex-wrap justify-center gap-2">
              <button onClick={share} className="btn-gold">
                📤 {t('share')}
              </button>
              <button onClick={copy} className="btn-ghost">
                {copied ? `✓ ${t('copied')}` : `🔗 ${t('copy')}`}
              </button>
            </div>
          </section>

          <section className="lobby-players flex min-h-0 flex-col">
            <BiblicalArt scene="lamp" className="lobby-art" />
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold">{t('players', { count: players.length })}</h2>
            </div>
            <div className="mt-[2vh] flex min-h-0 flex-1 flex-wrap content-start gap-2 overflow-y-auto rounded-3xl border border-white/10 bg-white/5 p-4">
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
            <button onClick={() => call('next_question')} disabled={busy || players.length === 0} className="btn-gold mt-[2vh] shrink-0 py-[1.8vh] text-lg">
              ▶ {t('start')}
            </button>
          </section>
        </main>
      )}

      {/* Preparação sincronizada antes de abrir cada pergunta */}
      {showIntro && current && (
        <QuestionIntro
          remaining={introRemaining}
          title={t('introTitle')}
          subtitle={t('introHint')}
          questionLabel={t('questionOf', { n: current.position, total: current.total })}
        />
      )}

      {/* ---------------- PERGUNTA / REVELAÇÃO ---------------- */}
      {(status === 'question' || status === 'reveal') && current && !showBoard && !showIntro && (
        <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-y-auto px-4 pb-[2.5vh] sm:px-6">
          <div className="flex shrink-0 items-center justify-between gap-4 py-[0.5vh]">
            <p className="text-sm font-semibold uppercase tracking-widest text-white/50">
              {t('questionOf', { n: current.position, total: current.total })}
            </p>
            {status === 'question' ? (
              <TimerBadge remaining={remaining} total={current.time_limit_s} />
            ) : (
              <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold">
                {t('answers', { count: answersCount, total: players.length })}
              </span>
            )}
          </div>

          <div className={`shrink-0 text-center ${status === 'reveal' ? 'py-[1vh]' : 'py-[2.5vh]'}`}>
            {current.type === 'verse' && (
              <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-gold">{t('completeVerse')}</p>
            )}
            {current.type === 'order' && status === 'question' && (
              <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-gold">{t('orderHint')}</p>
            )}
            {/* Na revelação de choice/verse a referência aparece com o versículo; no ordenar
                não há referência de pergunta (seria a do 1.º episódio): cada item mostra a sua na revelação */}
            {current.bible_ref && status === 'question' && current.type !== 'order' && (
              <p className="mb-2 text-sm font-medium text-gold">📖 {current.bible_ref}</p>
            )}
            <h1 className="font-display mx-auto max-w-4xl text-[clamp(1.35rem,4.8vh,3rem)] font-semibold leading-tight">
              {current.type === 'verse' ? <VerseGapText text={current.text} /> : current.text}
            </h1>
          </div>

          {current.type === 'order' && status === 'reveal' ? (
            /* Ordem certa, com a referência de cada episódio */
            <div className="flex min-h-0 flex-1 flex-col justify-end">
              <p className="mb-[1vh] text-sm font-semibold uppercase tracking-widest text-white/50">{t('rightOrder')}</p>
              <ol className="grid min-h-0 flex-1 auto-rows-fr gap-[1vh]">
                {rightOrder.map(({ option: o, i }, n) => (
                  <li
                    key={o.id}
                    className={`${ANSWER_STYLES[i].bg} flex items-center gap-4 rounded-2xl px-5 py-[0.6vh] text-[clamp(1rem,2.8vh,1.5rem)] font-bold text-white shadow-lg`}
                  >
                    <span className="flex h-[min(2.75rem,5.5vh)] w-[min(2.75rem,5.5vh)] shrink-0 items-center justify-center rounded-full bg-white text-[clamp(1rem,3vh,1.5rem)] font-extrabold text-ink tabular-nums">
                      {n + 1}
                    </span>
                    <span className="w-12 shrink-0 text-lg opacity-80">
                      {ANSWER_STYLES[i].shape} {LETTERS[i]}
                    </span>
                    <span className="flex-1">{o.text}</span>
                    {o.ref && <span className="shrink-0 text-base font-semibold text-white/85">📖 {o.ref}</span>}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 auto-rows-fr gap-[1.2vh] sm:grid-cols-2">
              {current.options.map((o, i) => {
                const revealed = status === 'reveal';
                const faded = revealed && !o.is_correct;
                return (
                  <div
                    key={o.id}
                    className={`${ANSWER_STYLES[i].bg} flex min-h-[2.75rem] items-center gap-4 rounded-2xl px-5 py-[0.8vh] text-[clamp(1rem,3vh,1.6rem)] font-bold text-white shadow-lg transition ${faded ? 'opacity-25' : ''} ${revealed && o.is_correct ? `ring-4 ${ANSWER_STYLES[i].ring}` : ''}`}
                  >
                    <span className="text-[clamp(1.1rem,3.2vh,1.75rem)] opacity-80">
                      {ANSWER_STYLES[i].shape}
                      {current.type === 'order' && <span className="ml-2">{LETTERS[i]}</span>}
                    </span>
                    <span className="flex-1">{o.text}</span>
                    {revealed && o.is_correct && <span className="text-3xl">✓</span>}
                  </div>
                );
              })}
            </div>
          )}

          {status === 'reveal' && current.type !== 'order' && (
            <div className="mt-[1.5vh] shrink-0">
              <VerseReveal reference={current.bible_ref} text={current.verse_text} size="lg" locale={locale} />
            </div>
          )}

          <div className="mt-[1.5vh] flex shrink-0 flex-wrap items-center justify-between gap-3">
            {status === 'question' ? (
              <>
                <span className="text-lg font-semibold text-white/80">{t('answers', { count: answersCount, total: players.length })}</span>
                <button onClick={() => call('reveal_answer')} disabled={busy} className="btn-ghost">
                  {t('reveal')}
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <button
                    onClick={report}
                    disabled={reported || reporting}
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    {reported ? `✓ ${t('reported')}` : reporting ? '…' : `⚑ ${t('report')}`}
                  </button>
                  {reportError === current.question_id && !reported && (
                    <p role="alert" className="text-sm text-rose-300">
                      {tc('error')}
                    </p>
                  )}
                </div>
                {isLast ? (
                  <button onClick={() => call('next_question')} disabled={busy} className="btn-gold px-8 py-[1.6vh] text-lg">
                    🏆 {t('podium')}
                  </button>
                ) : (
                  <button onClick={() => setBoardFor(current.question_id)} className="btn-gold px-8 py-[1.6vh] text-lg">
                    {t('showLeaderboard')} →
                  </button>
                )}
              </>
            )}
          </div>
        </main>
      )}

      {/* ---------------- CLASSIFICAÇÃO ENTRE PERGUNTAS ---------------- */}
      {showBoard && current && (
        <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-y-auto px-4 pb-[3vh] pt-[1.5vh] sm:px-6">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-white/50">
            {t('questionOf', { n: current.position, total: current.total })}
          </p>
          <h1 className="font-display mt-[1vh] text-center text-[clamp(1.75rem,6vh,3rem)] font-semibold">{t('leaderboard')}</h1>
          <Scoreboard players={players} prev={prevScores.current} pointsLabel={(p) => t('points', { points: p })} />
          <div className="mt-[3vh] flex shrink-0 justify-end">
            <button onClick={() => call('next_question')} disabled={busy} className="btn-gold px-8 py-[1.6vh] text-lg">
              {t('next')} →
            </button>
          </div>
        </main>
      )}

      {/* ---------------- PÓDIO ---------------- */}
      {status === 'finished' && (
        <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col items-center overflow-y-auto px-4 pb-[3vh] pt-[2vh] text-center">
          {players.length > 0 && <Celebration big />}
          <BiblicalArt scene="wreath" className="podium-art" />
          <h1 className="font-display text-[clamp(1.75rem,6vh,3rem)] font-semibold">{t('gameOver')}</h1>

          <div className="mt-[4vh] flex w-full shrink-0 items-end justify-center gap-3">
            {[1, 0, 2].map((idx) => {
              const p = players[idx];
              if (!p) return <div key={idx} className="flex-1" />;
              const heights = ['h-[22vh]', 'h-[16vh]', 'h-[12vh]'];
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
            <ol className="mt-[3vh] min-h-0 w-full flex-1 space-y-1.5 overflow-y-auto text-left" start={4}>
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

          <Link href="/dashboard" className="btn-gold mt-[3vh] shrink-0">
            {t('back')}
          </Link>
        </main>
      )}
    </div>
  );
}

// Top 5 com os pontos ganhos nesta pergunta e quantos lugares cada um subiu ou desceu
function Scoreboard({
  players,
  prev,
  pointsLabel,
}: {
  players: Player[];
  prev: Map<string, number> | null;
  pointsLabel: (p: number) => string;
}) {
  const prevRank = new Map<string, number>();
  if (prev) {
    [...players]
      .sort((a, b) => (prev.get(b.id) ?? 0) - (prev.get(a.id) ?? 0))
      .forEach((p, i) => prevRank.set(p.id, i));
  }
  const top = players.slice(0, 5);
  const max = Math.max(1, ...top.map((p) => p.score));

  return (
    <ol className="mt-[3vh] space-y-[1.2vh]">
      {top.map((p, i) => {
        const gained = prev ? p.score - (prev.get(p.id) ?? 0) : 0;
        const moved = prev ? (prevRank.get(p.id) ?? i) - i : 0;
        return (
          <li
            key={p.id}
            style={{ animationDelay: `${i * 80}ms` }}
            className="relative flex animate-[pop_0.4s_ease-out_both] items-center gap-4 overflow-hidden rounded-2xl bg-white/10 px-5 py-[1.4vh]"
          >
            <div
              aria-hidden
              className={`absolute inset-y-0 left-0 ${i === 0 ? 'bg-gold/30' : 'bg-white/10'} transition-[width] duration-700`}
              style={{ width: `${Math.round((p.score / max) * 100)}%` }}
            />
            <span className="relative w-10 text-2xl font-bold tabular-nums">{MEDALS[i] ?? `${i + 1}.`}</span>
            <span className="relative flex-1 truncate text-xl font-bold sm:text-2xl">
              {p.nickname}
              {(p.streak ?? 0) >= 2 && <span className="ml-2 text-base font-semibold text-orange-300">🔥 {p.streak}</span>}
            </span>
            {moved !== 0 && (
              <span className={`relative text-sm font-bold ${moved > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {moved > 0 ? `▲ ${moved}` : `▼ ${-moved}`}
              </span>
            )}
            {gained > 0 && <span className="relative text-sm font-semibold text-gold">+{gained}</span>}
            <span className="relative text-lg font-semibold tabular-nums">{pointsLabel(p.score)}</span>
          </li>
        );
      })}
    </ol>
  );
}

