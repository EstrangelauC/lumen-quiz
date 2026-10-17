import { getTranslations } from 'next-intl/server';

// Provisório: a Task 14 transforma esta página no explorador do banco de perguntas.
export default async function DiscoverPage() {
  const t = await getTranslations('discover');
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">{t('title')}</h1>
      <p className="mt-1 text-ink/60">{t('subtitle')}</p>
    </div>
  );
}
