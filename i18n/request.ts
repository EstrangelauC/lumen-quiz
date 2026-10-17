import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from './config';

// Língua da interface: 1) escolha guardada em cookie, 2) língua do navegador, 3) francês
export default getRequestConfig(async () => {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  let locale: Locale = defaultLocale;

  if (isLocale(saved)) {
    locale = saved;
  } else {
    const accept = (await headers()).get('accept-language') ?? '';
    const fromBrowser = accept
      .split(',')
      .map((part) => part.split(';')[0].trim().slice(0, 2).toLowerCase())
      .find(isLocale);
    if (fromBrowser) locale = fromBrowser;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
