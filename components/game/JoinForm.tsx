'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isLocale, localeNames, locales, setLocaleCookie, type Locale } from '@/i18n/config';

export default function JoinForm({ pin }: { pin: string }) {
  const t = useTranslations('join');
  const tc = useTranslations('common');
  const uiLocale = useLocale();
  const router = useRouter();

  const [nickname, setNickname] = useState('');
  const [lang, setLang] = useState<Locale>(isLocale(uiLocale) ? uiLocale : 'fr');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    // O jogador não cria conta: é feito um login anónimo invisível nos bastidores
    const { data: current } = await supabase.auth.getUser();
    if (!current.user) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        setLoading(false);
        return setError(tc('error'));
      }
    }

    const { data, error } = await supabase.rpc('join_session', {
      p_pin: pin,
      p_nickname: nickname.trim(),
      p_locale: lang,
    });

    if (error) {
      setLoading(false);
      if (error.message.includes('session_not_found')) return setError(t('notFound'));
      if (error.message.includes('nickname_taken')) return setError(t('nicknameTaken'));
      return setError(tc('error'));
    }

    // A interface do jogador passa a estar na língua que escolheu
    setLocaleCookie(lang);
    router.push(`/play/${(data as { session_id: string }).session_id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-5 p-6 sm:p-8">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink/50">{t('pinLabel')}</p>
        <p className="font-display text-4xl font-bold tracking-[0.2em]">{pin}</p>
        <Link href="/join" className="text-xs text-ink/50 underline underline-offset-2">
          {t('changePin')}
        </Link>
      </div>

      <div>
        <label className="label" htmlFor="nickname">
          {t('nickname')}
        </label>
        <input
          id="nickname"
          className="field text-lg"
          maxLength={20}
          required
          autoFocus
          autoComplete="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
      </div>

      <fieldset>
        <legend className="label">{t('language')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {locales.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition ${
                lang === l ? 'border-ink bg-ink text-white' : 'border-ink/10 bg-white text-ink/70'
              }`}
            >
              {localeNames[l]}
            </button>
          ))}
        </div>
      </fieldset>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <button type="submit" disabled={loading || !nickname.trim()} className="btn-gold w-full py-4 text-base">
        {loading ? tc('loading') : t('enter')}
      </button>
    </form>
  );
}
