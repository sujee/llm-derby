import bank from './questions.json';
import { generateExpert } from './generated';
import type { Difficulty, Question } from './types';

export const BANK = bank as Question[];

/** All levels in race order (rising difficulty goes left to right). Expert is generated, not stored. */
export const LEVELS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

/** Default selection: the three bank levels. */
export const DEFAULT_LEVELS: Difficulty[] = ['hard', 'expert'];

export const byLevel = (level: Difficulty, from: Question[] = BANK) => from.filter((q) => q.difficulty === level);

/** Questions available at a level (expert is unlimited because it's generated). */
export const available = (level: Difficulty, from: Question[] = BANK) =>
  level === 'expert' ? Infinity : byLevel(level, from).length;

/** Selected levels, deduplicated and in race order. */
export const ordered = (levels: Difficulty[]) => LEVELS.filter((l) => levels.includes(l));

export function poolSize(levels: Difficulty[], from: Question[] = BANK): number {
  return ordered(levels).reduce((sum, l) => sum + available(l, from), 0);
}

/** Questions per race: distance × 1.5, capped by what the selected levels have. */
export function questionCount(distance: number, levels: Difficulty[], from: Question[] = BANK): number {
  return Math.min(poolSize(levels, from), Math.ceil(distance * 1.5));
}

/**
 * Split n questions evenly across the selected levels. If a level runs short, its share
 * goes to levels that still have questions.
 */
export function splitCounts(n: number, levels: Difficulty[], from: Question[] = BANK): Partial<Record<Difficulty, number>> {
  const sel = ordered(levels);
  const counts: Partial<Record<Difficulty, number>> = {};
  if (!sel.length) return counts;
  const base = Math.floor(n / sel.length);
  sel.forEach((l, i) => (counts[l] = base + (i < n % sel.length ? 1 : 0)));
  let spare = 0;
  for (const l of sel) {
    const cap = available(l, from);
    if (counts[l]! > cap) {
      spare += counts[l]! - cap;
      counts[l] = cap;
    }
  }
  for (const l of sel) {
    const room = Math.min(spare, available(l, from) - counts[l]!);
    counts[l]! += room;
    spare -= room;
  }
  return counts;
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pick n random questions from the selected levels. With `rising`, questions run
 * easy → medium → hard → expert (random order within each level).
 */
export function pickQuestions(
  n: number,
  levels: Difficulty[],
  rising: boolean,
  from: Question[] = BANK,
  rand: () => number = Math.random,
): Question[] {
  const counts = splitCounts(n, levels, from);
  const picked = ordered(levels).flatMap((l) =>
    l === 'expert' ? generateExpert(counts[l] ?? 0, rand) : shuffle(byLevel(l, from), rand).slice(0, counts[l] ?? 0),
  );
  return rising ? picked : shuffle(picked, rand);
}
