import { describe, expect, it } from 'vitest';
import { SHARE_PREFIX, decodeSetup, encodeSetup, type SharedSetup } from './sharelink';

const LIM = {
  isProvider: (id: string) => ['nebius', 'openai', 'custom', 'sim'].includes(id),
  hasCustomUrl: (id: string) => id === 'custom',
  minDistance: 3,
  maxDistance: 60,
  minTimeLimit: 3,
  maxTimeLimit: 300,
};

const setup: SharedSetup = {
  horses: [
    { providerId: 'nebius', model: 'deepseek-ai/DeepSeek-V4.1-Flash' },
    { providerId: 'openai', model: 'gpt-5-mini' },
    { providerId: 'custom', model: 'my-model', baseUrl: 'http://localhost:8000/v1' },
    { providerId: 'sim', model: 'sim/steady' },
  ],
  distance: 15,
  levels: ['medium', 'hard'],
  rising: true,
  timeLimitSec: 45,
};

const link = (wire: unknown) => SHARE_PREFIX + btoa(JSON.stringify(wire)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('setup links', () => {
  it('round-trips a setup', () => {
    expect(decodeSetup(SHARE_PREFIX + encodeSetup(setup), LIM)).toEqual(setup);
  });
  it('round-trips no time limit and non-ASCII model names', () => {
    const s = { ...setup, timeLimitSec: null, horses: setup.horses.map((x) => ({ ...x, model: `${x.model}-ü` })) };
    expect(decodeSetup(SHARE_PREFIX + encodeSetup(s), LIM)).toEqual(s);
  });
  it('carries no keys: only providers, models, URLs and options', () => {
    const b64 = encodeSetup(setup).replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    expect(Object.keys(JSON.parse(json)).sort()).toEqual(['d', 'h', 'l', 'r', 't', 'v']);
  });
  it('ignores links it cannot read', () => {
    expect(decodeSetup('#other', LIM)).toBeNull();
    expect(decodeSetup(SHARE_PREFIX + '%%%', LIM)).toBeNull();
    expect(decodeSetup(link({ v: 2, h: [] }), LIM)).toBeNull();
    expect(decodeSetup(link({ v: 1, h: [['nebius', 'a'], ['nebius', 'b']] }), LIM)).toBeNull(); // 2 horses
    expect(decodeSetup(link({ v: 1, h: [['evil', 'a'], ['nebius', 'b'], ['nebius', 'c']] }), LIM)).toBeNull();
  });
  it('clamps and cleans untrusted values', () => {
    const s = decodeSetup(
      link({
        v: 1,
        h: [['nebius', 'a\u0000b'.padEnd(500, 'x')], ['custom', 'm', 'javascript:alert(1)'], ['openai', 'gpt', 'https://x.example/v1']],
        d: 9999,
        l: ['hard', 'bogus'],
        r: 'yes',
        t: 1,
      }),
      LIM,
    )!;
    expect(s.horses[0].model).toHaveLength(200);
    expect(s.horses[0].model.startsWith('ab')).toBe(true);
    expect(s.horses[1].baseUrl).toBeUndefined(); // not http(s)
    expect(s.horses[2].baseUrl).toBeUndefined(); // only Custom horses take a URL
    expect(s.distance).toBe(60);
    expect(s.levels).toEqual(['hard']);
    expect(s.rising).toBe(false);
    expect(s.timeLimitSec).toBe(3);
  });
});
