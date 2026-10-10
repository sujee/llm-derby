#!/usr/bin/env bash
# Refresh the model-price snapshot (src/pricing.snapshot.json) from models.dev.
#
#   ./scripts/update-pricing.sh
#
# Downloads the full models.dev catalog, trims it to the providers the app supports, and
# rewrites the committed snapshot. Needs network access, but no API keys.
# Same as: npm run pricing:update
set -euo pipefail

# Repo root is one level up from this script (it lives in scripts/).
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

exec node scripts/update-pricing.mts "$@"
