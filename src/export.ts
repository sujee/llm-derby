import { answerCost } from './api';
import { statsOf, tokensPerSec, type RaceSummary, type RacerState } from './race';
import { SERIES_POINTS, seriesClinched, seriesDone, seriesStandings, type SeriesState } from './series';
import type { Question } from './types';
import { APP_VERSION } from './version';

/** Everything about a finished race, safe to share: never includes API keys. */
export interface RaceExport {
  app: 'llm-derby';
  appVersion: number;
  exportVersion: 1;
  exportedAt: string;
  race: {
    startedAt: string;
    durationMs: number;
    endReason: RaceSummary['reason'];
    winningDistance: number;
    questionCount: number;
    difficulty: string;
    timeLimitSec: number | null;
  };
  standings: {
    place: number;
    lane: number;
    provider: string;
    model: string;
    status: string;
    finishMs: number | null;
    correct: number;
    incorrect: number;
    timeouts: number;
    errors: number;
    answered: number;
    accuracy: number | null;
    ttftP50Ms: number | null;
    latencyP50Ms: number | null;
    tokPerSecP50: number | null;
    tokensIn: number;
    tokensOut: number;
    tokensReasoning: number;
    tokensCached: number | null;
    tokensEstimated: boolean;
    costUsd: number | null;
    withdrawnReason: string | null;
  }[];
  questions: {
    number: number;
    difficulty: string;
    category: string;
    question: string;
    expectedAnswer: string;
    acceptedAnswers: string[];
    answers: {
      lane: number;
      provider: string;
      model: string;
      result: AnswerOutcome;
      answer: string;
      latencyMs: number | null;
      ttftMs: number | null;
      tokPerSec: number | null;
      tokensIn: number | null;
      tokensOut: number | null;
      tokensReasoning: number | null;
      tokensCached: number | null;
      tokensEstimated: boolean;
      costUsd: number | null;
      error: string | null;
      reply: string;
      reasoning: string;
    }[];
  }[];
}

export type AnswerOutcome = 'correct' | 'wrong' | 'timeout' | 'error' | 'not answered';

export interface ExportMeta {
  startedAt: Date;
  difficulty: string;
  timeLimitMs: number | null;
}

/** Series standings in the shape the JSON export and the PNG card both use. */
export interface SeriesExport {
  bestOf: number;
  racesCounted: number;
  over: boolean;
  pointsByPlace: number[];
  standings: {
    place: number;
    lane: number;
    provider: string;
    model: string;
    points: number;
    wins: number;
    correct: number;
    placeByRace: number[];
  }[];
}

/** Build the series block for an export; `racers` supply the lane order and names. */
export function buildSeriesExport(s: SeriesState, racers: RacerState[]): SeriesExport {
  return {
    bestOf: s.of,
    racesCounted: s.legs.length,
    over: seriesDone(s) || seriesClinched(s, racers.length),
    pointsByPlace: SERIES_POINTS.slice(0, racers.length),
    standings: seriesStandings(s, racers.length).map((row, i) => ({
      place: i + 1,
      lane: row.lane + 1,
      provider: racers[row.lane].entry.endpoint.provider.name,
      model: racers[row.lane].entry.model,
      points: row.points,
      wins: row.wins,
      correct: row.correct,
      placeByRace: row.places,
    })),
  };
}

const round = (x: number | null | undefined) => (x == null ? null : Math.round(x));
const round1 = (x: number | null | undefined) => (x == null ? null : Math.round(x * 10) / 10);

