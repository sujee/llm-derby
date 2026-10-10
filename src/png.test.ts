import { describe, expect, it } from 'vitest';
import type { RaceExport, SeriesExport } from './export';
import { cardHeight, headlineOf } from './png';

function standing(place: number): RaceExport['standings'][number] {
  return {
    place,
    lane: place,
    provider: `Provider ${place}`,
    model: `org/model-${place}`,
    status: 'finished',
    finishMs: 1000 * place,
    correct: 10 - place,
    incorrect: 2,
    timeouts: 0,
    errors: 0,
    answered: 12,
    accuracy: 0.8,
    ttftP50Ms: 300,
    latencyP50Ms: 1200,
    tokPerSecP50: 40,
    tokensIn: 1000,
    tokensOut: 2000,
    tokensReasoning: 500,
    tokensCached: null,
    tokensEstimated: false,
    costUsd: 0.01,
    withdrawnReason: null,
  };
}

function data(rows: number, reason: RaceExport['race']['endReason'] = 'finish'): RaceExport {
  return {
    app: 'llm-derby',
    appVersion: 14,
    exportVersion: 1,
    exportedAt: '2026-10-08T10:01:00.000Z',
    race: { startedAt: '2026-10-08T10:00:00.000Z', durationMs: 61_000, endReason: reason, winningDistance: 10, questionCount: 12, difficulty: 'Easy', timeLimitSec: 10 },
    standings: Array.from({ length: rows }, (_, i) => standing(i + 1)),
    questions: [],
  };
}

function series(rows: number): SeriesExport {
  return {
    bestOf: 3,
    racesCounted: 2,
    over: false,
    pointsByPlace: [3, 2, 1],
    standings: Array.from({ length: rows }, (_, i) => ({
      place: i + 1,
      lane: i + 1,
      provider: `Provider ${i + 1}`,
      model: `org/model-${i + 1}`,
      points: 6 - i,
      wins: 1,
      correct: 9,
      placeByRace: [1, 2],
    })),
  };
}

describe('cardHeight', () => {
  it('grows with every standings row', () => {
    expect(cardHeight(data(4))).toBeGreaterThan(cardHeight(data(3)));
    expect(cardHeight(data(4)) - cardHeight(data(3))).toBe(cardHeight(data(3)) - cardHeight(data(2)));
  });
  it('reserves room for the series block only when there is one', () => {
    expect(cardHeight(data(3), series(3))).toBeGreaterThan(cardHeight(data(3)));
    expect(cardHeight(data(3), series(4))).toBeGreaterThan(cardHeight(data(3), series(3)));
  });
  it('is a whole number of pixels', () => {
    expect(Number.isInteger(cardHeight(data(4), series(4)))).toBe(true);
  });
});

describe('headlineOf', () => {
  it('phrases the win, a stop, and a points decision', () => {
    expect(headlineOf(data(3, 'finish'))).toContain('wins the derby');
    expect(headlineOf(data(3, 'stopped'))).toContain('Race stopped');
    expect(headlineOf(data(3, 'exhausted'))).toContain('wins on points');
  });
  it('uses the short model name, as the app does', () => {
    expect(headlineOf(data(3))).toBe('🏆 model-1 wins the derby!');
  });
});
