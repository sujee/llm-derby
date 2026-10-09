import { describe, expect, it } from 'vitest';
import { percentile, rank, statsOf, type RacerState } from './race';
import type { AnswerResult } from './types';

const res = (latencyMs: number, correct = true, error?: string): AnswerResult => ({
  questionIndex: 0, raw: '', answer: '', reasoning: '', correct, latencyMs, error,
});

function racer(lane: number, results: AnswerResult[], finishMs?: number): RacerState {
  return {
    lane,
    entry: { endpoint: { provider: { id: 'sim', name: 'Sim', baseUrl: '' }, baseUrl: '', apiKey: '' }, model: `m${lane}` },
    results,
    correct: results.filter((r) => r.correct).length,
    answered: results.length,
    errors: results.filter((r) => r.error).length,
    currentQ: results.length - 1,
    status: finishMs ? 'finished' : 'stopped',
    finishMs,
  };
}

describe('statsOf', () => {
  it('reports p50 and p90 latency, ignoring errors', () => {
    const st = statsOf(racer(0, [res(1000), res(2000), res(40_000), res(0, false, 'HTTP 500')]));
    expect(st.medianLatencyMs).toBe(2000);
    expect(st.p90LatencyMs).toBeCloseTo(32_400, 0); // 2000 + 0.8 * (40000 - 2000)
    expect(st.errors).toBe(1);
    expect(st.incorrect).toBe(0);
  });
  it('averages the middle pair for an even count', () => {
    expect(statsOf(racer(0, [res(1000), res(3000)])).medianLatencyMs).toBe(2000);
  });
});

describe('percentile', () => {
  it('interpolates between ranks', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(xs, 0.5)).toBe(5.5);
    expect(percentile(xs, 0.9)).toBeCloseTo(9.1);
    expect(percentile([7], 0.9)).toBe(7);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe('rank', () => {
  it('puts finishers first, then most correct, then lowest median latency', () => {
    const a = racer(0, [res(500), res(500)]);
    const b = racer(1, [res(900), res(900), res(900)], 5000);
    const c = racer(2, [res(300), res(300)]);
    expect(rank([a, b, c]).map((r) => r.lane)).toEqual([1, 2, 0]);
  });
});
