import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Logo from '@/components/Logo';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import DashboardNav from '@/components/dashboard/DashboardNav';
import { getRegisteredUser } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getRegisteredUser();
  if (!user) redirect('/login?next=/dashboard');

  const ta = await getTranslations('app');

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 bg-ink">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-3">
            <Logo name={ta('name')} href="/dashboard" light />
            <div className="sm:hidden">
              <LanguageSwitcher dark />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DashboardNav />
            <div className="hidden sm:block">
              <LanguageSwitcher dark />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
