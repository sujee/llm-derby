import { describe, expect, it } from 'vitest';
import { GENERATORS, generateExpert, modPow, type Rand } from './generated';
import { extractFinalAnswer, isCorrect } from './grading';

/** Small seeded PRNG (mulberry32) so failures are reproducible. */
function seeded(seed: number): Rand {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parseDate = (s: string) => {
  const [d, m, y] = s.split(' ');
  return { y: Number(y), m: MONTHS.indexOf(m) + 1, d: Number(d) };
};

/** Zeller's congruence, independent of JS Date. 0 = Saturday. */
function zeller(y: number, m: number, d: number) {
  if (m < 3) {
    m += 12;
    y -= 1;
  }
  const k = y % 100;
  const j = Math.floor(y / 100);
  return (d + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7;
}

/** Days since a fixed epoch, computed without JS Date. */
function dayNumber({ y, m, d }: { y: number; m: number; d: number }) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400);
}

const N = 300;

describe('expert generators produce correct answer keys', () => {
  it('multiply', () => {
    const rand = seeded(1);
    for (let i = 0; i < N; i++) {
      const g = GENERATORS.multiply(rand);
      const [, a, b] = g.question.match(/(\d+) × (\d+)/)!;
      expect(BigInt(g.answer)).toBe(BigInt(a) * BigInt(b));
    }
  });
  it('weekday (checked with Zeller’s congruence)', () => {
    const rand = seeded(2);
    const names = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    for (let i = 0; i < N; i++) {
      const g = GENERATORS.weekday(rand);
      const { y, m, d } = parseDate(g.question.match(/is (\d+ \w+ \d+)\?/)![1]);
      expect(g.answer).toBe(names[zeller(y, m, d)]);
    }
  });
  it('known dates', () => {
    expect(names(1, 'January', 2000)).toBe('Saturday');
    expect(names(4, 'July', 1976)).toBe('Sunday');
    function names(d: number, m: string, y: number) {
      return ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][zeller(y, MONTHS.indexOf(m) + 1, d)];
    }
  });
  it('days between (checked with Julian day numbers)', () => {
    const rand = seeded(3);
    for (let i = 0; i < N; i++) {
      const g = GENERATORS.daysBetween(rand);
      const [, a, b] = g.question.match(/from (\d+ \w+ \d+) to (\d+ \w+ \d+)\?/)!;
      expect(Number(g.answer)).toBe(dayNumber(parseDate(b)) - dayNumber(parseDate(a)));
    }
  });
  it('letter count', () => {
    const rand = seeded(4);
    for (let i = 0; i < N; i++) {
      const g = GENERATORS.letterCount(rand);
      const [, letter, s] = g.question.match(/letter "(\w)" appear in this string: (\w+)/)!;
      expect(Number(g.answer)).toBe(s.split(letter).length - 1);
    }
  });
  it('reverse', () => {
    const rand = seeded(5);
    for (let i = 0; i < N; i++) {
      const g = GENERATORS.reverse(rand);
      const s = g.question.split(': ')[1];
      expect(g.answer.split('').reverse().join('')).toBe(s);
    }
  });
  it('base conversion', () => {
    const rand = seeded(6);
    for (let i = 0; i < N; i++) {
      const g = GENERATORS.baseConvert(rand);
      const [, n, base] = g.question.match(/number (\d+) in base (\d+)/)!;
      expect(parseInt(g.answer, Number(base))).toBe(Number(n));
      expect(isCorrect(g.answer.toUpperCase(), [g.answer, ...g.aliases])).toBe(true); // "1A3F" = "1a3f"
    }
  });
  it('modular power (checked with plain BigInt power)', () => {
    const rand = seeded(7);
    for (let i = 0; i < N; i++) {
      const g = GENERATORS.modPow(rand);
      const [b, e, m] = g.question.match(/when (\d+) to the power (\d+) is divided by (\d+)/)!.slice(1).map(BigInt);
      expect(BigInt(g.answer)).toBe(b ** e % m);
    }
    expect(modPow(2, 100, 7)).toBe(2);
  });
  it('word sort', () => {
    const rand = seeded(8);
    for (let i = 0; i < N; i++) {
      const g = GENERATORS.sortWords(rand);
      const [, list, k] = g.question.match(/alphabetically: (.+)\. Which word comes (\d+)/)!;
      expect(g.answer).toBe(list.split(', ').sort()[Number(k) - 1]);
    }
  });
});

describe('new expert generators', () => {
  it('digit sum of a power (checked digit by digit with BigInt)', () => {
    const rand = seeded(11);
    for (let i = 0; i < N; i++) {
      const g = GENERATORS.digitSum(rand);
      const [b, e] = g.question.match(/digits of (\d+) to the power (\d+)/)!.slice(1).map(BigInt);
      let x = b ** e;
      let sum = 0n;
      while (x > 0n) {
        sum += x % 10n;
        x /= 10n;
      }
      expect(BigInt(g.answer)).toBe(sum);
    }
    expect(GENERATORS.digitSum(() => 0).answer).toBe(String([...String(3n ** 30n)].reduce((s, c) => s + Number(c), 0)));
  });
  it('Collatz steps (checked by replaying the sequence backwards)', () => {
    const rand = seeded(12);
    for (let i = 0; i < N; i++) {
      const g = GENERATORS.collatz(rand);
      let n = Number(g.question.match(/Start at (\d+)/)![1]);
      for (let s = 0; s < Number(g.answer); s++) {
        expect(n).not.toBe(1); // reaches 1 only at the end
        n = n % 2 ? 3 * n + 1 : n / 2;
      }
      expect(n).toBe(1);
    }
    // Known value: 27 takes 111 steps.
    let n = 27;
    let steps = 0;
    while (n !== 1) {
      n = n % 2 ? 3 * n + 1 : n / 2;
      steps++;
    }
    expect(steps).toBe(111);
  });
  it('k-th prime after N (checked with a sieve)', () => {
    const sieve = new Uint8Array(110_000).fill(1);
    sieve[0] = sieve[1] = 0;
    for (let i = 2; i * i < sieve.length; i++) if (sieve[i]) for (let j = i * i; j < sieve.length; j += i) sieve[j] = 0;
    const rand = seeded(13);
    for (let i = 0; i < N; i++) {
      const g = GENERATORS.primeAfter(rand);
      const [, k, start] = g.question.match(/the (\d+)\w\w prime number greater than (\d+)/)!;
      let n = Number(start);
      for (let found = 0; found < Number(k); ) if (sieve[++n]) found++;
      expect(Number(g.answer)).toBe(n);
    }
  });
});

describe('generateExpert', () => {
  it('uses every generator type and grades its own answers as correct', () => {
    const qs = generateExpert(400, seeded(9));
    expect(new Set(qs.map((q) => q.category)).size).toBeGreaterThanOrEqual(9);
    for (const q of qs) {
      expect(isCorrect(extractFinalAnswer(`Working…\nANSWER: ${q.answer}`), [q.answer, ...q.aliases]), q.question).toBe(true);
    }
  });
  it('does not accept near misses', () => {
    const rand = seeded(10);
    for (let i = 0; i < 100; i++) {
      const g = GENERATORS.multiply(rand);
      expect(isCorrect(String(Number(g.answer) + 1), [g.answer])).toBe(false);
      const r = GENERATORS.reverse(rand);
      expect(isCorrect(r.answer.slice(1), [r.answer])).toBe(false);
    }
  });
});
