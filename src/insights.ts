import { normalize } from './grading';
import { isBankQuestion } from './questions';
import type { RacerState } from './race';
import type { Question } from './types';

/**
 * Prototype: turn one finished race into "question bank feedback".
 *
 * A race is a small sample (3–4 models, questions picked at random), so these flags are
 * advisory hints for a human, not proof. A question is flagged when two or more models
 * agree on the same wrong answer, which usually means a missing alias or a wrong key.
 * Expert questions are generated with answers computed in code, so they are never flagged.
 */
export type FlagKind = 'consensus';

export interface RaceFlag {
  kind: FlagKind;
  question: Question;
  /** Answers that counted (no error, no timeout). */
  graded: number;
  /** The shared wrong answer (as written) and how many models gave it. */
  answer: string;
  count: number;
}

export interface Insights {
  flags: RaceFlag[];
  /** Bank questions the race actually reached, so the panel can say what it checked. */
  checked: number;
}

/** Two models agreeing on the same wrong answer is the weakest signal worth showing. */
const MIN_AGREE = 2;

export function analyzeRace(racers: RacerState[], questions: Question[]): Insights {
  const flags: RaceFlag[] = [];
  let checked = 0;
  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    if (!isBankQuestion(q)) continue;
    const attempts = racers.flatMap((r) => {
      const res = r.results[qi];
      if (!res) return [];
      return [{ lane: r.lane, model: r.entry.model, answer: res.answer, correct: res.correct, error: res.error, timedOut: res.timedOut }];
    });
    if (!attempts.length) continue;
    checked++;

    // Errors and timeouts say nothing about the answer key, so they don't count.
    const graded = attempts.filter((a) => !a.error && !a.timedOut);
    if (graded.length < MIN_AGREE) continue;

    // Group the wrong answers by their normalized form; keep an original spelling to show.
    const groups = new Map<string, { count: number; example: string }>();
    for (const a of graded) {
      if (a.correct || !a.answer.trim()) continue;
      const key = normalize(a.answer);
      if (!key) continue;
      const g = groups.get(key) ?? { count: 0, example: a.answer.trim() };
      g.count++;
      groups.set(key, g);
    }
    const best = [...groups.values()].sort((a, b) => b.count - a.count)[0];
    if (best && best.count >= MIN_AGREE) {
      flags.push({ kind: 'consensus', question: q, graded: graded.length, answer: best.example, count: best.count });
    }
  }
  return { flags, checked };
}

/** Ready-to-paste JSON for adding a missing alias to a bank entry. */
export function aliasPatch(q: Question, alias: string): string {
  return JSON.stringify({ id: q.id, answer: q.answer, aliases: [...q.aliases, alias] }, null, 2);
}
