import { describe, expect, it } from 'vitest';
import bank from './questions.json';
import { extractFinalAnswer, isCorrect, normalize, splitThinking } from './grading';
import type { Question } from './types';

describe('splitThinking', () => {
  it('removes <think> blocks', () => {
    expect(splitThinking('<think>hmm, Paris?</think>\nANSWER: Paris')).toEqual({ reply: 'ANSWER: Paris', thinking: 'hmm, Paris?' });
  });
  it('handles a closing tag without an opening tag', () => {
    expect(splitThinking('reasoning here</think>ANSWER: 7')).toEqual({ reply: 'ANSWER: 7', thinking: 'reasoning here' });
  });
  it('treats an unclosed tag as reasoning', () => {
    expect(splitThinking('<think>still going').reply).toBe('');
  });
});

describe('extractFinalAnswer', () => {
  it.each([
    ['The capital is Canberra.\nANSWER: Canberra', 'Canberra'],
    ['**ANSWER:** Canberra', 'Canberra'],
    ['**Answer**: *Canberra*.', 'Canberra'],
    ['Final answer: 42.2 km', '42.2 km'],
    ['answer: x\nANSWER: y', 'y'],
    ['ANSWER:\nOttawa', 'Ottawa'],
    ['So the result is \\boxed{391}', '391'],
    ['Thinking out loud\nJupiter', 'Jupiter'],
    ['', ''],
  ])('%j -> %j', (input, expected) => {
    expect(extractFinalAnswer(input)).toBe(expected);
  });
});

describe('normalize', () => {
  it('ignores case, accents, punctuation and leading articles', () => {
    expect(normalize('The Gabriel García-Márquez!')).toBe('gabriel garcia marquez');
  });
  it('converts number words and canonicalizes numbers', () => {
    expect(normalize('two hundred and six')).toBe('206');
    expect(normalize('twenty-six')).toBe('26');
    expect(normalize('300,000')).toBe('300000');
    expect(normalize('7.0')).toBe('7');
    expect(normalize('42.2 km.')).toBe('42.2 km');
  });
});

describe('isCorrect', () => {
  const canberra = ['Canberra'];
  it.each([
    ['Canberra', canberra, true],
    ['canberra, Australia', canberra, true],
    ['Sydney', canberra, false],
    ['Canberrra', canberra, false],
    ['', canberra, false],
    ['six', ['6'], true],
    ['16', ['6'], false],
    ['9 symphonies', ['9'], true],
    ['Hyper Text Transfer Protocol', ['Hypertext Transfer Protocol'], true],
    ['Mrs Hudson', ['Mrs. Hudson'], true],
    ['Marie Skłodowska-Curie', ['marie sklodowska curie'], true],
    ['300,000 km/s', ['300000'], true],
    ['Ω', ['Ohm', 'Ω'], true],
  ])('%j vs %j -> %s', (answer, accepted, expected) => {
    expect(isCorrect(answer, accepted)).toBe(expected);
  });
});

describe('question bank', () => {
  const questions = bank as Question[];
  it('has unique ids and question text', () => {
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
    expect(new Set(questions.map((q) => q.question)).size).toBe(questions.length);
  });
  it('has at least 50 questions at every difficulty level', () => {
    for (const level of ['easy', 'medium', 'hard']) {
      expect(questions.filter((q) => q.difficulty === level).length, level).toBeGreaterThanOrEqual(50);
    }
    expect(questions.every((q) => ['easy', 'medium', 'hard'].includes(q.difficulty))).toBe(true);
  });
  it('every display answer and alias grades as correct', () => {
    for (const q of questions) {
      const accepted = [q.answer, ...q.aliases];
      for (const a of accepted) expect(isCorrect(a, accepted), `${q.id}: ${a}`).toBe(true);
      expect(isCorrect(extractFinalAnswer(`Sure.\n**ANSWER:** ${q.answer}.`), accepted), `${q.id}`).toBe(true);
    }
  });
  it('a wrong answer from another question is not accepted', () => {
    const wrong = ['Atlantis', 'Narnia', 'Wakanda', '9999'];
    for (const q of questions) for (const w of wrong) expect(isCorrect(w, [q.answer, ...q.aliases])).toBe(false);
  });
});
