'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ANSWER_STYLES } from '@/lib/quiz';
import type { QuestionOption } from '@/lib/types';

const LETTERS = 'ABCD';

/**
 * Pergunta de ordenar: tocar nos itens por ordem atribui 1, 2, 3, 4.
 * Tocar num item já numerado retira-o a ele e aos seguintes.
 * "Confirmar" só fica ativo quando todos têm número.
 */
export default function OrderInput({
  items,
  disabled,
  onSubmit,
}: {
  items: QuestionOption[];
  disabled: boolean;
  onSubmit: (ids: string[]) => void;
}) {
  const t = useTranslations('play');
  const [picked, setPicked] = useState<string[]>([]);
  const complete = items.length > 0 && picked.length === items.length;

  function toggle(id: string) {
    if (disabled) return;
    const at = picked.indexOf(id);
    setPicked(at === -1 ? [...picked, id] : picked.slice(0, at));
  }

  return (
    <div className="mt-4 flex flex-1 flex-col">
      <p className="text-sm font-medium text-white/70">{t('orderHint')}</p>

      <div className="mt-3 grid flex-1 grid-cols-1 content-start gap-3">
        {items.map((o, i) => {
          const n = picked.indexOf(o.id);
          const on = n !== -1;
          const style = ANSWER_STYLES[i % ANSWER_STYLES.length];
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              disabled={disabled}
              aria-pressed={on}
              className={`${style.bg} flex min-h-16 items-center gap-3 rounded-2xl px-4 py-3 text-left text-lg font-bold text-white shadow-lg transition active:scale-[0.97] ${
                on ? `ring-4 ${style.ring}` : ''
              }`}
            >
              <span className="w-10 shrink-0 text-center text-base opacity-80">
                {style.shape} {LETTERS[i]}
              </span>
              <span className="flex-1">{o.text}</span>
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-extrabold tabular-nums ${
                  on ? 'bg-white text-ink' : 'border-2 border-dashed border-white/60'
                }`}
              >
                {on ? n + 1 : ''}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_2fr] gap-3">
        <button type="button" onClick={() => setPicked([])} disabled={disabled || picked.length === 0} className="btn-ghost py-4 text-lg">
          {t('clear')}
        </button>
        <button type="button" onClick={() => onSubmit(picked)} disabled={disabled || !complete} className="btn-gold py-4 text-lg">
          {t('confirm')}
        </button>
      </div>
    </div>
  );
}
