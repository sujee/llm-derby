import type { Pricing } from './api';
import manualPrices from './pricing.manual.json' with { type: 'json' };

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
 *
 * A few models are missing from both the provider listing and models.dev (e.g. Meta's Muse Wonder);
 * those are entered by hand in `pricing.manual.json`, from the provider's own pricing page.
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

/**
 * Prices for models that neither the provider's live listing nor models.dev carries, taken by hand
 * from the provider's own pricing page. Our provider id → model id → per-1M price.
 * Meta Model API (https://dev.meta.ai/docs/pricing-rate-limits, 2026-10-12): models.dev already
 * prices the Muse Spark lines, so only Muse Wonder's gap is filled here. Muse Wonder is Standard
 * mode only (no Contributor mode): $4 in / $20 out / $0.20 cached. `npm run pricing:update` does not
 * touch this file.
 */
const MANUAL_PRICES = manualPrices as unknown as PriceCatalog;

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

/** Price for one model in per-token units, or undefined when it isn't known from the catalog or the hand-entered map. */
export function lookupPrice(catalog: PriceCatalog, providerId: string, modelId: string): Pricing | undefined {
  const mdId = MODELS_DEV_PROVIDERS[providerId];
  const fromCatalog = mdId ? catalog[mdId]?.[modelId] : undefined;
  const row = fromCatalog ?? MANUAL_PRICES[providerId]?.[modelId];
  if (!row) return undefined;
  return {
    inPerTok: row[0] / 1e6,
    outPerTok: row[1] / 1e6,
    ...(row[2] == null ? {} : { cacheReadPerTok: row[2] / 1e6 }),
    source: fromCatalog ? 'models.dev' : 'manual',
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
