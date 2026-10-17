import { isLocale, type Locale } from '@/i18n/config';

/**
 * Tradução bíblica usada em cada língua do banco (atribuição mostrada com o versículo).
 * Depende da língua do versículo, não da língua da interface: o anfitrião vê os textos
 * na língua dele e cada jogador na sua.
 */
export const BIBLE_SOURCES: Record<Locale, string> = {
  pt: 'Bíblia Livre (BLIVRE) © Diego Santos, Mario Sérgio e Marco Teles, 2018 · CC BY 4.0',
  fr: 'Louis Segond 1910',
  en: 'King James Version',
  es: 'Reina-Valera 1909',
};

/** Línguas sem textos no banco recorrem a pt (como get_current_question). */
export function bibleSource(locale: string): string {
  return BIBLE_SOURCES[isLocale(locale) ? locale : 'pt'];
}
