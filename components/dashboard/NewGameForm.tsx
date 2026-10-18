'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Level = 'easy' | 'medium' | 'hard';
type Counts = Record<Level, number>;

const LEVELS: { id: Level; icon: string }[] = [
  { id: 'easy', icon: '🌱' },
  { id: 'medium', icon: '📖' },
  { id: 'hard', icon: '🏛️' },
];
const COUNTS = [5, 10, 15, 20] as const;
const DEFAULT_COUNT = 10;

/** Maior número permitido que cabe nas perguntas disponíveis (ou o pedido, se couber). */
function fit(wanted: number, available: number) {
  if (wanted <= available) return wanted;
  return [...COUNTS].reverse().find((c) => c <= available) ?? COUNTS[0];
}

export default function NewGameForm({ counts }: { counts: Counts }) {
  const t = useTranslations('newGame');
  const tc = useTranslations('common');
  const router = useRouter();

  const firstUsable = LEVELS.find((l) => counts[l.id] >= COUNTS[0])?.id;
  const [level, setLevel] = useState<Level>(firstUsable ?? 'easy');
  const [count, setCount] = useState<number>(fit(DEFAULT_COUNT, counts[firstUsable ?? 'easy']));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const canStart = counts[level] >= COUNTS[0] && count <= counts[level];

  function pickLevel(l: Level) {
    setLevel(l);
    setCount((c) => fit(c, counts[l]));
  }

  async function start() {
    if (!canStart || busy) return;
    setBusy(true);
    setError(false);
    const { data, error: err } = await createClient().rpc('create_session', { p_level: level, p_count: count });
    if (err || !data) {
      setBusy(false);
      return setError(true);
    }
    router.push(`/host/${(data as { session_id: string }).session_id}`);
  }

  return (
    <div className="mt-8 space-y-8">
      <section>
        <h2 className="label">{t('level')}</h2>
        <div className="mt-2 grid gap-4 md:grid-cols-3" role="radiogroup" aria-label={t('level')}>
          {LEVELS.map(({ id, icon }) => {
            const usable = counts[id] >= COUNTS[0];
            const selected = level === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!usable}
                onClick={() => pickLevel(id)}
                className={`card flex min-h-28 items-center gap-4 p-5 text-left transition md:flex-col md:items-start md:gap-2 ${
                  selected ? 'ring-4 ring-gold' : 'hover:-translate-y-0.5'
                } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0`}
              >
                <span className="text-4xl" aria-hidden>
                  {icon}
                </span>
                <span>
                  <span className="font-display block text-2xl font-semibold">{t(id)}</span>
                  <span className="mt-1 block text-ink/70">{t(`${id}Desc`)}</span>
                  <span className="mt-2 block text-sm font-semibold text-ink/50">
                    {usable ? t('available', { count: counts[id] }) : t('unavailable')}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="label">{t('count')}</h2>
        <div className="mt-2 grid grid-cols-4 gap-3 sm:max-w-md" role="radiogroup" aria-label={t('count')}>
          {COUNTS.map((c) => {
            const ok = c <= counts[level];
            const selected = count === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!ok}
                onClick={() => setCount(c)}
                className={`font-display rounded-xl border-2 py-4 text-2xl font-semibold transition ${
                  selected ? 'border-gold bg-gold text-ink' : 'border-ink/15 bg-white text-ink hover:border-ink/40'
                } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink/15`}
              >
                {c}
              </button>
            );
          })}
        </div>
      </section>

      <div className="space-y-3">
        <button type="button" onClick={start} disabled={!canStart || busy} className="btn-gold w-full px-8 text-lg sm:w-auto">
          {busy ? t('starting') : t('start')}
        </button>
        {error && (
          <p role="alert" className="text-rose-700">
            {tc('error')}
          </p>
        )}
      </div>
    </div>
  );
}
