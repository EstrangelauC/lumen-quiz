'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';

export default function DashboardNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();

  const links = [
    { href: '/dashboard', label: t('myQuizzes'), icon: '📚' },
    { href: '/dashboard/discover', label: t('discover'), icon: '🧭' },
    { href: '/dashboard/settings', label: t('settings'), icon: '⚙️' },
  ];

  const isActive = (href: string) =>
    href === '/dashboard'
      ? pathname === '/dashboard' || pathname.startsWith('/dashboard/quizzes')
      : pathname.startsWith(href);

  async function logout() {
    await createClient().auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
            isActive(l.href) ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white'
          }`}
        >
          <span aria-hidden>{l.icon}</span>
          {l.label}
        </Link>
      ))}
      <button onClick={logout} className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-white/70 hover:text-white">
        {t('logout')}
      </button>
    </nav>
  );
}
