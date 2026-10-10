import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalog, lookupPrice, parseCatalog } from './pricing';

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
  });
});

describe('fetchCatalog (the Refresh prices button)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('downloads and trims the catalog', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => CATALOG })));
    expect(await fetchCatalog()).toEqual(parseCatalog(CATALOG));
  });

  it('gives null when the request fails or the catalog has no prices', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(await fetchCatalog()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ google: { models: {} } }) })));
    expect(await fetchCatalog()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    expect(await fetchCatalog()).toBeNull();
  });
});
