'use client';

import { Fragment } from 'react';
import { bibleSource } from '@/lib/bible-sources';

/**
 * Versículo mostrado na revelação, com a tradução usada numa linha pequena.
 * `locale` é a língua em que o versículo foi pedido (não necessariamente a da interface).
 */
export default function VerseReveal({
  reference,
  text,
  size,
  locale,
}: {
  reference: string | null;
  text: string | null;
  size: 'lg' | 'sm';
  locale: string;
}) {
  if (!text && !reference) return null;
  const lg = size === 'lg';

  return (
    <figure className={`w-full rounded-2xl bg-black/20 text-center ${lg ? 'px-6 py-[1.5vh] sm:px-10' : 'px-4 py-3'}`}>
      {text && (
        <blockquote className={`font-display leading-snug ${lg ? 'mx-auto max-w-4xl text-[clamp(1rem,2.8vh,1.5rem)]' : 'text-base'}`}>
          “{text}”
        </blockquote>
      )}
      {reference && (
        <figcaption className={`font-semibold text-gold ${text ? 'mt-2' : ''} ${lg ? 'text-lg' : 'text-sm'}`}>📖 {reference}</figcaption>
      )}
      {text && <p className={`mt-1 text-white/50 ${lg ? 'text-xs' : 'text-[11px]'}`}>{bibleSource(locale)}</p>}
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
