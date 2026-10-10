// Refresh the bundled model-price snapshot from the models.dev catalog.
//
//   npm run pricing:update
//
// Writes src/pricing.snapshot.json: only the providers the app supports, and only their prices
// (USD per 1M tokens), so the committed file stays small and its diffs are readable. The app
// uses this snapshot instantly and offline, then refreshes from models.dev while it runs.
import { writeFileSync } from 'node:fs';
import { MODELS_DEV_PROVIDERS, parseCatalog } from '../src/pricing.ts';

const CATALOG_URL = 'https://models.dev/api.json';

const res = await fetch(CATALOG_URL);
if (!res.ok) {
  console.error(`models.dev responded HTTP ${res.status}; snapshot left unchanged`);
  process.exit(1);
}
const catalog = parseCatalog(await res.json());
const providers = Object.keys(catalog).length;
const models = Object.values(catalog).reduce((n, per) => n + Object.keys(per).length, 0);
if (!providers || !models) {
  console.error('models.dev returned no usable prices; snapshot left unchanged');
  process.exit(1);
}

// Sorted keys so a refresh produces a small, reviewable diff.
const sorted = Object.fromEntries(
  Object.entries(catalog)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([provider, per]) => [provider, Object.fromEntries(Object.entries(per).sort(([a], [b]) => a.localeCompare(b)))]),
);

const out = new URL('../src/pricing.snapshot.json', import.meta.url);
writeFileSync(out, `${JSON.stringify(sorted)}\n`);
console.log(`Wrote src/pricing.snapshot.json: ${providers} providers, ${models} models (of ${Object.keys(MODELS_DEV_PROVIDERS).length} supported providers)`);
