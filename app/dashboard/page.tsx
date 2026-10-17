import { getTranslations } from 'next-intl/server';
import NewGameForm from '@/components/dashboard/NewGameForm';
import { getRegisteredUser } from '@/lib/supabase/server';

export default async function NewGamePage() {
  const t = await getTranslations('newGame');
  const th = await getTranslations('dashboard');
  const { supabase, user } = await getRegisteredUser();

  const [{ data: counts }, { data: profile }] = await Promise.all([
    supabase.rpc('bank_counts'),
    supabase.from('profiles').select('display_name').eq('id', user!.id).maybeSingle(),
  ]);

  const c = (counts ?? {}) as Partial<Record<'easy' | 'medium' | 'hard', number>>;
  const name = profile?.display_name || user!.email?.split('@')[0] || '';

  return (
    <div>
      <p className="text-sm text-ink/60">{th('hello', { name })}</p>
      <h1 className="font-display text-3xl font-semibold">{t('title')}</h1>
      <p className="mt-1 max-w-2xl text-ink/70">{t('subtitle')}</p>
      <NewGameForm counts={{ easy: c.easy ?? 0, medium: c.medium ?? 0, hard: c.hard ?? 0 }} />
    </div>
  );
}
