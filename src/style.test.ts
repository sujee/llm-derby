import { describe, expect, it } from 'vitest';
import css from './style.css?raw';

/** Declarations of the first rule whose selector matches exactly (whitespace-normalized). */
function declarations(selector: string): Record<string, string> {
  const target = selector.replace(/\s+/g, ' ').trim();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].replace(/\s+/g, ' ').trim() !== target) continue;
    return Object.fromEntries(
      m[2]
        .split(';')
        .map((d) => d.split(':'))
        .filter((p) => p.length === 2)
        .map(([k, v]) => [k.trim(), v.trim()]),
    );
  }
  throw new Error(`CSS rule not found: ${selector}`);
}

describe('question board width guards', () => {
  // Regression: the board sets `overflow-wrap: anywhere` on cells, which let a two-digit
  // question number (e.g. 10) break onto two lines in the narrow "#" column, and let the
  // "id: 12" pill split. Both must stay on one line.
  it('keeps the question number on one line', () => {
    expect(declarations('.grid .qnum')['white-space']).toBe('nowrap');
  });

  it('keeps the bank question id pill on one line', () => {
    expect(declarations('.qid')['white-space']).toBe('nowrap');
  });
});
