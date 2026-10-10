import { describe, expect, it } from 'vitest';
import { bestLanes, correctAt, difficultyBreakdown, leadChanges, linearScale, niceTicks, raceProgress, spreadLabels } from './charts';
import type { RacerState } from './race';
import type { AnswerResult, Difficulty, Question } from './types';

function q(id: number, difficulty: Difficulty): Question {
  return { id, difficulty, category: 'T', question: `Q${id}?`, answer: 'A', aliases: [] };
}

function res(correct: boolean, extra: Partial<AnswerResult> = {}): AnswerResult {
  return { questionIndex: 0, raw: '', answer: 'A', reasoning: '', correct, latencyMs: 1000, ...extra };
}

function racer(lane: number, results: (AnswerResult | undefined)[]): RacerState {
  return {
    lane,
    entry: { endpoint: { provider: { id: 'sim', name: 'Sim', baseUrl: '' }, baseUrl: '', apiKey: '' }, model: `m${lane}` },
    results,
    correct: 0,
    answered: 0,
    errors: 0,
    currentQ: 0,
    status: 'done',
  };
}

describe('linearScale', () => {
  it('maps a domain onto a range', () => {
    const s = linearScale([0, 10], [0, 100]);
    expect(s(0)).toBe(0);
    expect(s(5)).toBe(50);
    expect(s(10)).toBe(100);
  });
  it('supports a descending range (y-up)', () => {
    const s = linearScale([0, 10], [100, 0]);
    expect(s(0)).toBe(100);
    expect(s(10)).toBe(0);
  });
  it('centres a zero-width domain', () => {
    expect(linearScale([5, 5], [0, 100])(5)).toBe(50);
  });
});

