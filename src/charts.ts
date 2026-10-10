import type { RacerState } from './race';
import type { Difficulty, Question } from './types';

/**
 * Pure data and geometry helpers for the race analytics. No DOM here, so the maths is
 * unit-tested; `main.ts` turns these numbers into inline SVG and plain HTML (keeping the strict CSP and
 * the no-third-party-assets rule).
 */

/** A linear map from a data domain to a pixel range (the range may be descending, for y-up). */
export function linearScale(domain: [number, number], range: [number, number]): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (span === 0) return () => (r0 + r1) / 2;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** Round axis ticks from 0 up to at least `max`: about `count` steps of 1, 2 or 5 × 10ⁿ. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let i = 0; i * step < max + step; i++) ticks.push(+(i * step).toPrecision(12));
  return ticks;
}

/** A moment in one horse's race: `correct` answers on the board at `tMs` on the race clock. */
export interface ProgressPoint {
  tMs: number;
  correct: number;
}

export interface ProgressLine {
  lane: number;
  /** Starts at (0, 0); one point per correct answer; ends where the horse stopped. */
  points: ProgressPoint[];
}

/**
 * Each horse's correct answers against the race clock. Uses the time an answer landed
 * (`atMs`); results without one (older data) fall back to the running sum of latencies.
 * A horse still racing when the race ended at `raceEndMs` (mid-question) runs on to that
 * moment; one that withdrew or ran out of questions stops where it stopped.
 */
export function raceProgress(racers: RacerState[], raceEndMs = 0): ProgressLine[] {
  return racers.map((r) => {
    const points: ProgressPoint[] = [{ tMs: 0, correct: 0 }];
    let clock = 0;
    let correct = 0;
    for (const res of r.results) {
      if (!res) continue;
      clock = Math.max(clock, res.atMs ?? clock + res.latencyMs);
      if (res.correct) points.push({ tMs: clock, correct: ++correct });
    }
    const stoppedEarly = r.status === 'dnf' || r.status === 'done';
    const end = Math.max(clock, r.finishMs ?? 0, stoppedEarly ? 0 : raceEndMs);
    if (end > points[points.length - 1].tMs) points.push({ tMs: end, correct });
    return { lane: r.lane, points };
  });
}

/** Correct answers a horse had at `tMs`. */
export function correctAt(line: ProgressLine, tMs: number): number {
  let n = 0;
  for (const p of line.points) {
    if (p.tMs > tMs) break;
    n = p.correct;
  }
  return n;
}

/**
 * How often the lead changed hands. A horse takes the lead by getting strictly ahead of
 * everyone; drawing level changes nothing, and the first leader is not a change.
 */
export function leadChanges(lines: ProgressLine[]): number {
  const events = lines
    .flatMap((l) => l.points.filter((p) => p.correct > 0).map((p) => ({ lane: l.lane, ...p })))
    .sort((a, b) => a.tMs - b.tMs || a.correct - b.correct);
  const score = new Map<number, number>();
  let leader: number | null = null;
  let changes = 0;
  for (const e of events) {
    score.set(e.lane, Math.max(score.get(e.lane) ?? 0, e.correct));
    if (e.lane === leader) continue;
    const others = Math.max(0, ...[...score].filter(([lane]) => lane !== e.lane).map(([, c]) => c));
    if (e.correct > others) {
      if (leader != null) changes++;
      leader = e.lane;
    }
  }
  return changes;
}

/**
 * Move label positions apart so neighbours are at least `gap` apart and all stay inside
 * [lo, hi], keeping their order and staying as close to the wanted positions as possible.
 * Returns the new positions in the input order.
 */
export function spreadLabels(wanted: number[], gap: number, lo: number, hi: number): number[] {
  const order = wanted.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const out: number[] = new Array(wanted.length);
  let prev = -Infinity;
  for (const o of order) {
    o.y = Math.max(o.y, lo, prev + gap);
    prev = o.y;
  }
  // Anything pushed past the bottom edge is walked back up.
  let next = Infinity;
  for (const o of [...order].reverse()) {
    o.y = Math.min(o.y, hi, next - gap);
    next = o.y;
    out[o.i] = o.y;
  }
  return out;
}

/** Lanes holding the best value (ties share it); null values never win. Empty when nobody has one. */
export function bestLanes(values: { lane: number; value: number | null }[], better: 'high' | 'low'): number[] {
  const have = values.filter((v): v is { lane: number; value: number } => v.value != null && Number.isFinite(v.value));
  if (!have.length) return [];
  const best = better === 'high' ? Math.max(...have.map((v) => v.value)) : Math.min(...have.map((v) => v.value));
  return have.filter((v) => v.value === best).map((v) => v.lane);
}

export interface LevelAccuracy {
  difficulty: Difficulty;
  correct: number;
  answered: number;
  accuracy: number | null;
}

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

/**
 * Per-level accuracy for each racer, counting only answers that arrived (errors and
 * timeouts are not answers). Keyed by lane.
 */
export function difficultyBreakdown(racers: RacerState[], questions: Question[]): Map<number, LevelAccuracy[]> {
  const out = new Map<number, LevelAccuracy[]>();
  for (const r of racers) {
    const per = DIFFICULTIES.map((difficulty) => {
      let correct = 0;
      let answered = 0;
      questions.forEach((q, qi) => {
        if (q.difficulty !== difficulty) return;
        const res = r.results[qi];
        if (!res || res.error || res.timedOut) return;
        answered++;
        if (res.correct) correct++;
      });
      return { difficulty, correct, answered, accuracy: answered ? correct / answered : null };
    });
    out.set(r.lane, per);
  }
  return out;
}
