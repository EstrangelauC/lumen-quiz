'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import LanguageSwitcher from '../LanguageSwitcher';

// Iniciais para o avatar: "Maria Santos" -> "MS"; sem nome usa o e-mail
function initials(name: string, email: string) {
  const parts = (name.trim() || email.split('@')[0]).split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2)).toUpperCase();
}

// Avatar na barra; o menu junta Definições, Descobrir, Língua e Sair
export default function ProfileMenu({ name, email }: { name: string; email: string }) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fecha ao mudar de página, ao clicar fora ou com Escape
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function logout() {
    await createClient().auth.signOut();
    router.push('/');
    router.refresh();
  }

  const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-ink hover:bg-ink/5';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('profile')}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-gold text-sm font-bold text-ink ring-2 ring-white/20 transition hover:ring-white/50"
      >
        {initials(name, email)}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-12 z-30 w-64 rounded-2xl border border-ink/10 bg-white p-2 shadow-xl">
          <div className="border-b border-ink/10 px-3 pb-3 pt-2">
            <p className="truncate font-semibold text-ink">{name || email.split('@')[0]}</p>
            <p className="truncate text-xs text-ink/60">{email}</p>
          </div>
          <div className="py-1">
            <Link role="menuitem" href="/dashboard/settings" className={item}>
              <span aria-hidden>⚙️</span>
              {t('settings')}
            </Link>
            <Link role="menuitem" href="/dashboard/discover" className={item}>
              <span aria-hidden>🧭</span>
              {t('discover')}
            </Link>
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm font-semibold text-ink">{tc('language')}</span>
              <LanguageSwitcher />
            </div>
          </div>
          <div className="border-t border-ink/10 pt-1">
            <button role="menuitem" onClick={logout} className={`${item} text-rose-700`}>
              <span aria-hidden>↩</span>
              {t('logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
