'use client';

/** Mantém a pergunta e as opções escondidas durante a preparação. */
export default function QuestionIntro({
  remaining,
  title,
  subtitle,
  questionLabel,
}: {
  remaining: number;
  title: string;
  subtitle: string;
  questionLabel: string;
}) {
  return (
    <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-[5vh] text-center text-white">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-gold">{questionLabel}</p>
      <h1 className="font-display mt-3 text-[clamp(1.8rem,6vh,3.5rem)] font-bold">{title}</h1>
      <div
        key={remaining}
        className="mt-[5vh] flex size-[clamp(9rem,30vh,16rem)] shrink-0 items-center justify-center rounded-full border-[7px] border-gold bg-white/10 shadow-[0_0_70px_rgba(242,184,75,0.23)] backdrop-blur-md animate-[pop_0.3s_ease-out]"
        role="timer"
        aria-label={String(remaining)}
      >
        <span className="font-display text-[clamp(5rem,18vh,10rem)] font-extrabold leading-none tabular-nums">{remaining}</span>
      </div>
      <p className="mt-[5vh] text-base font-medium text-white/70 sm:text-lg">{subtitle}</p>
    </main>
  );
}
