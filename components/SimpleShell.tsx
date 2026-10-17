import { getTranslations } from 'next-intl/server';
import Logo from './Logo';
import LanguageSwitcher from './LanguageSwitcher';

/** Moldura simples (logótipo + língua) para login, registo e entrada no jogo. */
export default async function SimpleShell({ children }: { children: React.ReactNode }) {
  const ta = await getTranslations('app');
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <Logo name={ta('name')} />
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">{children}</main>
    </div>
  );
}
