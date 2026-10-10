#!/usr/bin/env bash
# Wrapper around scripts/debug-question.mts.
#
#   ./scripts/debug-question.sh --id 42 --models model-a,model-b
#   ./scripts/debug-question.sh --question "Capital of France?" --answer Paris --models model-a,model-b
#   ./scripts/debug-question.sh --provider sim --id 1 --models sim/scholar
#
#   ./scripts/debug-question.sh --question 'What is the sum of the digits of 9 to the power 84?' --answer 360 --provider nebius  --models nvidia/Nemotron-3_5-Lightning
#
# Loads API keys from .env into the environment (without printing them) so the Node
# script can read them, then forwards every argument through unchanged. .env is
# git-ignored; if it is missing the wrapper still runs (the sim provider needs no key).
set -euo pipefail

# Repo root is one level up from this script (it lives in scripts/).
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

exec node scripts/debug-question.mts "$@"
