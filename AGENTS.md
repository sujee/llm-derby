# AGENTS.md

Instructions for AI coding agents working on LLM Derby.

## Project

LLM Derby is a browser-only game (no backend) where 3–4 LLMs race by answering trivia questions. It's built with Vite + vanilla TypeScript and deployed to GitHub Pages. The full functional spec is in [`spec-v1.md`](spec-v1.md); keep it up to date when behavior changes.

## Commands

```bash
npm install
npm run dev       # dev server, http://localhost:5173
npm test          # unit tests (vitest)
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build (strict CSP), http://localhost:4173
npm run calibrate -- --models a,b   # check the question bank against real models (needs keys from .env)
npm run debug -- --id N --models a,b  # one question, a few models: full reply, reasoning, grade (needs keys from .env; wrapper: ./scripts/debug-question.sh)
npm run pricing:update              # refresh src/pricing.snapshot.json from models.dev (wrapper: ./scripts/update-pricing.sh)
npm run version:bump                # raise the version by one (v1 → v2); do this before every push to main
```

Run `npm test` and `npm run build` after every change. Test UI changes in a browser against `npm run preview`; the "Simulated (no API calls)" provider needs no keys.

## API keys: read them from `.env`

- Keys for testing against real providers are in **`.env`** at the project root. Use them from there. Never ask the user to paste keys into the chat.
- Variable names are listed in [`.env.example`](.env.example), e.g. `NEBIUS_API_KEY`, `OPENAI_API_KEY`, `GMI_API_KEY`.
- Load them into the environment of the command that needs them, without printing them:

  ```bash
  set -a; . ./.env; set +a
  curl -s https://api.tokenfactory.nebius.com/v1/models -H "Authorization: Bearer $NEBIUS_API_KEY"
  ```

  For a script, pass a key through the environment (`NEBIUS_API_KEY=... node script.mjs`, or load `.env` as above) and read `process.env`. Never hard-code it.
- **Never print, log or echo a key.** Don't `cat`, `grep` or otherwise display `.env` or any file that may hold keys (including `.env.*` variants). To see which keys exist, list only the names:

  ```bash
  cut -d= -f1 .env | grep -v '^#'
  ```

- **Never write keys** into source files, tests, fixtures, screenshots, exported results, commit messages or docs.
- **Never commit** `.env` or any `.env.*` file except `.env.example`, which holds only empty placeholders. `.gitignore` enforces this; check `git status` before committing.
- **Never prefix keys with `VITE_`.** Vite embeds `VITE_*` variables in the public build. The app itself never reads `.env`; in the browser, users type their keys into the setup screen and they stay in memory only.
- Keep real-provider test runs small (few horses, short races) and say which keys you used.

## Git discipline

- **Never commit or push without asking the user first, every time.** Ask in plain words what will be committed and where it will be pushed, and wait for an explicit yes. Permission for one commit or push does not carry over to the next one.
- The same applies to anything else that changes the repository or what's published: amending or rewriting history, creating or deleting branches and tags, opening pull requests, changing GitHub settings (Pages, description, topics), or triggering a deploy.
- **Every push to `main` raises the version by one.** The version is a whole number in `version.json` (v1, v2, v3, …), shown in the app header and footer and saved in exports. Run `npm run version:bump` (it also sets `package.json` and `package-lock.json` to `N.0.0`), include the change in the commit, and name the new version when asking for permission (e.g. "commit and push as v4?"). One bump per push, however many commits it contains.
- Never force-push.
- Before asking, check `git status` and list what's included. Make sure no `.env` file, key, or `calibration/` output is staged.
- Reading is always fine: `git status`, `git log`, `git diff --stat`. Inspect a full diff when you must, but never print it to the terminal (see Terminal output).

## Terminal output

- **Never print code diffs to the terminal.** Don't run `git diff`, `git show`, `git log -p`, or similar in a way that dumps a diff, and don't `cat` a file just to display it as a diff. Read changes privately when you need them and tell the user what changed in words (files and a short summary), not as a diff.

## Code layout

| File | Purpose |
| --- | --- |
| `src/main.ts` | Setup screen, race view, question board, results |
| `src/race.ts` | Race engine: per-model loops, time limit, scoring, stats, ranking |
| `src/api.ts` | OpenAI-compatible client: model list (with prices), streaming, retries, token usage, simulator |
| `src/grading.ts` | Reasoning separation, answer extraction, matching |
| `src/questions.json`, `src/questions.ts` | Question bank and selection by difficulty |
| `src/generated.ts` | Generated Expert questions with computed answers |
| `src/providers.ts` | Provider presets |
| `src/series.ts` | Best-of-N series scoring |
| `src/sharelink.ts` | Setup links (`#setup=…`): encode, and validate untrusted input |
| `src/commentary.ts`, `src/announcer.ts` | Race announcer: what to say, and how to show it |
| `scripts/calibrate.mts` | Question calibration against real models (Node, not part of the app) |
| `scripts/debug-question.mts` | Debug one question on a few models: full reply, reasoning, grade, timing (`npm run debug`) |
| `scripts/update-pricing.mts` | Refresh `src/pricing.snapshot.json` from models.dev (`npm run pricing:update`) |
| `scripts/*.sh` | Shell wrappers: `update-pricing.sh`, `debug-question.sh` (load `.env`, then run the Node script) |
| `src/prompt.ts` | The system prompt every model gets |
| `src/debuglog.ts` | Human-readable request/response logging (🐞 Debug toggle) |
| `src/export.ts` | JSON / CSV results export |
| `src/png.ts` | Draws the standings card as a PNG (Canvas 2D, no library) |
| `src/pricing.ts` | Model prices for providers that don't list them: lookup in the models.dev catalog (bundled snapshot; the setup "Refresh prices" button fetches the live one for the session) |
| `src/pricing.snapshot.json` | Committed price snapshot, refreshed with `npm run pricing:update` |
| `src/insights.ts` | Question-bank feedback from a finished race (models agreeing on a wrong answer) |
| `src/charts.ts` | Pure data and geometry for the results analytics (race progress, lead changes, ticks, per-level accuracy) |
| `src/sort.ts` | Sorting for the standings table (missing values last, stable) |
| `version.json`, `src/version.ts`, `scripts/bump-version.mjs` | App version (whole number) and the script that raises it |
| `video/` | Demo-video renderer (`render.py`, ffmpeg + headless Chrome) and its HTML cards; not part of the app |

## Conventions

- Model output is untrusted: render it as text only (the `h()` helper in `src/dom.ts` never parses HTML). No third-party scripts, fonts or assets; the production build has a strict CSP.
- API keys never leave the provider request headers: no logging (the debug log redacts them), no exports, no storage.
- New questions need an answer key that grades as correct; `npm test` checks every question in the bank.
