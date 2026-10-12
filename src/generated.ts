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
    const a = int(rand, 1_000_000_000, 9_999_999_999);
    const b = int(rand, 10_000_000, 99_999_999);
    return { category: 'Arithmetic', question: `What is ${a} × ${b}?`, answer: String(BigInt(a) * BigInt(b)), aliases: [] };
  },
  weekday(rand) {
    const d = randomDate(rand, 1600, 2399);
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
    const s = Array.from({ length: 200 }, () => pick(rand, letters)).join('');
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
    // Real words run together, not random letters: some providers' content filters block "reverse this random string" (see experiments/expert-difficulty).
    const s = shuffle(WORDS, rand).slice(0, 8).join('');
    return {
      category: 'Strings',
      question: `Write this string backwards: ${s}`,
      answer: [...s].reverse().join(''),
      aliases: [],
    };
  },
  daysBetween(rand) {
    const a = randomDate(rand, 1800, 2099);
    const diff = int(rand, 1000, 30_000);
    const b = new Date(a.getTime() + diff * DAY_MS);
    return {
      category: 'Calendar',
      question: `How many days are there from ${fmtDate(a)} to ${fmtDate(b)}? (Give the difference in days.)`,
      answer: String(diff),
      aliases: [],
    };
  },
  baseConvert(rand) {
    const n = int(rand, 100_000_000, 999_999_999_999);
    const base = pick(rand, [3, 5, 6, 7, 9, 11, 12, 13, 16]);
    const answer = n.toString(base);
    return {
      category: 'Number bases',
      question: `Write the decimal number ${n} in base ${base}.${base > 10 ? ' Use the letters a, b, … for digits above 9.' : ''} Give just the digits, without a base subscript.`,
      answer,
      aliases: base === 16 ? [`0x${answer}`] : [],
    };
  },
  modPow(rand) {
    const m = int(rand, 10_000, 999_999);
    const b = int(rand, 2, 99_999);
    const e = int(rand, 1_000_000, 999_999_999);
    return {
      category: 'Modular arithmetic',
      question: `What is the remainder when ${b} to the power ${e} is divided by ${m}?`,
      answer: String(modPow(b, e, m)),
      aliases: [],
    };
  },
  sortWords(rand) {
    const words = shuffle(WORDS, rand).slice(0, 40);
    const k = int(rand, 2, 39);
    const sorted = [...words].sort();
    return {
      category: 'Sorting',
      question: `Sort these words alphabetically: ${words.join(', ')}. Which word comes ${ordinal(k)}?`,
      answer: sorted[k - 1],
      aliases: [],
    };
  },
  digitSum(rand) {
    const b = int(rand, 3, 9);
    const e = int(rand, 300, 900);
    const sum = [...String(BigInt(b) ** BigInt(e))].reduce((s, c) => s + Number(c), 0);
    return {
      category: 'Arithmetic',
      question: `What is the sum of the digits of ${b} to the power ${e}?`,
      answer: String(sum),
      aliases: [],
    };
  },
  collatz(rand) {
    const start = int(rand, 10_000_000, 999_999_999);
    const steps = collatzSteps(start);
    return {
      category: 'Sequences',
      question: `Start at ${start}. If the number is even, halve it; if it is odd, multiply by 3 and add 1. How many steps does it take to reach 1?`,
      answer: String(steps),
      aliases: [],
    };
  },
  primeAfter(rand) {
    const start = int(rand, 10_000_000, 999_999_999);
    const k = int(rand, 3, 6);
    const n = nthPrimeAfter(start, k);
    return {
      category: 'Primes',
      question: `What is the ${ordinal(k)} prime number greater than ${start}?`,
      answer: String(n),
      aliases: [],
    };
  },

  // Chained questions: each step is easy, but one slip anywhere gives a wrong final answer.
  chainBase(rand) {
    const n = int(rand, 1_000_000, 99_999_999);
    const base = pick(rand, [3, 5, 6, 7, 9]);
    const reversed = [...n.toString(base)].reverse().join('');
    return {
      category: 'Multi-step',
      question: `Write the decimal number ${n} in base ${base}. Reverse the order of its digits, read the result as a base ${base} number, and give that value in decimal.`,
      answer: String(parseInt(reversed, base)),
      aliases: [],
    };
  },
  chainWeekday(rand) {
    const b = int(rand, 3, 9);
    const e = int(rand, 100, 300);
    const d = randomDate(rand, 1900, 2100);
    const n = digitSumOfPower(b, e);
    const day = WEEKDAYS[new Date(d.getTime() + n * DAY_MS).getUTCDay()];
    return {
      category: 'Multi-step',
      question: `Let N be the sum of the digits of ${b} to the power ${e}. In the Gregorian calendar, what day of the week is it N days after ${fmtDate(d)}?`,
      answer: day,
      aliases: [day.slice(0, 3)],
    };
  },
  chainProduct(rand) {
    const a = int(rand, 10_000_000, 99_999_999);
    const b = int(rand, 10_000_000, 99_999_999);
    const sum = [...String(BigInt(a) * BigInt(b))].reduce((t, c) => t + Number(c), 0);
    return {
      category: 'Multi-step',
      question: `Multiply ${a} by ${b}, then add up the digits of the product. What is the sum?`,
      answer: String(sum),
      aliases: [],
    };
  },
  chainCollatzPrime(rand) {
    const start = int(rand, 100_000, 99_999_999);
    const target = collatzSteps(start) * 100;
    return {
      category: 'Multi-step',
      question: `Start at ${start}. If the number is even, halve it; if it is odd, multiply by 3 and add 1. Let S be the number of steps to reach 1. What is the smallest prime number greater than S × 100?`,
      answer: String(nthPrimeAfter(target, 1)),
      aliases: [],
    };
  },
};

function collatzSteps(start: number): number {
  let n = start;
  let steps = 0;
  while (n !== 1) {
    n = n % 2 ? 3 * n + 1 : n / 2;
    steps++;
  }
  return steps;
}

function digitSumOfPower(b: number, e: number): number {
  return [...String(BigInt(b) ** BigInt(e))].reduce((t, c) => t + Number(c), 0);
}

function nthPrimeAfter(start: number, k: number): number {
  let n = start;
  for (let found = 0; found < k; ) if (isPrime(++n)) found++;
  return n;
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

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
