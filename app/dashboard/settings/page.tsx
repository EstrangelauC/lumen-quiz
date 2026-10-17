import { getTranslations } from 'next-intl/server';
import SettingsForm from '@/components/dashboard/SettingsForm';
import { getRegisteredUser } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';

export default async function SettingsPage() {
  const t = await getTranslations('settings');
  const { supabase, user } = await getRegisteredUser();
  const profile = await loadProfile(supabase, user!.id);

  return (
    <div>
      <h1 className="font-display mb-8 text-3xl font-semibold">{t('title')}</h1>
      <SettingsForm userId={user!.id} email={user!.email ?? ''} initial={profile} />
    </div>
  );
}
