import { describe, expect, it } from 'vitest';
import { BANK, available, pickQuestions, questionCount, splitCounts } from './questions';
import type { Difficulty, Question } from './types';

const rank: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2, expert: 3 };
const count = (qs: Question[], l: Difficulty) => qs.filter((x) => x.difficulty === l).length;

describe('questionCount', () => {
  it('is distance × 1.5, capped by the selected levels', () => {
    expect(questionCount(20, ['easy', 'medium', 'hard'])).toBe(30);
    expect(questionCount(7, ['medium'])).toBe(11);
    expect(questionCount(60, ['hard'])).toBe(available('hard'));
    expect(questionCount(60, ['hard', 'expert'])).toBe(90); // expert is unlimited
  });
});

describe('splitCounts', () => {
  it('splits evenly across selected levels and sums to n', () => {
    expect(splitCounts(30, ['medium', 'hard'])).toEqual({ medium: 15, hard: 15 });
    expect(splitCounts(30, ['easy', 'medium', 'hard'])).toEqual({ easy: 10, medium: 10, hard: 10 });
    for (const n of [5, 11, 31, 90]) {
      const c = splitCounts(n, ['easy', 'hard', 'expert']);
      expect((c.easy ?? 0) + (c.hard ?? 0) + (c.expert ?? 0)).toBe(n);
    }
  });
  it('moves the shortfall to other levels when one runs out', () => {
    const tiny: Question[] = [
      ...Array.from({ length: 2 }, (_, i) => q(i, 'hard')),
      ...Array.from({ length: 20 }, (_, i) => q(100 + i, 'medium')),
    ];
    expect(splitCounts(20, ['medium', 'hard'], tiny)).toEqual({ medium: 18, hard: 2 });
  });
});

describe('pickQuestions', () => {
  it('picks only from the selected levels, split evenly', () => {
    const qs = pickQuestions(30, ['medium', 'hard'], false);
    expect(qs).toHaveLength(30);
    expect(new Set(qs.map((x) => x.id)).size).toBe(30);
    expect([count(qs, 'easy'), count(qs, 'medium'), count(qs, 'hard'), count(qs, 'expert')]).toEqual([0, 15, 15, 0]);
  });
  it('a single level works', () => {
    const qs = pickQuestions(30, ['hard'], false);
    expect(count(qs, 'hard')).toBe(30);
  });
  it('expert questions are generated and can be combined with bank levels', () => {
    const qs = pickQuestions(40, ['easy', 'expert'], false);
    expect([count(qs, 'easy'), count(qs, 'expert')]).toEqual([20, 20]);
    expect(pickQuestions(90, ['easy', 'medium', 'hard'], false).some((x) => x.difficulty === 'expert')).toBe(false);
  });
  it('rising orders by level', () => {
    const qs = pickQuestions(40, ['expert', 'easy', 'hard', 'medium'], true);
    for (let i = 1; i < qs.length; i++) expect(rank[qs[i].difficulty]).toBeGreaterThanOrEqual(rank[qs[i - 1].difficulty]);
  });
  it('without rising, levels are shuffled together', () => {
    // A fully sorted order by chance is astronomically unlikely with 30 questions.
    const qs = pickQuestions(30, ['easy', 'medium', 'hard'], false);
    const sorted = qs.every((x, i) => i === 0 || rank[x.difficulty] >= rank[qs[i - 1].difficulty]);
    expect(sorted).toBe(false);
  });
  it('bank size sanity', () => {
    expect(BANK.length).toBeGreaterThanOrEqual(150);
  });
});

function q(id: number, difficulty: Difficulty): Question {
  return { id, difficulty, category: 'Test', question: `Q${id}`, answer: 'A', aliases: [] };
}
