'use client';

import { useEffect, useState } from 'react';

/**
 * Segundos restantes de uma pergunta.
 * offsetMs = (hora do servidor − hora do telemóvel), para que todos os ecrãs
 * contem igual mesmo que o relógio do telemóvel esteja adiantado ou atrasado.
 */
export function useCountdown(startedAt: string | null | undefined, limitS: number, offsetMs: number, active: boolean) {
  const [state, setState] = useState<{ key: string | null; remaining: number }>({ key: null, remaining: limitS });

  useEffect(() => {
    if (!startedAt || !active) return;
    const end = Date.parse(startedAt) + limitS * 1000;
    const tick = () =>
      setState({ key: startedAt, remaining: Math.max(0, Math.ceil((end - (Date.now() + offsetMs)) / 1000)) });
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [startedAt, limitS, offsetMs, active]);

  // Enquanto a nova pergunta não tiver "tique", devolve o tempo total (evita revelar por engano)
  return state.key === startedAt ? state.remaining : limitS;
}

/**
 * Segundos até ao início da pergunta, calculados com o mesmo relógio corrigido.
 * O intervalo atualiza o ecrã, mas não redefine o momento de início no servidor.
 */
export function useQuestionIntro(startedAt: string | null | undefined, offsetMs: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !startedAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [startedAt, active]);

  if (!active || !startedAt) return 0;
  return Math.max(0, Math.ceil((Date.parse(startedAt) - (Math.max(now, Date.now()) + offsetMs)) / 1000));
}
