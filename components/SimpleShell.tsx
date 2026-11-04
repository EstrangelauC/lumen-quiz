import { getTranslations } from 'next-intl/server';
import Logo from './Logo';
import BiblicalArt from './BiblicalArt';
import LanguageSwitcher from './LanguageSwitcher';

/** Moldura simples (logótipo + língua) para login, registo e entrada no jogo. */
export default async function SimpleShell({ children }: { children: React.ReactNode }) {
  const ta = await getTranslations('app');
  return (
    <div className="lumen-entry flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <Logo name={ta('name')} />
        <LanguageSwitcher />
      </header>
      <main className="entry-layout mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 pb-16 pt-6 md:grid-cols-2">
        <BiblicalArt scene="lamp" className="entry-art hidden md:block" />
        <div className="flex justify-center">{children}</div>
      </main>
    </div>
  );
}

