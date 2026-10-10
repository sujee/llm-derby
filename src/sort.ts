/** A value a table column can be sorted by; null means "nothing to show" and always sorts last. */
export type SortValue = number | string | null | undefined;

/**
 * A sorted copy of `rows`, by `key`, ascending (`dir` 1) or descending (`dir` -1).
 * Rows without a value come last in both directions, and equal rows keep their order.
 */
export function sortRows<T>(rows: T[], key: (row: T) => SortValue, dir: 1 | -1 = 1): T[] {
  const missing = (v: SortValue) => v == null || (typeof v === 'number' && Number.isNaN(v));
  return rows
    .map((row, i) => ({ row, i, v: key(row) }))
    .sort((a, b) => {
      if (missing(a.v) || missing(b.v)) return missing(a.v) === missing(b.v) ? a.i - b.i : missing(a.v) ? 1 : -1;
      const cmp = typeof a.v === 'string' || typeof b.v === 'string' ? String(a.v).localeCompare(String(b.v)) : (a.v as number) - (b.v as number);
      return cmp * dir || a.i - b.i;
    })
    .map((x) => x.row);
}
