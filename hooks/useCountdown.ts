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
