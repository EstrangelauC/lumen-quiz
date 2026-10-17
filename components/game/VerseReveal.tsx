'use client';

import { useTranslations } from 'next-intl';
import { Fragment } from 'react';

/** Versículo mostrado na revelação, com a tradução usada numa linha pequena. */
export default function VerseReveal({ reference, text, size }: { reference: string | null; text: string | null; size: 'lg' | 'sm' }) {
  const t = useTranslations('bible');
  if (!text && !reference) return null;
  const lg = size === 'lg';

  return (
    <figure className={`w-full rounded-2xl bg-black/20 text-center ${lg ? 'px-6 py-5 sm:px-10' : 'px-4 py-3'}`}>
      {text && (
        <blockquote className={`font-display leading-snug ${lg ? 'mx-auto max-w-4xl text-xl sm:text-2xl' : 'text-base'}`}>
          “{text}”
        </blockquote>
      )}
      {reference && (
        <figcaption className={`font-semibold text-gold ${text ? 'mt-2' : ''} ${lg ? 'text-lg' : 'text-sm'}`}>📖 {reference}</figcaption>
      )}
      {text && <p className={`mt-1 text-white/50 ${lg ? 'text-xs' : 'text-[11px]'}`}>{t('source')}</p>}
    </figure>
  );
}

/** Enunciado de "completar o versículo": o espaço `_____` aparece como uma lacuna destacada. */
export function VerseGapText({ text }: { text: string }) {
  const parts = text.split(/_{3,}/);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <span
              aria-label="_____"
              className="mx-1 inline-block min-w-[4ch] translate-y-[0.1em] rounded-md border-b-4 border-gold bg-gold/20 align-baseline"
            >
              &nbsp;
            </span>
          )}
        </Fragment>
      ))}
    </>
  );
}
