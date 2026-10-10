import type { Pricing } from './api';

/**
 * Prices from the models.dev catalog (https://models.dev/api.json, CORS-enabled).
 *
 * Only some providers publish prices in their own `/models` listing, and each does it in its
 * own shape; models.dev normalizes them to USD per 1M tokens for many providers at once, so it
 * fills the gaps. A provider's own live listing still wins when it has a price (see `main.ts`),
 * because that is what its billing uses; models.dev is the fallback.
 *
 * Prices come from the snapshot shipped with the app (`pricing.snapshot.json`). A "Refresh prices"
 * button fetches the full models.dev catalog on demand and caches it in the browser for 72 hours;
 * there is no automatic request. Refresh the committed snapshot with `npm run pricing:update`.
 */

/** Our provider ids → models.dev provider ids. Providers models.dev doesn't carry are absent. */
export const MODELS_DEV_PROVIDERS: Record<string, string> = {
  nebius: 'nebius',
  openai: 'openai',
  anthropic: 'anthropic',
  gemini: 'google',
  together: 'togetherai',
  groq: 'groq',
  fireworks: 'fireworks-ai',
  openrouter: 'openrouter',
  deepinfra: 'deepinfra',
  mistral: 'mistral',
  cerebras: 'cerebras',
  huggingface: 'huggingface',
  gmi: 'gmicloud',
  baseten: 'baseten',
};

const CATALOG_URL = 'https://models.dev/api.json';
const CACHE_KEY = 'llm-derby.pricing';
/** Prices move slowly; a three-day-old catalog is fine and saves the download. */
const CACHE_TTL_MS = 72 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

/**
 * In-code pricing switches (there is no UI for these). Kept in an object so they are easy to
 * find and to toggle in tests.
 */
export const PRICING = {
  /**
   * Whether the "Refresh prices" button may fetch the models.dev catalog. Set to `false` to
   * disable the refresh entirely: prices then come only from the snapshot bundled with the app
   * (`pricing.snapshot.json`) and any catalog already cached in the browser. Refresh the snapshot
   * with `npm run pricing:update`.
   */
  fetchLive: true,
};

/** USD per 1M tokens: [input, output, cache read?]. */
export type MillionPrice = [number, number, number?];
/** models.dev provider id → model id → per-1M price. Kept small so it fits in localStorage. */
export type PriceCatalog = Record<string, Record<string, MillionPrice>>;

const num = (x: unknown): number | undefined => {
  const v = typeof x === 'number' || typeof x === 'string' ? Number(x) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : undefined;
};

/** Keep only our providers and only their prices, so the cached catalog stays small. */
export function parseCatalog(raw: unknown): PriceCatalog {
  const byProvider = (raw ?? {}) as Record<string, { models?: Record<string, unknown> } | undefined>;
  const out: PriceCatalog = {};
  for (const mdId of new Set(Object.values(MODELS_DEV_PROVIDERS))) {
    const models = byProvider[mdId]?.models;
    if (!models) continue;
    const entries: Record<string, MillionPrice> = {};
    for (const [id, model] of Object.entries(models)) {
      const cost = (model as { cost?: Record<string, unknown> } | null)?.cost;
      const input = num(cost?.input);
      const output = num(cost?.output);
      // Image / audio / unknown models have null or missing token prices: skip them.
      if (input == null || output == null) continue;
      const cacheRead = num(cost?.cache_read);
      entries[id] = cacheRead == null ? [input, output] : [input, output, cacheRead];
    }
    if (Object.keys(entries).length) out[mdId] = entries;
  }
  return out;
}

/** Price for one model in per-token units, or undefined when models.dev has no entry for it. */
export function lookupPrice(catalog: PriceCatalog | null, providerId: string, modelId: string): Pricing | undefined {
  const mdId = MODELS_DEV_PROVIDERS[providerId];
  const row = mdId ? catalog?.[mdId]?.[modelId] : undefined;
  if (!row) return undefined;
  return {
    inPerTok: row[0] / 1e6,
    outPerTok: row[1] / 1e6,
    ...(row[2] == null ? {} : { cacheReadPerTok: row[2] / 1e6 }),
    source: 'models.dev',
  };
}

function readCache(now: number): PriceCatalog | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { at?: unknown; catalog?: PriceCatalog };
    if (typeof saved.at !== 'number' || now - saved.at > CACHE_TTL_MS) return null;
    return saved.catalog && typeof saved.catalog === 'object' ? saved.catalog : null;
  } catch {
    return null; // no cache, or unreadable: fall through to a fetch
  }
}

function writeCache(catalog: PriceCatalog, now: number) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: now, catalog }));
  } catch {
    /* storage full or unavailable: prices just won't be cached */
  }
}

let current: PriceCatalog | null = null;
let inflight: Promise<PriceCatalog | null> | null = null;

/**
 * The best catalog available right now, synchronously: a fresh copy from the browser cache,
 * otherwise `bundled` (the snapshot shipped with the app). Never null, so prices work offline.
 */
export function catalogNow(bundled: PriceCatalog, now = Date.now()): PriceCatalog {
  current ??= readCache(now) ?? bundled;
  return current;
}

/**
 * Fetch the models.dev catalog now (the "Refresh prices" button) and cache it for 72 hours.
 * Resolves to the fresh catalog, or null when it is turned off (`PRICING.fetchLive`) or the
 * fetch failed. There is no automatic refresh: this only runs when the button is clicked.
 */
export function refreshCatalog(now = Date.now()): Promise<PriceCatalog | null> {
  if (!PRICING.fetchLive) return Promise.resolve(null); // turned off in code: never call models.dev
  inflight ??= fetchLive(now).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function fetchLive(now: number): Promise<PriceCatalog | null> {
  try {
    const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const catalog = parseCatalog(await res.json());
    if (!Object.keys(catalog).length) return null;
    current = catalog;
    writeCache(catalog, now);
    return catalog;
  } catch {
    return null; // pricing is optional: a failure just keeps the bundled snapshot
  }
}
