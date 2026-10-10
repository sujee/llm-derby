import { describe, expect, it, vi } from 'vitest';
import { lookupPrice, parseCatalog } from './pricing';

/** A trimmed models.dev api.json: one provider we map to, one we don't. */
const CATALOG = {
  google: {
    models: {
      'gemini-3-flash': { cost: { input: 0.75, output: 3.75, cache_read: 0.19 } },
      'gemini-free': { cost: { input: 0, output: 0 } },
      'gemini-image': { cost: { input: null, output: null } },
      'gemini-no-cost': {},
    },
  },
  togetherai: { models: { 'meta-llama/Llama-3.3-70B': { cost: { input: 1.04, output: 1.04 } } } },
  unknownthirdparty: { models: { 'some/model': { cost: { input: 1, output: 2 } } } },
};

describe('parseCatalog', () => {
  it('keeps only mapped providers and models with token prices', () => {
    const catalog = parseCatalog(CATALOG);
    expect(Object.keys(catalog).sort()).toEqual(['google', 'togetherai']);
    expect(catalog.google['gemini-3-flash']).toEqual([0.75, 3.75, 0.19]);
    expect(catalog.google['gemini-free']).toEqual([0, 0]);
    expect(catalog.google['gemini-image']).toBeUndefined(); // null cost
    expect(catalog.google['gemini-no-cost']).toBeUndefined(); // missing cost
  });

  it('survives a malformed catalog', () => {
    expect(parseCatalog(null)).toEqual({});
    expect(parseCatalog('not an object')).toEqual({});
    expect(parseCatalog({ openai: { models: null } })).toEqual({});
  });
});

describe('lookupPrice', () => {
  const catalog = parseCatalog(CATALOG);

  it('maps our provider ids to models.dev ones and converts to per-token', () => {
    expect(lookupPrice(catalog, 'gemini', 'gemini-3-flash')).toEqual({
      inPerTok: 0.75 / 1e6,
      outPerTok: 3.75 / 1e6,
      cacheReadPerTok: 0.19 / 1e6,
      source: 'models.dev',
    });
    expect(lookupPrice(catalog, 'together', 'meta-llama/Llama-3.3-70B')).toEqual({
      inPerTok: 1.04 / 1e6,
      outPerTok: 1.04 / 1e6,
      source: 'models.dev',
    });
  });

  it('has nothing for providers or models models.dev does not cover', () => {
    expect(lookupPrice(catalog, 'custom', 'anything')).toBeUndefined();
    expect(lookupPrice(catalog, 'sim', 'sim/steady')).toBeUndefined();
    expect(lookupPrice(catalog, 'gemini', 'not-a-model')).toBeUndefined();
    expect(lookupPrice(null, 'gemini', 'gemini-3-flash')).toBeUndefined();
  });
});

describe('catalogNow', () => {
  const stubStorage = (raw: string | null) =>
    vi.stubGlobal('localStorage', { getItem: () => raw, setItem: () => {}, removeItem: () => {} });

  it('falls back to the bundled snapshot when no live copy is cached', async () => {
    stubStorage(null);
    vi.resetModules();
    const { catalogNow } = await import('./pricing');
    const bundled = { google: { 'gemini-x': [1, 2] as [number, number] } };
    expect(catalogNow(bundled, 0)).toBe(bundled);
    vi.unstubAllGlobals();
  });

  it('uses a cached catalog while it is younger than 72h', async () => {
    const cached = { google: { x: [9, 9] as [number, number] } };
    stubStorage(JSON.stringify({ at: 1_000_000, catalog: cached }));
    vi.resetModules();
    const { catalogNow } = await import('./pricing');
    expect(catalogNow({ google: { y: [1, 1] as [number, number] } }, 1_000_000 + 60_000)).toEqual(cached);
    vi.unstubAllGlobals();
  });

  it('falls back to the snapshot once the cache is older than 72h', async () => {
    stubStorage(JSON.stringify({ at: 0, catalog: { google: { x: [9, 9] } } }));
    vi.resetModules();
    const { catalogNow } = await import('./pricing');
    const bundled = { google: { y: [1, 1] as [number, number] } };
    const day = 24 * 60 * 60 * 1000;
    expect(catalogNow(bundled, 73 * day)).toBe(bundled);
    vi.unstubAllGlobals();
  });
});

describe('refreshCatalog (the Refresh prices button)', () => {
  const stubStorage = (raw: string | null) =>
    vi.stubGlobal('localStorage', { getItem: () => raw, setItem: () => {}, removeItem: () => {} });

  it('downloads and trims the catalog on demand', async () => {
    stubStorage(null);
    const raw = { google: { models: { 'gemini-x': { cost: { input: 1, output: 2, cache_read: 0.5 } } } } };
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => raw }));
    vi.stubGlobal('fetch', fetchSpy);
    vi.resetModules();
    const { refreshCatalog } = await import('./pricing');
    expect(await refreshCatalog(0)).toEqual({ google: { 'gemini-x': [1, 2, 0.5] } });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('fetches even when a fresh cache exists (the button forces a refresh)', async () => {
    stubStorage(JSON.stringify({ at: 1000, catalog: { google: { x: [1, 2] } } }));
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ google: { models: {} } }) }));
    vi.stubGlobal('fetch', fetchSpy);
    vi.resetModules();
    const { refreshCatalog } = await import('./pricing');
    await refreshCatalog(2000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('never calls models.dev when live pricing is turned off in code', async () => {
    stubStorage(null);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.resetModules();
    const mod = await import('./pricing');
    mod.PRICING.fetchLive = false;
    expect(await mod.refreshCatalog(0)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
