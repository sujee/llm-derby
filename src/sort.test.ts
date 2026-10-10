import { describe, expect, it } from 'vitest';
import { sortRows } from './sort';

const rows = [
  { id: 'a', n: 3 as number | null, s: 'pear' },
  { id: 'b', n: null, s: 'apple' },
  { id: 'c', n: 1, s: 'fig' },
  { id: 'd', n: 3, s: 'Apple' },
];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).join('');

describe('sortRows', () => {
  it('sorts numbers both ways, keeping rows without a value last', () => {
    expect(ids(sortRows(rows, (r) => r.n, 1))).toBe('cadb');
    expect(ids(sortRows(rows, (r) => r.n, -1))).toBe('adcb');
  });
  it('keeps equal rows in their original order', () => {
    expect(ids(sortRows(rows, () => 0, -1))).toBe('abcd');
  });
  it('sorts text', () => {
    expect(ids(sortRows(rows, (r) => r.s.toLowerCase(), 1))).toBe('bdca');
  });
  it('treats NaN as missing and leaves the input untouched', () => {
    const before = ids(rows);
    expect(ids(sortRows(rows, (r) => (r.id === 'a' ? NaN : r.n), 1))).toBe('cdab');
    expect(ids(rows)).toBe(before);
  });
});
