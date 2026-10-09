import type { Question } from './types';

// "Expert" questions are generated fresh for each race and their answers are computed here,
// so models can't have memorized them and the answer key is always right.

export type Rand = () => number;

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WORDS = [
  'apple', 'anchor', 'banana', 'basket', 'bridge', 'candle', 'canyon', 'carpet', 'cherry', 'cobalt',
  'dragon', 'dinner', 'eagle', 'engine', 'falcon', 'forest', 'garden', 'ginger', 'harbor', 'helmet',
  'island', 'jacket', 'jungle', 'kettle', 'ladder', 'lemon', 'magnet', 'marble', 'meadow', 'needle',
  'number', 'orange', 'oyster', 'pencil', 'pepper', 'planet', 'pocket', 'quartz', 'rabbit', 'ribbon',
  'saddle', 'salmon', 'silver', 'spider', 'summer', 'tablet', 'teapot', 'ticket', 'tunnel', 'velvet',
  'violin', 'walnut', 'window', 'winter', 'yogurt', 'zipper', 'parrot', 'parcel', 'pebble', 'puzzle',
];

const int = (rand: Rand, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(rand: Rand, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

function shuffle<T>(xs: readonly T[], rand: Rand): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const fmtDate = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

function randomDate(rand: Rand, fromYear: number, toYear: number): Date {
  const start = Date.UTC(fromYear, 0, 1);
  const days = Math.round((Date.UTC(toYear, 11, 31) - start) / DAY_MS);
  return new Date(start + int(rand, 0, days) * DAY_MS);
}

const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

export function modPow(base: number, exp: number, mod: number): number {
  let result = 1n;
  let b = BigInt(base) % BigInt(mod);
  let e = BigInt(exp);
  const m = BigInt(mod);
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return Number(result);
}

type Generated = Pick<Question, 'category' | 'question' | 'answer' | 'aliases'>;

export const GENERATORS: Record<string, (rand: Rand) => Generated> = {
  multiply(rand) {
    const a = int(rand, 1000, 9999);
    const b = int(rand, 1000, 9999);
    return { category: 'Arithmetic', question: `What is ${a} × ${b}?`, answer: String(a * b), aliases: [] };
  },
  weekday(rand) {
    const d = randomDate(rand, 1900, 2199);
    const day = WEEKDAYS[d.getUTCDay()];
    return {
      category: 'Calendar',
      question: `In the Gregorian calendar, what day of the week is ${fmtDate(d)}?`,
      answer: day,
      aliases: [day.slice(0, 3)],
    };
  },
  letterCount(rand) {
    const letters = [...'abcdefghk'];
    const s = Array.from({ length: 40 }, () => pick(rand, letters)).join('');
    const target = pick(rand, letters);
    const n = [...s].filter((c) => c === target).length;
    return {
      category: 'Counting',
      question: `How many times does the letter "${target}" appear in this string: ${s}`,
      answer: String(n),
      aliases: [],
    };
  },
  reverse(rand) {
    const s = Array.from({ length: 12 }, () => pick(rand, [...'bcdfghjklmnpqrstvwxz'])).join('');
    return {
      category: 'Strings',
      question: `Write this string backwards: ${s}`,
      answer: [...s].reverse().join(''),
      aliases: [],
    };
  },
  daysBetween(rand) {
    const a = randomDate(rand, 1950, 2049);
    const diff = int(rand, 30, 4000);
    const b = new Date(a.getTime() + diff * DAY_MS);
    return {
      category: 'Calendar',
      question: `How many days are there from ${fmtDate(a)} to ${fmtDate(b)}? (Give the difference in days.)`,
      answer: String(diff),
      aliases: [],
    };
  },
  baseConvert(rand) {
    const n = int(rand, 1000, 99_999);
    const base = pick(rand, [3, 5, 6, 7, 9]);
    return {
      category: 'Number bases',
      question: `Write the decimal number ${n} in base ${base}.`,
      answer: n.toString(base),
      aliases: [],
    };
  },
  modPow(rand) {
    const m = pick(rand, [7, 11, 13, 17, 19, 23, 29, 31, 37]);
    const b = int(rand, 2, 40);
    const e = int(rand, 50, 500);
    return {
      category: 'Modular arithmetic',
      question: `What is the remainder when ${b} to the power ${e} is divided by ${m}?`,
      answer: String(modPow(b, e, m)),
      aliases: [],
    };
  },
  sortWords(rand) {
    const words = shuffle(WORDS, rand).slice(0, 8);
    const k = int(rand, 2, 7);
    const sorted = [...words].sort();
    return {
      category: 'Sorting',
      question: `Sort these words alphabetically: ${words.join(', ')}. Which word comes ${ordinal(k)}?`,
      answer: sorted[k - 1],
      aliases: [],
    };
  },
};

/** n fresh expert questions, cycling through the generator types so a race gets a variety. */
export function generateExpert(n: number, rand: Rand = Math.random): Question[] {
  const types = Object.keys(GENERATORS);
  let order: string[] = [];
  return Array.from({ length: n }, (_, i) => {
    if (!order.length) order = shuffle(types, rand);
    const g = GENERATORS[order.pop()!](rand);
    return { id: 100_000 + i, difficulty: 'expert', ...g };
  });
}
