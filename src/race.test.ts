import { describe, expect, it } from 'vitest';
import { percentile, rank, statsOf, tokensPerSec, type RacerState } from './race';
import type { AnswerResult } from './types';

const res = (latencyMs: number, correct = true, error?: string, ttftMs?: number): AnswerResult => ({
  questionIndex: 0, raw: '', answer: '', reasoning: '', correct, latencyMs, error, ttftMs,
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
  it('reports p50 end-to-end latency and TTFT, ignoring errors', () => {
    const st = statsOf(
      racer(0, [res(1000, true, undefined, 300), res(2000, true, undefined, 500), res(40_000, true, undefined, 900), res(0, false, 'HTTP 500')]),
    );
    expect(st.medianLatencyMs).toBe(2000);
    expect(st.ttftP50Ms).toBe(500);
    expect(st.errors).toBe(1);
    expect(st.incorrect).toBe(0);
  });
  it('reports p50 output speed in tokens per second after the first token', () => {
    const fast = { ...res(1500, true, undefined, 500), tokens: { out: 100, estimated: false } }; // 100 tok in 1s
    const slow = { ...res(5000, true, undefined, 1000), tokens: { out: 100, estimated: false } }; // 100 tok in 4s
    const est = { ...res(2500, true, undefined, 500), tokens: { out: 100, estimated: true } }; // 100 tok in 2s
    expect(tokensPerSec(fast)).toBe(100);
    expect(tokensPerSec(slow)).toBe(25);
    const st = statsOf(racer(0, [fast, slow, est]));
    expect(st.tokPerSecP50).toBe(50);
    expect(st.tokPerSecEstimated).toBe(true);
    expect(statsOf(racer(0, [fast, slow])).tokPerSecEstimated).toBe(false);
  });
  it('skips speed when it cannot be measured', () => {
    const tok = { out: 50, estimated: false };
    expect(tokensPerSec({ ...res(1000), tokens: tok })).toBeNull(); // no TTFT
    expect(tokensPerSec({ ...res(1000, true, undefined, 950), tokens: tok })).toBeNull(); // arrived in one burst
    expect(tokensPerSec({ ...res(1000, true, undefined, 500), tokens: { out: 1, estimated: false } })).toBeNull();
    expect(tokensPerSec({ ...res(1000, false, 'HTTP 500', 500), tokens: tok })).toBeNull();
    expect(tokensPerSec({ ...res(30000, false, undefined, 500), tokens: tok, timedOut: true })).toBeNull();
    expect(statsOf(racer(0, [res(1000)])).tokPerSecP50).toBeNull();
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

describe('timeouts', () => {
  it('keep the partial reasoning received before the cutoff, ungraded', async () => {
    const { Race } = await import('./race');
    const question = { id: 1, difficulty: 'easy' as const, category: 'T', question: 'Capital of Australia?', answer: 'Canberra', aliases: [] };
    const sim = { id: 'sim', name: 'Simulated', baseUrl: '', noKey: true, simulated: true };
    let result: AnswerResult | undefined;
    await new Promise<void>((done) => {
      const race = new Race(
        [{ endpoint: { provider: sim, baseUrl: '', apiKey: '' }, model: 'sim/scholar' }], // 2.2–4.2s per answer
        [question],
        1,
        {
          onAsk() {},
          onText() {},
          onAnswer(_r, res) {
            result = res;
          },
          onFinish() {},
          onRacerDone() {},
          onEnd: () => done(),
        },
        1000, // 1s limit: the simulated model is still "thinking"
      );
      race.start();
    });
    expect(result?.timedOut).toBe(true);
    expect(result?.correct).toBe(false);
    expect(result?.answer).toBe('');
    expect(result?.reasoning.length).toBeGreaterThan(0);
    expect(result?.ttftMs).toBeGreaterThan(0);
  });
});

describe('pause', () => {
  it('stops the clock and holds back new questions until resumed, and stop releases it', async () => {
    const { Race } = await import('./race');
    const q = (id: number) => ({ id, difficulty: 'easy' as const, category: 'T', question: 'Capital of Australia?', answer: 'Canberra', aliases: [] });
    const sim = { id: 'sim', name: 'Simulated', baseUrl: '', noKey: true, simulated: true };
    let asked = 0;
    let ended = false;
    const race = new Race(
      [{ endpoint: { provider: sim, baseUrl: '', apiKey: '' }, model: 'steady' }],
      [q(1), q(2), q(3)],
      3,
      {
        onAsk() { asked++; },
        onText() {},
        onAnswer() {},
        onFinish() {},
        onRacerDone() {},
        onEnd: () => { ended = true; },
      },
    );
    race.start();
    race.pause();
    expect(race.paused).toBe(true);
    const t = race.elapsedMs;
    await new Promise((r) => setTimeout(r, 30));
    expect(race.elapsedMs).toBe(t);
    race.resume();
    expect(race.paused).toBe(false);
    race.pause();
    race.stop();
    expect(ended).toBe(true);
    expect(race.paused).toBe(false);
    expect(asked).toBeLessThanOrEqual(1);
  });
});
