'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function PinForm() {
  const t = useTranslations('join');
  const router = useRouter();
  const [pin, setPin] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (/^\d{6}$/.test(pin)) router.push(`/j/${pin}`);
      }}
      className="card w-full max-w-sm space-y-5 p-6 text-center sm:p-8"
    >
      <div>
        <h1 className="font-display text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-2 text-sm text-ink/60">{t('subtitle')}</p>
      </div>
      <input
        aria-label={t('pinLabel')}
        className="field text-center font-display text-4xl font-bold tracking-[0.3em]"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        autoFocus
      />
      <button type="submit" disabled={pin.length !== 6} className="btn-primary w-full text-base">
        {t('continue')} →
      </button>
    </form>
  );
}
