import { statsOf, type RaceSummary, type RacerState } from './race';
import type { Question } from './types';

/** Everything about a finished race, safe to share: never includes API keys. */
export interface RaceExport {
  app: 'llm-derby';
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
    tooSlow: number;
    errors: number;
    answered: number;
    accuracy: number | null;
    latencyP50Ms: number | null;
    latencyP90Ms: number | null;
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
      error: string | null;
      reply: string;
      reasoning: string;
    }[];
  }[];
}

export type AnswerOutcome = 'correct' | 'wrong' | 'too slow' | 'error' | 'not answered';

export interface ExportMeta {
  startedAt: Date;
  difficulty: string;
  timeLimitMs: number | null;
}

const round = (x: number | null | undefined) => (x == null ? null : Math.round(x));

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
        tooSlow: st.timeouts,
        errors: st.errors,
        answered: st.answered,
        accuracy: st.accuracy,
        latencyP50Ms: round(st.medianLatencyMs),
        latencyP90Ms: round(st.p90LatencyMs),
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
              ? 'too slow'
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
  'lane', 'provider', 'model', 'result', 'answer', 'latency_ms', 'error',
] as const;

/** One row per question per model (long format, easy to pivot in a spreadsheet). */
export function toCsv(data: RaceExport): string {
  const rows: unknown[][] = [[...CSV_COLUMNS]];
  for (const q of data.questions) {
    for (const a of q.answers) {
      rows.push([
        q.number, q.difficulty, q.category, q.question, q.expectedAnswer,
        a.lane, a.provider, a.model, a.result, a.answer, a.latencyMs, a.error,
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

/** Save text as a file via a temporary download link. */
export function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