export function buildExport(
  racers: RacerState[],
  questions: Question[],
  distance: number,
  summary: RaceSummary,
  meta: ExportMeta,
  now = new Date(),
): RaceExport {
  const who = (r: RacerState) => ({ lane: r.lane + 1, provider: r.entry.endpoint.provider.name, model: r.entry.model });
  return {
    app: 'llm-derby',
    appVersion: APP_VERSION,
    exportVersion: 1,
    exportedAt: now.toISOString(),
    race: {
      startedAt: meta.startedAt.toISOString(),
      durationMs: Math.round(summary.durationMs),
      endReason: summary.reason,
      winningDistance: distance,
      questionCount: questions.length,
      difficulty: meta.difficulty,
      timeLimitSec: meta.timeLimitMs == null ? null : meta.timeLimitMs / 1000,
    },
    standings: summary.ranking.map((r, i) => {
      const st = statsOf(r);
      return {
        place: i + 1,
        ...who(r),
        status: r.status,
        finishMs: round(r.finishMs),
        correct: st.correct,
        incorrect: st.incorrect,
        timeouts: st.timeouts,
        errors: st.errors,
        answered: st.answered,
        accuracy: st.accuracy,
        ttftP50Ms: round(st.ttftP50Ms),
        latencyP50Ms: round(st.medianLatencyMs),
        tokPerSecP50: round1(st.tokPerSecP50),
        tokensIn: st.tokensIn,
        tokensOut: st.tokensOut,
        tokensReasoning: st.tokensReasoning,
        tokensCached: st.tokensCached,
        tokensEstimated: st.tokensEstimated,
        costUsd: st.costUsd,
        withdrawnReason: r.dnfReason ?? null,
      };
    }),
    // Only questions that at least one horse reached.
    questions: questions
      .map((q, qi) => ({ q, qi }))
      .filter(({ qi }) => racers.some((r) => r.currentQ >= qi))
      .map(({ q, qi }) => ({
        number: qi + 1,
        difficulty: q.difficulty,
        category: q.category,
        question: q.question,
        expectedAnswer: q.answer,
        acceptedAnswers: [q.answer, ...q.aliases],
        answers: racers.map((r) => {
          const res = r.results[qi];
          const result: AnswerOutcome = !res
            ? 'not answered'
            : res.timedOut
              ? 'timeout'
              : res.error
                ? 'error'
                : res.correct
                  ? 'correct'
                  : 'wrong';
          return {
            ...who(r),
            result,
            answer: res?.answer ?? '',
            latencyMs: res && !res.error ? round(res.latencyMs) : null,
            ttftMs: round(res?.ttftMs),
            tokPerSec: res ? round1(tokensPerSec(res)) : null,
            tokensIn: res?.tokens?.in ?? null,
            tokensOut: res?.tokens?.out ?? null,
            tokensReasoning: res?.tokens?.reasoning ?? null,
            tokensCached: res?.tokens?.cached ?? null,
            tokensEstimated: !!res?.tokens?.estimated,
            costUsd: answerCost(res?.tokens, r.entry.pricing) ?? null,
            error: res?.error ?? null,
            reply: res?.raw ?? '',
            reasoning: res?.reasoning ?? '',
          };
        }),
      })),
  };
}

/** Quote a CSV field, and neutralize text that spreadsheets would run as a formula. */
export function csvField(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (/^[=+@\t\r]/.test(s) || /^-(?!\d)/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_COLUMNS = [
  'question_no', 'difficulty', 'category', 'question', 'expected_answer',
  'lane', 'provider', 'model', 'result', 'answer', 'ttft_ms', 'latency_ms', 'tok_per_sec',
  'tokens_in', 'tokens_cached', 'tokens_out', 'tokens_reasoning', 'tokens_estimated', 'cost_usd', 'error',
] as const;

/** One row per question per model (long format, easy to pivot in a spreadsheet). */
export function toCsv(data: RaceExport): string {
  const rows: unknown[][] = [[...CSV_COLUMNS]];
  for (const q of data.questions) {
    for (const a of q.answers) {
      rows.push([
        q.number, q.difficulty, q.category, q.question, q.expectedAnswer,
        a.lane, a.provider, a.model, a.result, a.answer, a.ttftMs, a.latencyMs, a.tokPerSec,
        a.tokensIn, a.tokensCached, a.tokensOut, a.tokensReasoning, a.tokensEstimated ? 'yes' : 'no', a.costUsd, a.error,
      ]);
    }
  }
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** e.g. llm-derby-2026-10-08-1532 (local time). */
export function exportBaseName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `llm-derby-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Save a blob as a file via a temporary download link. */
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save text as a file via a temporary download link. */
export function download(filename: string, text: string, type: string) {
  downloadBlob(filename, new Blob([text], { type }));
}
