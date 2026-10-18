'use client';

import confetti from 'canvas-confetti';
import { useEffect, useMemo, useState } from 'react';

const COLORS = ['#f4b942', '#e21b5a', '#1d9bf0', '#26b36b', '#ffffff'];

type Balloon = { id: number; left: number; delay: number; duration: number; size: number; hue: number };

// Festa do fim do jogo: balões sobem e rebentam em confetes no sítio onde estão.
// `big` (vencedor / pódio) = mais balões e mais confetes.
export default function Celebration({ big = false }: { big?: boolean }) {
  const [popped, setPopped] = useState<Set<number>>(() => new Set());

  const balloons = useMemo<Balloon[]>(
    () =>
      Array.from({ length: big ? 14 : 7 }, (_, id) => ({
        id,
        left: 5 + Math.random() * 90,
        delay: Math.random() * 1.6,
        duration: 2.6 + Math.random() * 1.4,
        size: 2.2 + Math.random() * 1.6,
        hue: Math.round(Math.random() * 360),
      })),
    [big],
  );

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Rajada inicial dos dois lados
    const burst = (x: number) =>
      confetti({ particleCount: big ? 90 : 45, spread: 70, startVelocity: 45, origin: { x, y: 0.9 }, angle: x < 0.5 ? 60 : 120, colors: COLORS });
    burst(0.1);
    burst(0.9);

    // Cada balão rebenta ao chegar perto do topo (a ~85% da subida)
    for (const b of balloons) {
      const popAt = (b.delay + b.duration * 0.85) * 1000;
      timers.push(
        setTimeout(() => {
          setPopped((prev) => new Set(prev).add(b.id));
          confetti({ particleCount: big ? 40 : 25, spread: 360, startVelocity: 18, gravity: 0.8, scalar: 0.8, ticks: 120, origin: { x: b.left / 100, y: 0.3 }, colors: COLORS });
        }, popAt),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [balloons, big]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {balloons.map((b) => (
        <span
          key={b.id}
          className="absolute bottom-0 block"
          style={{
            left: `${b.left}%`,
            fontSize: `${b.size}rem`,
            filter: `hue-rotate(${b.hue}deg)`,
            animation: popped.has(b.id)
              ? 'balloon-pop 0.18s ease-out forwards'
              : `balloon-rise ${b.duration}s ease-out ${b.delay}s both`,
          }}
        >
          🎈
        </span>
      ))}
    </div>
  );
}
