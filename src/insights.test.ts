import { describe, expect, it } from 'vitest';
import { aliasPatch, analyzeRace } from './insights';
import type { RacerState } from './race';
import type { AnswerResult, Difficulty, Question } from './types';

function q(id: number, difficulty: Difficulty, answer = 'Canberra', aliases: string[] = []): Question {
  return { id, difficulty, category: 'Geo', question: `Q${id}?`, answer, aliases };
}

function res(answer: string, correct: boolean, extra: Partial<AnswerResult> = {}): AnswerResult {
  return { questionIndex: 0, raw: `ANSWER: ${answer}`, answer, reasoning: '', correct, latencyMs: 1000, ...extra };
}

function racer(lane: number, model: string, byQuestion: (AnswerResult | undefined)[]): RacerState {
  return {
    lane,
    entry: { endpoint: { provider: { id: 'sim', name: 'Sim', baseUrl: '' }, baseUrl: '', apiKey: '' }, model },
    results: byQuestion,
    correct: 0,
    answered: 0,
    errors: 0,
    currentQ: 0,
    status: 'done',
  };
}

describe('analyzeRace', () => {
  it('flags when two or more models agree on the same wrong answer', () => {
    const questions = [q(1, 'medium')];
    const racers = [
      racer(0, 'm1', [res('Canberra, Australia', false)]),
      racer(1, 'm2', [res('Canberra, Australia', false)]),
      racer(2, 'm3', [res('canberra, australia', false)]),
    ];
    const { flags, checked } = analyzeRace(racers, questions);
    expect(checked).toBe(1);
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe('consensus');
    expect(flags[0].answer).toBe('Canberra, Australia');
    expect(flags[0].count).toBe(3);
    expect(flags[0].graded).toBe(3);
    expect(flags[0].question.id).toBe(1);
  });

  it('flags two agreeing models even when a third got it right', () => {
    const questions = [q(1, 'medium')];
    const racers = [
      racer(0, 'm1', [res('Canberra, Australia', false)]),
      racer(1, 'm2', [res('Canberra, Australia', false)]),
      racer(2, 'm3', [res('Canberra', true)]),
    ];
    const { flags } = analyzeRace(racers, questions);
    expect(flags).toHaveLength(1);
    expect(flags[0].count).toBe(2);
    expect(flags[0].graded).toBe(3);
  });

  it('does not flag when the wrong answers all differ', () => {
    const questions = [q(2, 'hard')];
    const racers = [racer(0, 'm1', [res('Sydney', false)]), racer(1, 'm2', [res('Melbourne', false)])];
    expect(analyzeRace(racers, questions).flags).toHaveLength(0);
  });

  it('does not flag a single model guessing wrong', () => {
    const questions = [q(1, 'medium')];
    const racers = [racer(0, 'm1', [res('Sydney', false)]), racer(1, 'm2', [res('Canberra', true)])];
    expect(analyzeRace(racers, questions).flags).toHaveLength(0);
  });

  it('ignores errors and timeouts when deciding', () => {
    const questions = [q(4, 'hard')];
    const racers = [
      racer(0, 'm1', [res('', false, { error: 'boom' })]),
      racer(1, 'm2', [res('', false, { timedOut: true })]),
      racer(2, 'm3', [res('Sydney', false)]),
    ];
    // Only one graded answer (Sydney), so there is no agreement to flag.
    expect(analyzeRace(racers, questions).flags).toHaveLength(0);
  });

  it('does not flag when a graded model gave no answer at all', () => {
    const questions = [q(5, 'hard')];
    const racers = [racer(0, 'm1', [res('Sydney', false)]), racer(1, 'm2', [res('', false)])];
    expect(analyzeRace(racers, questions).flags).toHaveLength(0);
  });

  it('never flags generated Expert questions', () => {
    const questions = [q(100_001, 'expert')];
    const racers = [racer(0, 'm1', [res('Sydney', false)]), racer(1, 'm2', [res('Sydney', false)])];
    const { flags, checked } = analyzeRace(racers, questions);
    expect(checked).toBe(0);
    expect(flags).toHaveLength(0);
  });

  it('only counts questions the race actually reached', () => {
    const questions = [q(1, 'easy'), q(2, 'easy')];
    const racers = [racer(0, 'm1', [res('Canberra', true)]), racer(1, 'm2', [res('Canberra', true)])];
    expect(analyzeRace(racers, questions).checked).toBe(1);
  });
});

describe('aliasPatch', () => {
  it('produces a paste-ready entry that keeps existing aliases', () => {
    const patch = JSON.parse(aliasPatch(q(42, 'medium', 'Canberra', ['ACT']), 'Canberra, Australia'));
    expect(patch).toEqual({ id: 42, answer: 'Canberra', aliases: ['ACT', 'Canberra, Australia'] });
  });
});
