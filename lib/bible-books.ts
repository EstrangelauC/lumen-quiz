import type { Locale } from '@/i18n/config';
import booksJson from './bible-books.json';

export type BookCode = (typeof booksJson)[number]['code'];

export type BibleBook = {
  code: BookCode;
  testament: 'ot' | 'nt';
  names: Record<Locale, string>;
};

export const BOOKS = booksJson as BibleBook[];

export function bookName(code: string, locale: Locale): string {
  const book = BOOKS.find((b) => b.code === code);
  if (!book) throw new Error(`Livro desconhecido: ${code}`);
  return book.names[locale];
}
