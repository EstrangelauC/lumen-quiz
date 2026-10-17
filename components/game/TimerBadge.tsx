export default function TimerBadge({ remaining, total, size = 'lg' }: { remaining: number; total: number; size?: 'lg' | 'sm' }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const progress = total > 0 ? remaining / total : 0;
  const urgent = remaining <= 5;
  const dim = size === 'lg' ? 'h-20 w-20 text-3xl' : 'h-12 w-12 text-lg';

  return (
    <div className={`relative ${dim} shrink-0`} role="timer" aria-live="off">
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={urgent ? '#f43f5e' : '#f2b84b'}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          style={{ transition: 'stroke-dashoffset 0.25s linear' }}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-bold tabular-nums ${urgent ? 'text-rose-400' : ''}`}>
        {remaining}
      </span>
    </div>
  );
}
