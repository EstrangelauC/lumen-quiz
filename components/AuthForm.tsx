'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function AuthForm({ mode, next }: { mode: 'login' | 'register'; next?: string }) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Só aceitamos destinos internos (evita redirecionamentos para outros sites)
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();

    // Se o dispositivo já tinha uma sessão anónima de jogador, começamos do zero
    const { data: current } = await supabase.auth.getUser();
    if (current.user?.is_anonymous) await supabase.auth.signOut();

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return setError(t('invalid'));
      router.push(target);
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) return setError(error.message || tc('error'));

    if (data.session) {
      // Confirmação de e-mail desativada no Supabase: entra logo
      router.push('/dashboard');
      router.refresh();
    } else {
      setInfo(t('checkEmail'));
    }
  }

  return (
    <form onSubmit={onSubmit} className="card w-full max-w-md space-y-5 p-6 sm:p-8">
      <div>
        <h1 className="font-display text-2xl font-semibold">{mode === 'login' ? t('loginTitle') : t('registerTitle')}</h1>
        {mode === 'register' && <p className="mt-2 text-sm text-ink/60">{t('registerHint')}</p>}
      </div>

      {mode === 'register' && (
        <div>
          <label className="label" htmlFor="name">
            {t('displayName')}
          </label>
          <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoComplete="name" />
        </div>
      )}

      <div>
        <label className="label" htmlFor="email">
          {t('email')}
        </label>
        <input id="email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </div>

      <div>
        <label className="label" htmlFor="password">
          {t('password')}
        </label>
        <input
          id="password"
          type="password"
          className="field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
        {mode === 'register' && <p className="mt-1.5 text-xs text-ink/50">{t('passwordHint')}</p>}
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full text-base">
        {loading ? tc('loading') : mode === 'login' ? t('submitLogin') : t('submitRegister')}
      </button>

      <p className="text-center text-sm text-ink/60">
        {mode === 'login' ? t('noAccount') : t('haveAccount')}{' '}
        <Link href={mode === 'login' ? '/register' : '/login'} className="font-semibold text-ink underline underline-offset-4">
          {mode === 'login' ? t('submitRegister') : t('submitLogin')}
        </Link>
      </p>
    </form>
  );
}
