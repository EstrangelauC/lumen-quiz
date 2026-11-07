'use client';

import BiblicalArt from '@/components/BiblicalArt';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Level = 'easy' | 'medium' | 'hard';
type Counts = Record<Level, number>;

const LEVELS: { id: Level; icon: 'noah' | 'david' | 'moses' }[] = [
  { id: 'easy', icon: 'noah' },
  { id: 'medium', icon: 'david' },
  { id: 'hard', icon: 'moses' },
];
// Tem de coincidir com create_session (migração 0004)
const COUNTS = [5, 10, 15, 20, 25, 30, 40, 50] as const;
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
                className={`level-card card flex min-h-28 items-center gap-4 p-5 text-left transition-all duration-200 md:flex-col md:items-start md:gap-2 ${
                  selected ? 'level-card--selected' : 'hover:-translate-y-0.5 hover:shadow-lg'
                } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0`}
              >
                <BiblicalArt scene={icon} className="level-art" />
                {selected && (
                  <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide text-ink shadow-lg">
                    <span aria-hidden="true">✓</span>
                    {t('selected')}
                  </div>
                )}
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
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-gold/60 bg-gold-soft/60 px-4 py-3 text-sm font-semibold text-ink" role="status" aria-live="polite">
          <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gold text-ink">✓</span>
          {t('selectedLevel', { level: t(level) })}
        </p>
      </section>

      <section>
        <h2 className="label">{t('count')}</h2>
        {/* Um só botão com as escolhas; números acima das perguntas disponíveis ficam desativados */}
        <select
          aria-label={t('count')}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="field font-display mt-2 w-full py-3 text-xl font-semibold sm:max-w-xs"
        >
          {COUNTS.map((c) => (
            <option key={c} value={c} disabled={c > counts[level]}>
              {t('countOption', { count: c })}
            </option>
          ))}
        </select>
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

