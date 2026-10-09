import { ask, ApiError, describeError, logError, type Phase, type Trace } from './api';
import { logRequest, logResult, type LogContext } from './debuglog';
import { extractFinalAnswer, isCorrect, splitThinking } from './grading';
import type { AnswerResult, Endpoint, Question } from './types';

/** Consecutive failures before a horse is withdrawn. */
const MAX_CONSECUTIVE_ERRORS = 3;

export interface RaceEntry {
  endpoint: Endpoint;
  model: string;
  /** Lane color, used to tag this horse in debug logs. */
  color?: string;
}

export type RacerStatus = 'waiting' | 'running' | 'finished' | 'done' | 'dnf' | 'stopped';

export interface RacerState {
  lane: number;
  entry: RaceEntry;
  results: (AnswerResult | undefined)[];
  correct: number;
  answered: number;
  errors: number;
  currentQ: number;
  status: RacerStatus;
  finishMs?: number;
  dnfReason?: string;
  dnfDetail?: string;
}

export interface RacerStats {
  answered: number;
  correct: number;
  incorrect: number;
  errors: number;
  /** Not answered within the time limit. */
  timeouts: number;
  accuracy: number | null;
  /** Median (p50) latency. */
  medianLatencyMs: number | null;
  /** 90th percentile latency: how slow it gets on its slower answers. */
  p90LatencyMs: number | null;
}

export type EndReason = 'finish' | 'exhausted' | 'stopped';

export interface RaceSummary {
  reason: EndReason;
  ranking: RacerState[];
  durationMs: number;
}

export interface RaceEvents {
  onAsk(r: RacerState, qi: number): void;
  onText(r: RacerState, text: string, phase: Phase): void;
  onAnswer(r: RacerState, res: AnswerResult): void;
  onFinish(r: RacerState): void;
  onRacerDone(r: RacerState): void;
  onEnd(summary: RaceSummary): void;
}

/** Percentile with linear interpolation between ranks (p = 0.5 is the median). */
export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function statsOf(r: RacerState): RacerStats {
  const done = r.results.filter((x): x is AnswerResult => !!x);
  const ok = done.filter((x) => !x.error && !x.timedOut);
  const timeouts = done.filter((x) => x.timedOut).length;
  return {
    answered: done.length,
    correct: r.correct,
    incorrect: done.length - r.correct - r.errors - timeouts,
    errors: r.errors,
    timeouts,
    accuracy: done.length ? r.correct / done.length : null,
    medianLatencyMs: percentile(ok.map((x) => x.latencyMs), 0.5),
    p90LatencyMs: percentile(ok.map((x) => x.latencyMs), 0.9),
  };
}

/** Finishers first (by time), then most correct, then lowest median latency. */
export function rank(racers: RacerState[]): RacerState[] {
  const lat = (r: RacerState) => statsOf(r).medianLatencyMs ?? Infinity;
  return [...racers].sort(
    (a, b) =>
      (a.finishMs ?? Infinity) - (b.finishMs ?? Infinity) || b.correct - a.correct || lat(a) - lat(b) || a.lane - b.lane,
  );
}

export class Race {
  readonly racers: RacerState[];
  over = false;
  private startedAt = 0;
  private endedAt = 0;
  private readonly ctrl = new AbortController();

  constructor(
    entries: RaceEntry[],
    readonly questions: Question[],
    readonly distance: number,
    private readonly ev: RaceEvents,
    /** Per-question time limit; slower answers count as wrong. null = no limit. */
    readonly timeLimitMs: number | null = null,
  ) {
    this.racers = entries.map((entry, lane) => ({
      lane,
      entry,
      results: [],
      correct: 0,
      answered: 0,
      errors: 0,
      currentQ: -1,
      status: 'waiting',
    }));
  }

  get started() {
    return this.startedAt > 0;
  }

  get elapsedMs() {
    if (!this.startedAt) return 0;
    return (this.over ? this.endedAt : performance.now()) - this.startedAt;
  }

  start() {
    this.startedAt = performance.now();
    for (const r of this.racers) void this.run(r);
  }

  stop() {
    this.end('stopped');
  }

