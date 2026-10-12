import { describe, expect, it } from 'vitest';
import { buildExport, buildSeriesBundle, buildSeriesExport, csvField, exportBaseName, toCsv, toSeriesCsv } from './export';
import { rank, type RacerState } from './race';
import type { AnswerResult, Question } from './types';

const questions: Question[] = [
  { id: 1, difficulty: 'easy', category: 'Geo', question: 'Capital of Australia?', answer: 'Canberra', aliases: [] },
  { id: 2, difficulty: 'hard', category: 'Math', question: 'What is 17, cubed?', answer: '4913', aliases: [] },
  { id: 3, difficulty: 'medium', category: 'Geo', question: 'Unreached question', answer: 'x', aliases: [] },
];

const res = (qi: number, extra: Partial<AnswerResult>): AnswerResult => ({
  questionIndex: qi, raw: '', answer: '', reasoning: '', correct: false, latencyMs: 1000, ...extra,
});

function racer(lane: number, results: AnswerResult[], apiKey: string): RacerState {
  return {
    lane,
    entry: {
      endpoint: { provider: { id: 'p', name: `Provider ${lane}`, baseUrl: 'https://x' }, baseUrl: 'https://x', apiKey },
      model: `org/model-${lane}`,
    },
    results,
    correct: results.filter((r) => r.correct).length,
    answered: results.length,
    errors: results.filter((r) => r.error).length,
    currentQ: results.length - 1,
    status: 'stopped',
  };
}

const racers = [
  racer(0, [res(0, { answer: 'Canberra', correct: true, raw: 'ANSWER: Canberra', reasoning: 'hmm' }), res(1, { answer: '=1+1' })], 'sk-secret-0'),
  racer(1, [res(0, { timedOut: true, latencyMs: 10_000 }), res(1, { error: 'HTTP 500', latencyMs: 0 })], 'sk-secret-1'),
];
const summary = { reason: 'stopped' as const, ranking: rank(racers), durationMs: 12_345.6 };
const data = buildExport(racers, questions, 20, summary, { startedAt: new Date('2026-10-08T10:00:00Z'), difficulty: 'Easy + Hard', timeLimitMs: 10_000 }, new Date('2026-10-08T10:01:00Z'));

describe('buildExport', () => {
  it('never includes API keys', () => {
    expect(JSON.stringify(data)).not.toContain('sk-secret');
  });
  it('captures race settings and standings', () => {
    expect(data.race).toMatchObject({ durationMs: 12_346, winningDistance: 20, questionCount: 3, difficulty: 'Easy + Hard', timeLimitSec: 10 });
    expect(data.standings.map((s) => [s.place, s.model, s.correct, s.timeouts, s.errors])).toEqual([
      [1, 'org/model-0', 1, 0, 0],
      [2, 'org/model-1', 0, 1, 1],
    ]);
  });
  it('records each answer outcome and skips unreached questions', () => {
    expect(data.questions).toHaveLength(2);
    expect(data.questions[0].answers.map((a) => a.result)).toEqual(['correct', 'timeout']);
    expect(data.questions[1].answers.map((a) => a.result)).toEqual(['wrong', 'error']);
    expect(data.questions[1].answers[1].latencyMs).toBeNull();
    expect(data.questions[0].answers[0].reasoning).toBe('hmm');
  });
});

describe('CSV', () => {
  it('has a header plus one row per question per model', () => {
    const lines = toCsv(data).trimEnd().split('\r\n');
    expect(lines).toHaveLength(1 + 2 * 2);
    expect(lines[0]).toBe('question_no,difficulty,category,question,expected_answer,lane,provider,model,result,answer,ttft_ms,latency_ms,tok_per_sec,tokens_in,tokens_cached,tokens_out,tokens_reasoning,tokens_estimated,cost_usd,error');
    expect(lines[3]).toContain('"What is 17, cubed?"');
  });
  it('quotes and neutralizes formulas', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('=1+1')).toBe("'=1+1");
    expect(csvField('-5')).toBe('-5');
    expect(csvField('-cmd')).toBe("'-cmd");
    expect(csvField(null)).toBe('');
  });
});

it('file name uses local date and time', () => {
  expect(exportBaseName(new Date(2026, 9, 8, 15, 32))).toBe('llm-derby-2026-10-08-1532');
});

describe('series export', () => {
  const races = [
    { raceNo: 1, data },
    { raceNo: 2, data },
  ];
  it('puts every counted race in one CSV with a race_no column', () => {
    const lines = toSeriesCsv(races).trimEnd().split('\r\n');
    const single = toCsv(data).trimEnd().split('\r\n');
    expect(lines[0]).toBe(`race_no,${single[0]}`);
    expect(lines).toHaveLength(1 + 2 * (single.length - 1));
    expect(lines[1].startsWith('1,')).toBe(true);
    expect(lines[lines.length - 1].startsWith('2,')).toBe(true);
  });
  it('bundles the series standings and each race, without API keys', () => {
    const series = buildSeriesExport({ of: 3, legs: [{ order: [0, 1], correct: [1, 0] }, { order: [1, 0], correct: [0, 1] }] }, racers);
    const bundle = buildSeriesBundle(series, races, new Date('2026-10-08T11:00:00Z'));
    expect(bundle.type).toBe('series');
    expect(bundle.series.racesCounted).toBe(2);
    expect(bundle.races.map((r) => r.raceNo)).toEqual([1, 2]);
    expect(bundle.races[0].data.questions.length).toBe(data.questions.length);
    expect(JSON.stringify(bundle)).not.toMatch(/sk-secret/);
  });
});