describe('niceTicks', () => {
  it('uses round steps from zero and covers the maximum', () => {
    expect(niceTicks(20)).toEqual([0, 5, 10, 15, 20]);
    expect(niceTicks(12)).toEqual([0, 5, 10, 15]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(47, 6)).toEqual([0, 10, 20, 30, 40, 50]);
  });
  it('handles fractions without float noise', () => {
    expect(niceTicks(0.9, 3)).toEqual([0, 0.5, 1]);
  });
  it('falls back when there is nothing to show', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe('raceProgress', () => {
  it('adds a point per correct answer at the time it landed', () => {
    const r = racer(0, [res(true, { atMs: 1000 }), res(false, { atMs: 2500 }), res(true, { atMs: 4000 })]);
    expect(raceProgress([r])[0].points).toEqual([
      { tMs: 0, correct: 0 },
      { tMs: 1000, correct: 1 },
      { tMs: 4000, correct: 2 },
    ]);
  });
  it('runs the line on to where the horse stopped', () => {
    const r = racer(1, [res(true, { atMs: 1000 }), res(false, { atMs: 3000 })]);
    const { lane, points } = raceProgress([r])[0];
    expect(lane).toBe(1);
    expect(points[points.length - 1]).toEqual({ tMs: 3000, correct: 1 });
  });
  it('falls back to summed latencies when answers carry no clock time', () => {
    const r = racer(0, [res(true), res(true)]);
    expect(raceProgress([r])[0].points.map((p) => p.tMs)).toEqual([0, 1000, 2000]);
  });
  it('carries a horse still racing on to the end of the race, but not one that withdrew', () => {
    const results = [res(true, { atMs: 1000 })];
    const running = { ...racer(0, results), status: 'stopped' as const };
    const withdrawn = { ...racer(1, results), status: 'dnf' as const };
    const [a, b] = raceProgress([running, withdrawn], 5000);
    expect(a.points[a.points.length - 1]).toEqual({ tMs: 5000, correct: 1 });
    expect(b.points[b.points.length - 1]).toEqual({ tMs: 1000, correct: 1 });
  });
  it('skips questions never reached and gives an idle horse a single point', () => {
    expect(raceProgress([racer(0, [undefined])])[0].points).toEqual([{ tMs: 0, correct: 0 }]);
  });
});

describe('correctAt', () => {
  const line = { lane: 0, points: [{ tMs: 0, correct: 0 }, { tMs: 1000, correct: 1 }, { tMs: 4000, correct: 2 }] };
  it('reads the score at a moment', () => {
    expect(correctAt(line, 500)).toBe(0);
    expect(correctAt(line, 1000)).toBe(1);
    expect(correctAt(line, 3999)).toBe(1);
    expect(correctAt(line, 9000)).toBe(2);
  });
});

describe('leadChanges', () => {
  const line = (lane: number, times: number[]) => ({ lane, points: [{ tMs: 0, correct: 0 }, ...times.map((tMs, i) => ({ tMs, correct: i + 1 }))] });
  it('is zero when one horse leads all the way', () => {
    expect(leadChanges([line(0, [1, 2, 3]), line(1, [5, 6])])).toBe(0);
  });
  it('counts a horse getting strictly ahead, not drawing level', () => {
    // Lane 0 leads at t=1; lane 1 draws level at t=2 (no change) and goes ahead at t=3 (one change).
    expect(leadChanges([line(0, [1]), line(1, [2, 3])])).toBe(1);
  });
  it('counts the lead changing back', () => {
    expect(leadChanges([line(0, [1, 5, 6]), line(1, [2, 3])])).toBe(2);
  });
  it('is zero when nobody scored', () => {
    expect(leadChanges([line(0, []), line(1, [])])).toBe(0);
  });
});

describe('spreadLabels', () => {
  it('leaves labels alone when they already have room', () => {
    expect(spreadLabels([10, 50, 90], 15, 0, 100)).toEqual([10, 50, 90]);
  });
  it('pushes crowded labels apart, keeping input order', () => {
    const out = spreadLabels([50, 52, 51], 15, 0, 100);
    const sorted = [...out].sort((a, b) => a - b);
    expect(sorted[1] - sorted[0]).toBeGreaterThanOrEqual(15);
    expect(sorted[2] - sorted[1]).toBeGreaterThanOrEqual(15);
    // The label that wanted the lowest position still has it.
    expect(out[0]).toBe(Math.min(...out));
    expect(out[1]).toBe(Math.max(...out));
  });
  it('keeps a stack at the bottom edge inside the range', () => {
    const out = spreadLabels([100, 100, 100], 15, 0, 100);
    expect(Math.max(...out)).toBe(100);
    expect([...out].sort((a, b) => a - b)).toEqual([70, 85, 100]);
  });
});

describe('bestLanes', () => {
  const vals = [
    { lane: 0, value: 0.5 },
    { lane: 1, value: 0.9 },
    { lane: 2, value: null },
    { lane: 3, value: 0.9 },
  ];
  it('picks the highest or the lowest, sharing ties', () => {
    expect(bestLanes(vals, 'high')).toEqual([1, 3]);
    expect(bestLanes(vals, 'low')).toEqual([0]);
  });
  it('is empty when nobody has a value', () => {
    expect(bestLanes([{ lane: 0, value: null }], 'high')).toEqual([]);
  });
});

describe('difficultyBreakdown', () => {
  it('counts correct/answered per level and ignores errors and timeouts', () => {
    const questions = [q(1, 'easy'), q(2, 'easy'), q(3, 'hard'), q(4, 'expert')];
    const r = racer(0, [
      res(true),
      res(false),
      res(false, { error: 'boom' }),
      res(false, { timedOut: true }),
    ]);
    const per = difficultyBreakdown([r], questions).get(0)!;
    const easy = per.find((x) => x.difficulty === 'easy')!;
    expect(easy.correct).toBe(1);
    expect(easy.answered).toBe(2);
    expect(easy.accuracy).toBeCloseTo(0.5);
    // Error and timeout don't count as answers.
    expect(per.find((x) => x.difficulty === 'hard')!.answered).toBe(0);
    expect(per.find((x) => x.difficulty === 'expert')!.accuracy).toBeNull();
  });
});
