import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Logo from '@/components/Logo';
import DashboardNav from '@/components/dashboard/DashboardNav';
import ProfileMenu from '@/components/dashboard/ProfileMenu';
import { getRegisteredUser } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await getRegisteredUser();
  if (!user) redirect('/login?next=/dashboard');
  const profile = await loadProfile(supabase, user.id);

  const ta = await getTranslations('app');

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 bg-ink">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo name={ta('name')} href="/dashboard" light />
          <div className="flex items-center gap-3">
            <DashboardNav />
            <ProfileMenu name={profile.display_name} email={user.email ?? ''} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
