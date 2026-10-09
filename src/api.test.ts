import { describe, expect, it } from 'vitest';
import { simWrongAnswer } from './api';
import { isCorrect } from './grading';
import { generateExpert } from './generated';
import { BANK } from './questions';
import type { Question } from './types';

// Every pick the simulator could make for q (rand() stepping through each slot).
const allPicks = (q: Question) => Array.from({ length: 20 }, (_, i) => simWrongAnswer(q, () => i / 20));

describe('simWrongAnswer', () => {
  it('never picks an answer that grades as correct', () => {
    const q: Question = { id: 1, category: 'Myth', difficulty: 'easy', question: 'Which lost city sank beneath the sea?', answer: 'Atlantis', aliases: ['El Dorado'] };
    const picks = allPicks(q);
    expect(picks).not.toContain('Atlantis');
    expect(picks).not.toContain('El Dorado');
  });

  it('is wrong for every question in the bank and every generated kind', () => {
    for (const q of [...BANK, ...generateExpert(200)]) {
      for (const pick of allPicks(q)) expect(isCorrect(pick, [q.answer, ...q.aliases]), `${q.question} -> ${pick}`).toBe(false);
    }
  });
});
