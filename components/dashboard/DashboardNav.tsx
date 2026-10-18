'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

// Na barra só fica "Novo jogo"; o resto está no menu do perfil (ProfileMenu)
export default function DashboardNav() {
  const t = useTranslations('nav');
  const active = usePathname() === '/dashboard';

  return (
    <nav className="flex items-center">
      <Link
        href="/dashboard"
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
          active ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white'
        }`}
      >
        <span aria-hidden>🎮</span>
        {t('newGame')}
      </Link>
    </nav>
  );
}
