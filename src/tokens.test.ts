import { describe, expect, it } from 'vitest';
import { tokenUsage } from './api';
import { fmtTok } from './dom';

describe('tokenUsage', () => {
  it('uses reported usage, including reasoning tokens', () => {
    const u = { prompt_tokens: 80, completion_tokens: 211, completion_tokens_details: { reasoning_tokens: 196 } };
    expect(tokenUsage(u, 'prompt', 'reply', 'thinking')).toEqual({ in: 80, out: 211, reasoning: 196, estimated: false });
  });
  it('reads cached tokens from the standard field or the DeepSeek-style one', () => {
    expect(tokenUsage({ prompt_tokens: 117, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 64 } }, '', '', '').cached).toBe(64);
    expect(tokenUsage({ prompt_tokens: 60, completion_tokens: 71, prompt_tokens_details: null, prompt_cache_hit_tokens: 12 }, '', '', '').cached).toBe(12);
    expect(tokenUsage({ prompt_tokens: 60, completion_tokens: 71 }, '', '', '').cached).toBeUndefined();
  });
  it('estimates from text (~4 chars per token) when no usage is reported', () => {
    expect(tokenUsage(undefined, 'x'.repeat(40), 'y'.repeat(8), 'z'.repeat(20))).toEqual({ in: 10, out: 7, reasoning: 5, estimated: true });
  });
  it('has no counts when nothing arrived', () => {
    expect(tokenUsage(undefined, 'prompt', '', '')).toEqual({ estimated: true });
  });
});

describe('fmtTok', () => {
  it('formats counts compactly and marks estimates', () => {
    expect(fmtTok(950)).toBe('950');
    expect(fmtTok(1234)).toBe('1.2k');
    expect(fmtTok(56_789)).toBe('57k');
    expect(fmtTok(2_500_000)).toBe('2.5M');
    expect(fmtTok(211, true)).toBe('~211');
    expect(fmtTok(undefined)).toBe('–');
  });
});

import { answerCost, parsePricing } from './api';

describe('parsePricing', () => {
  it('reads OpenRouter / GMI per-token prices, including cached input', () => {
    expect(parsePricing({ id: 'x', pricing: { prompt: '0.00000015', completion: '0.0000005', input_cache_read: '0.00000003' } })).toEqual({
      inPerTok: 0.00000015,
      outPerTok: 0.0000005,
      cacheReadPerTok: 0.00000003,
    });
  });
  it('reads Nebius Token Factory per-token prices from the verbose listing', () => {
    // Documented verbose=true example, where "0.00000003" is $0.03 per 1M input tokens.
    const model = { id: 'x', pricing: { prompt: '0.00000003', completion: '0.00000009', image: '0', request: '0' } };
    expect(parsePricing(model)).toEqual({ inPerTok: 0.00000003, outPerTok: 0.00000009, cacheReadPerTok: undefined });
  });
  it('reads Together per-million prices', () => {
    expect(parsePricing({ id: 'x', pricing: { input: 0.88, output: 0.88 } })).toEqual({ inPerTok: 0.88e-6, outPerTok: 0.88e-6, cacheReadPerTok: undefined });
  });
  it('reads Together cached input (snake_case and camelCase) as per-million', () => {
    expect(parsePricing({ id: 'x', pricing: { input: 0.3, output: 0.3, cached_input: 0.2 } })).toEqual({
      inPerTok: 0.3 / 1e6,
      outPerTok: 0.3 / 1e6,
      cacheReadPerTok: 0.2 / 1e6,
    });
    expect(parsePricing({ id: 'x', pricing: { input: 1.32, output: 3.96, cachedInput: 0.13 } })).toEqual({
      inPerTok: 1.32 / 1e6,
      outPerTok: 3.96 / 1e6,
      cacheReadPerTok: 0.13 / 1e6,
    });
  });
  it('keeps a free model (0 prices) as a real zero cost', () => {
    expect(parsePricing({ id: 'x', pricing: { input: 0, output: 0 } })).toEqual({ inPerTok: 0, outPerTok: 0, cacheReadPerTok: undefined });
  });
  it('ignores missing or "varies" (-1) prices', () => {
    expect(parsePricing({ id: 'x' })).toBeUndefined();
    expect(parsePricing({ id: 'x', pricing: { prompt: '-1', completion: '-1' } })).toBeUndefined();
    expect(parsePricing({ id: 'x', pricing: { prompt: '0.1' } })).toBeUndefined(); // completion missing
  });
});

describe('answerCost', () => {
  const price = { inPerTok: 1e-6, outPerTok: 4e-6, cacheReadPerTok: 0.1e-6 };
  it('charges cached input at the cache rate', () => {
    // 1000 in (400 cached) and 500 out: 600 * 1e-6 + 400 * 0.1e-6 + 500 * 4e-6
    expect(answerCost({ in: 1000, cached: 400, out: 500, estimated: false }, price)).toBeCloseTo(0.00264, 8);
  });
  it('still charges cached input when the prompt total was not reported', () => {
    // A gateway that sent only cached tokens: 400 cached at the cache rate, 0 non-cached.
    expect(answerCost({ cached: 400, out: 0, estimated: false }, price)).toBeCloseTo(0.00004, 8);
  });
  it('is unknown without a price or token counts', () => {
    expect(answerCost({ in: 10, out: 5, estimated: false }, undefined)).toBeUndefined();
    expect(answerCost({ estimated: true }, price)).toBeUndefined();
  });
});
