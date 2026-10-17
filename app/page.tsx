import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Logo from '@/components/Logo';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { getRegisteredUser } from '@/lib/supabase/server';
import { ANSWER_STYLES } from '@/lib/quiz';

export default async function LandingPage() {
  const t = await getTranslations('landing');
  const tn = await getTranslations('nav');
  const ta = await getTranslations('app');
  const { user } = await getRegisteredUser();

  const steps = [
    { n: '1', title: t('step1Title'), text: t('step1Text') },
    { n: '2', title: t('step2Title'), text: t('step2Text') },
    { n: '3', title: t('step3Title'), text: t('step3Text') },
  ];
  const features = [
    { icon: '🌍', title: t('f1Title'), text: t('f1Text') },
    { icon: '📱', title: t('f2Title'), text: t('f2Text') },
    { icon: '📖', title: t('f3Title'), text: t('f3Text') },
    { icon: '🏆', title: t('f4Title'), text: t('f4Text') },
  ];
  const mockOptions = [t('mockA'), t('mockB'), t('mockC'), t('mockD')];

  return (
    <div className="min-h-dvh">
      {/* Cabeçalho */}
      <header className="bg-ink">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <Logo name={ta('name')} light />
          <nav className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher dark />
            {user ? (
              <Link href="/dashboard" className="btn-gold !py-2">
                {tn('myQuizzes')}
              </Link>
            ) : (
              <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-white/90 hover:text-white sm:block">
                {tn('login')}
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-gold/20 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 md:grid-cols-2 md:pb-28 md:pt-16">
          <div>
            <p className="mb-5 inline-block rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-gold-soft">
              {t('badge')}
            </p>
            <h1 className="font-display text-4xl font-semibold leading-[1.1] sm:text-5xl md:text-6xl">
              {t('heroTitle')}
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/75">{t('heroSubtitle')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={user ? '/dashboard' : '/register'} className="btn-gold px-6 text-base">
                {user ? tn('myQuizzes') : t('ctaCreate')}
              </Link>
              <Link href="/join" className="btn border border-white/25 px-6 text-base text-white hover:bg-white/10">
                {t('ctaJoin')}
              </Link>
            </div>
          </div>

          {/* Maqueta de telemóvel com uma pergunta */}
          <div className="mx-auto w-full max-w-xs">
            <div className="rounded-[2.5rem] border-[10px] border-night bg-parchment p-4 shadow-2xl shadow-black/40">
              <div className="mb-3 flex items-center justify-between text-xs font-semibold text-ink/50">
                <span>1 / 10</span>
                <span className="rounded-full bg-ink px-2.5 py-1 text-white">14</span>
              </div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-ink/40">Génesis 6:14</p>
              <p className="font-display mb-5 text-xl font-semibold leading-snug text-ink">{t('mockQuestion')}</p>
              <div className="grid grid-cols-2 gap-2.5">
                {mockOptions.map((label, i) => (
                  <div
                    key={label + i}
                    className={`${ANSWER_STYLES[i].bg} flex h-20 flex-col justify-between rounded-xl p-2.5 text-white shadow-sm`}
                  >
                    <span className="text-sm opacity-80">{ANSWER_STYLES[i].shape}</span>
                    <span className="text-sm font-bold">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="font-display text-center text-3xl font-semibold sm:text-4xl">{t('howTitle')}</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="card p-6">
              <span className="font-display flex h-11 w-11 items-center justify-center rounded-full bg-gold text-xl font-bold text-ink">
                {s.n}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-ink/70">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Funcionalidades */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-display text-center text-3xl font-semibold sm:text-4xl">{t('featuresTitle')}</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {features.map((f) => (
              <div key={f.title} className="flex gap-4 rounded-2xl bg-parchment p-6">
                <span className="text-3xl" aria-hidden>
                  {f.icon}
                </span>
                <div>
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="mt-1.5 leading-relaxed text-ink/70">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Para quem */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h2 className="font-display text-3xl font-semibold sm:text-4xl">{t('forTitle')}</h2>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {[t('for1'), t('for2'), t('for3'), t('for4')].map((label) => (
            <span key={label} className="rounded-full border border-ink/15 bg-white px-5 py-2.5 font-medium">
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* Chamada final */}
      <section className="px-4 pb-20">
        <div className="mx-auto max-w-4xl rounded-3xl bg-ink px-6 py-14 text-center text-white">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">{t('finalTitle')}</h2>
          <p className="mx-auto mt-3 max-w-md text-white/75">{t('finalText')}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={user ? '/dashboard' : '/register'} className="btn-gold px-6 text-base">
              {user ? tn('myQuizzes') : t('ctaCreate')}
            </Link>
            <Link href="/join" className="btn border border-white/25 px-6 text-base text-white hover:bg-white/10">
              {tn('join')}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-ink/10 py-8 text-center text-sm text-ink/50">
        © {new Date().getFullYear()} {ta('name')} · {t('footer')}
      </footer>
    </div>
  );
}
