// Raise the app version by one before each publish (push to main): npm run version:bump
// version.json holds a whole number (v1, v2, v3, …). package.json and package-lock.json
// need semver, so they're kept in step as N.0.0.
import { readFileSync, writeFileSync } from 'node:fs';

const info = JSON.parse(readFileSync('version.json', 'utf8'));
if (!Number.isInteger(info.version) || info.version < 1) {
  console.error(`version.json holds ${JSON.stringify(info.version)}, expected a whole number like 3`);
  process.exit(1);
}
const next = info.version + 1;
writeFileSync('version.json', `${JSON.stringify({ ...info, version: next }, null, 2)}\n`);
for (const file of ['package.json', 'package-lock.json']) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  json.version = `${next}.0.0`;
  if (json.packages?.['']) json.packages[''].version = `${next}.0.0`;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}
console.log(`v${info.version} → v${next}`);