  private async run(r: RacerState) {
    r.status = 'running';
    let consecutiveErrors = 0;
    for (let qi = 0; qi < this.questions.length; qi++) {
      if (this.over) return;
      const q = this.questions[qi];
      r.currentQ = qi;
      this.ev.onAsk(r, qi);
      let res: AnswerResult;
      let fatal = false;
      // The time limit covers the whole question, retries included.
      const qCtrl = new AbortController();
      let timedOut = false;
      const timer = this.timeLimitMs
        ? setTimeout(() => {
            timedOut = true;
            qCtrl.abort();
          }, this.timeLimitMs)
        : undefined;
      const ctx: LogContext = {
        lane: r.lane + 1,
        color: r.entry.color ?? '#555',
        model: r.entry.model,
        provider: r.entry.endpoint.provider.name,
        qNo: qi + 1,
        question: q,
      };
      const ep = r.entry.endpoint;
      logRequest(ctx, ep.provider.simulated ? '' : `${ep.baseUrl.trim().replace(/\/+$/, '')}/chat/completions`);
      let trace: Trace | undefined;
      let apiErr: ApiError | undefined;
      try {
        const signal = AbortSignal.any([this.ctrl.signal, qCtrl.signal]);
        const out = await ask(r.entry.endpoint, r.entry.model, q, signal, (text, phase) => {
          if (!this.over) this.ev.onText(r, text, phase);
        });
        if (this.over) return;
        trace = out.trace;
        const { reply, thinking } = splitThinking(out.content);
        const answer = extractFinalAnswer(reply);
        res = {
          questionIndex: qi,
          raw: reply,
          answer,
          reasoning: [out.reasoning.trim(), thinking].filter(Boolean).join('\n\n'),
          correct: isCorrect(answer, [q.answer, ...q.aliases]),
          latencyMs: out.latencyMs,
        };
        consecutiveErrors = 0;
      } catch (e) {
        if (this.over) return;
        if (timedOut) {
          res = {
            questionIndex: qi,
            raw: '',
            answer: '',
            reasoning: '',
            correct: false,
            latencyMs: this.timeLimitMs!,
            timedOut: true,
          };
        } else {
          const err = e instanceof ApiError ? e : new ApiError(String(e));
          apiErr = err;
          consecutiveErrors++;
          fatal = err.fatal || consecutiveErrors >= MAX_CONSECUTIVE_ERRORS;
          logError(`Lane ${r.lane + 1} Q${qi + 1}${fatal ? ' (horse withdrawn)' : ''}`, err, {
            lane: r.lane + 1,
            questionNumber: qi + 1,
            consecutiveErrors,
          });
          res = {
            questionIndex: qi,
            raw: '',
            answer: '',
            reasoning: '',
            correct: false,
            latencyMs: 0,
            error: err.message,
            errorDetail: describeError(err),
          };
        }
      } finally {
        clearTimeout(timer);
      }
      logResult(ctx, res, trace, apiErr);

      r.results[qi] = res;
      r.answered++;
      if (res.correct) r.correct++;
      if (res.error) r.errors++;
      if (fatal) {
        r.status = 'dnf';
        r.dnfReason = res.error;
        r.dnfDetail = res.errorDetail;
      }
      this.ev.onAnswer(r, res);

      if (r.correct >= this.distance) {
        r.status = 'finished';
        r.finishMs = this.elapsedMs;
        this.ev.onFinish(r);
        this.end('finish');
        return;
      }
      if (r.status === 'dnf') break;
    }
    if (r.status === 'running') r.status = 'done';
    this.ev.onRacerDone(r);
    if (this.racers.every((x) => x.status !== 'running' && x.status !== 'waiting')) this.end('exhausted');
  }

  private end(reason: EndReason) {
    if (this.over) return;
    this.over = true;
    this.endedAt = performance.now();
    this.ctrl.abort();
    for (const r of this.racers) if (r.status === 'running' || r.status === 'waiting') r.status = 'stopped';
    this.ev.onEnd({ reason, ranking: rank(this.racers), durationMs: this.elapsedMs });
  }
}
