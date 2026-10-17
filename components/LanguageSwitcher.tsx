'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { isLocale, localeNames, locales, setLocaleCookie } from '@/i18n/config';

export default function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const locale = useLocale();
  const t = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{t('language')}</span>
      <span aria-hidden className={`pointer-events-none absolute left-2.5 text-sm ${dark ? 'text-white/70' : 'text-ink/60'}`}>
        🌐
      </span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          if (!isLocale(next)) return;
          setLocaleCookie(next);
          startTransition(() => router.refresh());
        }}
        className={`appearance-none rounded-lg border py-1.5 pl-8 pr-3 text-sm font-medium outline-none ${
          dark ? 'border-white/20 bg-white/10 text-white' : 'border-ink/15 bg-white text-ink'
        }`}
      >
        {locales.map((l) => (
          <option key={l} value={l} className="text-ink">
            {localeNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
