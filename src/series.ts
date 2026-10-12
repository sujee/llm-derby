/** Points per finishing place in a series race: 1st, 2nd, 3rd, 4th. */
export const SERIES_POINTS = [3, 2, 1, 0];

/** One completed race of a series. */
export interface SeriesLeg {
  /** Lanes in finishing order (index 0 won). */
  order: number[];
  /** Correct answers by lane. */
  correct: number[];
  /** How long the race took, in ms. */
  durationMs?: number;
}

export interface SeriesState {
  /** Number of races in the series. */
  of: number;
  legs: SeriesLeg[];
}

export interface SeriesRow {
  lane: number;
  points: number;
  wins: number;
  correct: number;
  /** Place in each completed race (1-based), in race order. */
  places: number[];
}

export const seriesDone = (s: SeriesState) => s.legs.length >= s.of;

/** Standings: most points, then most wins, then most correct answers, then lane. */
export function seriesStandings(s: SeriesState, lanes: number): SeriesRow[] {
  const rows: SeriesRow[] = Array.from({ length: lanes }, (_, lane) => ({ lane, points: 0, wins: 0, correct: 0, places: [] }));
  for (const leg of s.legs) {
    leg.order.forEach((lane, i) => {
      const row = rows[lane];
      if (!row) return;
      row.points += SERIES_POINTS[i] ?? 0;
      if (i === 0) row.wins++;
      row.places.push(i + 1);
    });
    leg.correct.forEach((c, lane) => rows[lane] && (rows[lane].correct += c));
  }
  return rows.sort((a, b) => b.points - a.points || b.wins - a.wins || b.correct - a.correct || a.lane - b.lane);
}

/** True when the leader can no longer be caught, even if they score nothing in the races left. */
export function seriesClinched(s: SeriesState, lanes: number): boolean {
  const left = s.of - s.legs.length;
  if (left <= 0) return true;
  const [first, second] = seriesStandings(s, lanes);
  return !!second && first.points - second.points > left * SERIES_POINTS[0];
}
