import type { Pricing } from './api';

/**
 * Prices from the models.dev catalog (https://models.dev/api.json, CORS-enabled).
 *
 * Only some providers publish prices in their own `/models` listing, and each does it in its
 * own shape; models.dev normalizes them to USD per 1M tokens for many providers at once, so it
 * fills the gaps. A provider's own live listing still wins when it has a price (see `main.ts`),
 * because that is what its billing uses; models.dev is the fallback.
 *
 * The app starts with the snapshot shipped with it (`pricing.snapshot.json`, refreshed with
 * `npm run pricing:update`). The "Refresh prices" button downloads the current catalog for the
 * rest of the session; nothing is fetched automatically and nothing is stored in the browser.
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
  meta: 'meta',
  cerebras: 'cerebras',
  huggingface: 'huggingface',
  gmi: 'gmicloud',
  baseten: 'baseten',
};

/** USD per 1M tokens: [input, output, cache read?]. */
export type MillionPrice = [number, number, number?];
/** models.dev provider id → model id → per-1M price. */
export type PriceCatalog = Record<string, Record<string, MillionPrice>>;

const num = (x: unknown): number | undefined => {
  const v = typeof x === 'number' || typeof x === 'string' ? Number(x) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : undefined;
};

/** Keep only our providers and only their prices, so the snapshot stays small. */
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
export function lookupPrice(catalog: PriceCatalog, providerId: string, modelId: string): Pricing | undefined {
  const mdId = MODELS_DEV_PROVIDERS[providerId];
  const row = mdId ? catalog[mdId]?.[modelId] : undefined;
  if (!row) return undefined;
  return {
    inPerTok: row[0] / 1e6,
    outPerTok: row[1] / 1e6,
    ...(row[2] == null ? {} : { cacheReadPerTok: row[2] / 1e6 }),
    source: 'models.dev',
  };
}

const CATALOG_URL = 'https://models.dev/api.json';

/** Download the current catalog (the "Refresh prices" button). Null when it fails or has no prices. */
export async function fetchCatalog(): Promise<PriceCatalog | null> {
  try {
    const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const catalog = parseCatalog(await res.json());
    return Object.keys(catalog).length ? catalog : null;
  } catch {
    return null; // prices are optional: the caller keeps what it has
  }
}
