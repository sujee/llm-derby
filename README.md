# LLM Derby 🏇

A carnival-style horse race in which 3–4 language models answer the same trivia questions.
Each correct answer moves a horse one step; the first to reach the winning distance wins.

Runs entirely in the browser (no backend) and deploys to GitHub Pages.
See [`spec-v1.md`](spec-v1.md) for the full spec.

## ▶ Play now

[![Play LLM Derby](https://img.shields.io/badge/%F0%9F%8F%87_Play_now-sujee.github.io%2Fllm--derby-d6283b?style=for-the-badge)](https://sujee.github.io/llm-derby/)

**[sujee.github.io/llm-derby](https://sujee.github.io/llm-derby/)**: no install needed. Bring an API key from any supported provider, or try it right away in simulator mode.

🧪 **Simulator mode: no API keys needed.** Pick **Simulated (no API calls)** as the provider for each horse, and the race runs with simulated models of different speed and accuracy, entirely in your browser.

📖 Curious what the models get asked? [See all 266 questions and answers](src/questions.json).

## 🎬 Watch a race

| Qwen vs astra vs Sonnet (best of 3) | Token Factory: 4 open models |
| --- | --- |
| [![Watch: Qwen3.8-27B vs gpt-6-astra vs claude-sonnet-5-5](https://img.youtube.com/vi/Hk8Dn0qfMT4/hqdefault.jpg)](https://youtu.be/Hk8Dn0qfMT4) | [![Watch: DeepSeek-V4.1-Flash vs Qwen3.8-27B vs GLM-5.3 vs MiniMax-M3](https://img.youtube.com/vi/aYCQYg6m2gY/hqdefault.jpg)](https://youtu.be/aYCQYg6m2gY) |
| [Watch on YouTube](https://youtu.be/Hk8Dn0qfMT4) | [Watch on YouTube](https://youtu.be/aYCQYg6m2gY) |

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # grading + question bank tests
npm run build      # static site in dist/
npm run preview    # serve the production build (with its strict CSP)
```

No API key? Pick **Simulated (no API calls)** as the provider to try the game offline: no API keys needed.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo (branch `main`).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes `dist/`.

The build uses relative paths, so it works under `https://<user>.github.io/<repo>/`.

## Providers

Nebius Token Factory, OpenAI, Anthropic, Google Gemini, Together AI, Groq, Fireworks AI,
OpenRouter, DeepInfra, Mistral AI, Cerebras, Hugging Face, GMI Cloud, Baseten, any custom
OpenAI-compatible endpoint, plus a simulated provider (no API keys needed). All presets accept direct browser
calls (CORS), so no proxy is needed. Each horse can use a different provider, and
each Custom horse can point at its own server.

To add a provider, add an entry to `src/providers.ts`.

## API keys

Keys are kept only in memory for the current tab: never saved and sent only to the
provider you choose. Model output is always rendered as plain text, and the production
build ships a strict Content Security Policy. For live demos, use a separate key with a
spending limit.

## Questions

[`src/questions.json`](src/questions.json) holds 266 questions tagged `easy`, `medium` or `hard`. Each has a
display `answer` and a list of accepted `aliases`. Tick any combination of levels in
setup; questions are split evenly across them, optionally ordered easy → hard.

The **Expert** level is generated fresh for each race by `src/generated.ts` (11 kinds: big
multiplications, calendars, counting, strings, number bases, primes, Collatz and more) with answers computed in code, so
models can't have memorized them. `npm test` checks each generator against an
independent calculation.

Models are asked to end with `ANSWER: <short answer>`. The answer is
normalized (case, punctuation, accents, leading articles, number words) and matched
against the accepted answers. Run `npm test` after editing; it checks that every answer
grades as correct and that each level keeps at least 50 questions.

### Calibrating the bank

`npm run calibrate` asks real models every bank question (plus some generated Expert
ones), with the same prompt and grading as the game, and writes
`calibration/report.md` (git-ignored). The report shows accuracy by level per model and flags
questions where models agree on a different answer (often a missing alias or a wrong
key), questions every model misses, Easy questions most models miss, and Hard/Expert
questions every model gets.

```bash
set -a; . ./.env; set +a     # keys from .env (see .env.example)
npm run calibrate -- --models google/gemma-3-27b-it,openai/gpt-oss-120b
# options: --base-url URL (default Nebius Token Factory) --key-env NAME (default NEBIUS_API_KEY)
#          --expert N (default 24) --limit N (bank questions) --concurrency N (default 8)
```

### Debugging a single question

`npm run debug` sends one question to a few models and prints, for each attempt, the
full reply, the separated reasoning, the extracted answer, the grade against the key,
timing, finish reason (to catch cut-offs) and token usage. It uses the same prompt,
streaming and grading as the game, so what you see is what a race would see.

```bash
./debug.sh --id 42 --models Qwen/Qwen3-30B-A3B-Instruct-2507,deepseek-ai/DeepSeek-V4.1-Flash

./debug.sh --question 'What is the sum of the digits of 9 to the power 84?' --answer 360 --provider nebius  --models nvidia/Nemotron-3_5-Lightning

# or inline:  ./debug.sh --question "Capital of France?" --answer Paris --models …
# or a file:  ./debug.sh --file one-question.json --models …
# options: --aliases a,b --repeats N --provider ID --base-url URL --key-env NAME
```

`./debug.sh` loads API keys from `.env` (see `.env.example`) and forwards its
arguments to `scripts/debug-question.mts`, which also runs directly via
`npm run debug -- …` if the keys are already in the environment.

Handy offline check with no keys: add `--provider sim`.

### Troubleshooting

- **`NEBIUS_API_KEY is not set` (or another `…_API_KEY`).** The key isn't in the
  environment. `./debug.sh` loads `.env` automatically — make sure the file exists
  (`cp .env.example .env`) and the variable for your provider is filled in. Running
  `npm run debug` directly needs `set -a; . ./.env; set +a` first. If your key lives
  under a different name, pass `--key-env NAME`.
- **`HTTP 401` / `403`.** The key is wrong, expired, or not valid for that provider.
  Check you're using the provider's own key with the matching `--key-env`.
- **`HTTP 404: … model …`.** The model ID is wrong or the provider doesn't serve it.
  Copy the exact ID from the setup screen's model list, or from the provider's
  `/models` endpoint.
- **`HTTP 429` or `5xx`.** Rate limit or a provider hiccup; the script retries with
  backoff. If it keeps failing, wait, lower `--repeats`, or try another model.
- **`Enter a base URL first`.** The Custom provider needs `--base-url`, which usually
  ends in `/v1`.
- **`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, or Node rejects a `.mts` file.** Your Node is
  too old to run the scripts directly. Use Node 22.7+ (check with `node --version`).
- **Timeout after 120 s.** The request hit the script's own limit; retry or check the
  provider's status.
- **Reasoning is empty.** That model/provider didn't return separate reasoning, or
  returned it inline in the reply. Reasoning is shown only when the provider sends it.
- **A correct-looking answer grades as wrong.** Usually a missing alias. The script
  prints the key and aliases; add `--aliases a,b` (or edit `src/questions.json`) and
  re-run. Grading normalizes case, punctuation, number words, and spacing inside
  words, and accepts a short answer that contains the key — but not spaces between
  numbers.
- **Need the provider's raw error.** On failure the script prints the HTTP status and
  the response body under `Response body`.

An optional per-question **time limit** (default 30 s) counts slow answers as wrong.
Use ~10 s to reward speed, 15–30 s for a balanced race, and 60 s+ for reasoning models
or Expert questions.

## Project layout

| File | Purpose |
| --- | --- |
| `src/main.ts` | Setup screen, race view, question board, results |
| `src/race.ts` | Race engine: per-model loops, scoring, ranking |
| `src/api.ts` | OpenAI-compatible client: model list, streaming, retries, simulator |
| `src/grading.ts` | Reasoning separation, answer extraction, matching |
| `src/questions.ts` | Question selection by difficulty |
| `src/generated.ts` | Expert question generators |
| `src/export.ts` | JSON / CSV results export |
| `src/insights.ts` | Question-bank feedback from a finished race (models agreeing on a wrong answer) |
| `src/charts.ts` | Pure data and geometry for the results analytics (race progress, lead changes, ticks, per-level accuracy) |
| `src/debuglog.ts` | Human-readable debug logging (🐞 Debug toggle) |
| `src/providers.ts` | Provider presets |
| `src/horse.ts`, `src/sound.ts`, `src/confetti.ts` | Horse SVG, synthesized sounds, confetti |

## License

[MIT](LICENSE) © 2026 [Sujee Maniyam](https://sujee.dev)
