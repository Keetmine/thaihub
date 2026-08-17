export const PAGE_SIZE = 30;

// A short/common search term (a single letter, say) can still match
// thousands of rows in a large catalog — capping search results keeps
// the public catalog pages from reproducing the exact "render everything
// at once" slowdown that not showing the full list by default was meant
// to avoid.
export const SEARCH_RESULT_LIMIT = 100;

/** Parses a `?page=` search param — defaults to 1 for anything missing or
 *  not a positive integer, rather than letting a bad value 500 or NaN
 *  through to `skip`. */
export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function totalPagesFor(count: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(count / pageSize));
}
