import Link from 'next/link';

export default function Logo({ name, href = '/', light = false }: { name: string; href?: string; light?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="h-9 w-9 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="16" fill={light ? '#fbf7ef' : '#1b1640'} />
        <path d="M32 12c4 8 10 12 10 22a10 10 0 0 1-20 0c0-10 6-14 10-22z" fill="#f2b84b" />
        <path d="M32 30c2 4 4 6 4 10a4 4 0 0 1-8 0c0-4 2-6 4-10z" fill="#fde9b8" />
        <rect x="22" y="48" width="20" height="4" rx="2" fill="#f2b84b" />
      </svg>
      <span className={`font-display text-xl font-semibold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>
        {name}
      </span>
    </Link>
  );
}
