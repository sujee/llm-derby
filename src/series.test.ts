import { describe, expect, it } from 'vitest';
import { seriesClinched, seriesDone, seriesStandings, type SeriesState } from './series';

describe('series', () => {
  it('scores 3/2/1/0 by place and sorts by points', () => {
    const s: SeriesState = {
      of: 3,
      legs: [
        { order: [2, 0, 1, 3], correct: [5, 4, 8, 1] },
        { order: [0, 2, 3, 1], correct: [8, 2, 6, 5] },
      ],
    };
    const rows = seriesStandings(s, 4);
    expect(rows.map((r) => [r.lane, r.points, r.wins, r.correct, r.places.join('')])).toEqual([
      [2, 5, 1, 14, '12'],
      [0, 5, 1, 13, '21'], // same points and wins as lane 2, fewer correct
      [1, 1, 0, 6, '34'],
      [3, 1, 0, 6, '43'], // ties lane 1 on everything: lane order decides
    ]);
    expect(seriesDone(s)).toBe(false);
    expect(seriesDone({ ...s, of: 2 })).toBe(true);
  });
  it('breaks a points tie on wins', () => {
    // lane 0: 1st + 4th = 3 points, 1 win; lane 1: 2nd + 3rd = 3 points, 0 wins.
    const s: SeriesState = { of: 2, legs: [{ order: [0, 1, 2, 3], correct: [0, 0, 0, 0] }, { order: [2, 3, 1, 0], correct: [9, 9, 0, 0] }] };
    const rows = seriesStandings(s, 4);
    expect(rows.find((r) => r.lane === 0)!.points).toBe(3);
    expect(rows.find((r) => r.lane === 1)!.points).toBe(3);
    expect(rows.findIndex((r) => r.lane === 0)).toBeLessThan(rows.findIndex((r) => r.lane === 1));
  });
  it('knows when the leader cannot be caught', () => {
    const win0 = { order: [0, 1, 2], correct: [3, 2, 1] };
    expect(seriesClinched({ of: 5, legs: [win0, win0] }, 3)).toBe(false); // gap 2, 9 points left
    expect(seriesClinched({ of: 3, legs: [win0, win0] }, 3)).toBe(false); // gap 2, 3 points left
    expect(seriesClinched({ of: 5, legs: [win0, win0, win0, win0] }, 3)).toBe(true); // gap 4 > 3
    expect(seriesClinched({ of: 3, legs: [win0, win0, win0] }, 3)).toBe(true); // all raced
  });
});
