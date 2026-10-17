'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export const TIME_CHOICES = [10, 15, 20, 30, 45, 60, 90];

type Props = {
  userId: string;
  email: string;
  initial: { display_name: string; default_time_limit_s: number };
};

export default function SettingsForm({ userId, email, initial }: Props) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const router = useRouter();

  const [profile, setProfile] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setProfileMsg(null);
    const { error } = await createClient()
      .from('profiles')
      .upsert({
        id: userId,
        display_name: profile.display_name.trim() || null,
        default_time_limit_s: profile.default_time_limit_s,
      });
    setSaving(false);
    setProfileMsg(error ? tc('error') : t('saved'));
    if (!error) router.refresh();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwSaving(true);
    setPwMsg(null);
    const { error } = await createClient().auth.updateUser({ password });
    setPwSaving(false);
    setPwMsg(error ? error.message || tc('error') : t('passwordChanged'));
    if (!error) setPassword('');
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={saveProfile} className="card space-y-5 p-6">
        <h2 className="text-lg font-semibold">{t('profile')}</h2>

        <div>
          <label className="label" htmlFor="display_name">
            {t('displayName')}
          </label>
          <input
            id="display_name"
            className="field"
            maxLength={60}
            value={profile.display_name}
            onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
          />
        </div>

        <div>
          <label className="label" htmlFor="default_time">
            {t('defaultTime')}
          </label>
          <select
            id="default_time"
            className="field"
            value={profile.default_time_limit_s}
            onChange={(e) => setProfile({ ...profile, default_time_limit_s: Number(e.target.value) })}
          >
            {TIME_CHOICES.map((s) => (
              <option key={s} value={s}>
                {t('seconds', { count: s })}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={saving}>
            {saving ? tc('loading') : t('save')}
          </button>
          {profileMsg && <span className="text-sm text-ink/70">{profileMsg}</span>}
        </div>
      </form>

      <form onSubmit={changePassword} className="card space-y-5 p-6">
        <h2 className="text-lg font-semibold">{t('security')}</h2>

        <div>
          <span className="label">{t('email')}</span>
          <p className="rounded-xl bg-parchment px-4 py-3 text-ink/80">{email}</p>
        </div>

        <div>
          <label className="label" htmlFor="new_password">
            {t('newPassword')}
          </label>
          <input
            id="new_password"
            type="password"
            className="field"
            minLength={6}
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          <button className="btn-ghost" disabled={pwSaving}>
            {pwSaving ? tc('loading') : t('changePassword')}
          </button>
          {pwMsg && <span className="text-sm text-ink/70">{pwMsg}</span>}
        </div>
      </form>
    </div>
  );
}
