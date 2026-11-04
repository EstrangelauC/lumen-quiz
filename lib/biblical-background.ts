import books from './bible-books.json';

/** Decorative themes, not factual illustrations of every verse. Indexes match the 6×4 atlas. */
export const BOOK_SCENES: Record<string, number> = {
  GEN: 0, EXO: 4, LEV: 6, NUM: 6, DEU: 5, JOS: 7, JDG: 7, RUT: 8,
  '1SA': 9, '2SA': 9, '1KI': 10, '2KI': 11, '1CH': 9, '2CH': 10,
  EZR: 10, NEH: 10, EST: 13, JOB: 14, PSA: 15, PRO: 15, ECC: 15, SNG: 15,
  ISA: 16, JER: 16, LAM: 12, EZK: 12, DAN: 12, HOS: 16, JOL: 16,
  AMO: 16, OBA: 16, JON: 17, MIC: 16, NAM: 16, HAB: 16, ZEP: 16,
  HAG: 10, ZEC: 16, MAL: 16, MAT: 19, MRK: 19, LUK: 19, JHN: 19,
  ACT: 22, ROM: 22, '1CO': 22, '2CO': 22, GAL: 22, EPH: 22, PHP: 22,
  COL: 22, '1TH': 22, '2TH': 22, '1TI': 22, '2TI': 22, TIT: 22, PHM: 22,
  HEB: 15, JAS: 15, '1PE': 22, '2PE': 22, '1JN': 19, '2JN': 19,
  '3JN': 19, JUD: 16, REV: 23,
};
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = books.flatMap(book => [book.code, ...Object.values(book.names)].map(name => ({ name: normalize(name), code: book.code })));

export function biblicalScene(reference: string | null): number | null {
  if (!reference) return null;
  // Chapter is the last number before ':'; preceding digits may be part of a book name.
  const match = reference.match(/^\s*(.*?)\s+(\d+)\s*[:.]/);
  if (!match) return null;
  const book = aliases.find(alias => alias.name === normalize(match[1]))?.code;
  if (!book) return null;
  const chapter = Number(match[2]);
  if (book === 'GEN') return chapter <= 3 ? 0 : chapter <= 9 ? 1 : chapter <= 25 ? 2 : chapter >= 37 ? 3 : 2;
  if (book === 'EXO') return chapter <= 18 ? 4 : chapter <= 24 ? 5 : 6;
  if (book === '1KI') return chapter <= 11 ? 10 : 11;
  if (book === '2KI') return chapter <= 13 ? 11 : 12;
  if (book === 'MAT') return chapter <= 2 ? 18 : chapter >= 28 ? 21 : [8,9,14,15].includes(chapter) ? 20 : 19;
  if (book === 'MRK') return chapter >= 16 ? 21 : [4,5,6,7,8].includes(chapter) ? 20 : 19;
  if (book === 'LUK') return chapter <= 2 ? 18 : chapter >= 24 ? 21 : [5,7,8,9].includes(chapter) ? 20 : 19;
  if (book === 'JHN') return chapter >= 20 ? 21 : 19;
  return BOOK_SCENES[book] ?? null;
}
