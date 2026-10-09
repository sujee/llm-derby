# LLM Derby - Functional Spec

## Overview

A fun, carnival-style horse racing game where 3 or 4 LLMs compete by answering questions. Correct answers move horses forward. The first horse to reach the finish line wins.

**Browser-only application** with no backend, hosted on GitHub Pages. No CORS proxy is needed: every built-in provider accepts direct browser calls (verified 2026-10-08).

## 1. Setup

### Horses and providers

- Choose **3 or 4 horses**. Each horse has its own provider and model, so a race can compare providers (e.g. Nebius Token Factory vs OpenAI).
- Built-in OpenAI-compatible providers: Nebius Token Factory (default), OpenAI, Anthropic, Google Gemini, Together AI, Groq, Fireworks AI, OpenRouter, DeepInfra, Mistral AI, Cerebras, Hugging Face, GMI Cloud and Baseten.
  - Anthropic is sent its required browser-access header automatically.
  - Baseten may not list models in the browser; its card notes that the model ID can be typed.
- **Custom (OpenAI-compatible):** any base URL (e.g. `https://api.example.com/v1`), including local servers on `localhost`.
- **Simulated (no API calls):** five built-in fake models with different speeds and accuracy (one also produces fake server errors), for offline demos and trying the game without keys.
- Each provider card shows a "get a key" link where available.

### API keys and models

- Enter an API key per provider; horses on the same provider share it.
- Models load **only when "Load models" is clicked**. Typing a key or base URL never sends a request. (Simulated models are built in and appear immediately.)
- The model box is searchable and also accepts any model ID typed by hand, so a race works even when a model list can't be loaded.
- Model lists hide entries that are clearly not chat models (embeddings, image, audio, rerank, moderation and similar), and remove duplicates.
- Clear messages for common mistakes, e.g. a missing base URL, a URL without `/v1`, or a URL that returns a web page instead of JSON.
- **🎲 Assign models:** gives each horse a random model from its provider's loaded list, avoiding duplicates where possible. Click again to re-roll.

### Race settings

- **Winning distance:** number of correct answers needed to finish (default 20, range 3–60).
- **Question difficulty:** checkboxes for **Easy, Medium, Hard and Expert**, in any combination; at least one stays selected. Default: Easy + Medium + Hard.
- **📈 Rising difficulty** (available with two or more levels): questions run easy → medium → hard → expert.
- **⏱ Time limit per question:** on by default at 30 seconds, adjustable from 3 to 300 seconds, or off. Helper text under it: ~10s rewards speed (fast "flash" models answer in 2–5s), 15–30s is balanced, 60s+ suits reasoning / thinking models and Expert questions.
- An info line shows how many questions the race will use and how they split across levels, and warns if there are fewer questions than the winning distance.
- A legend shows one sample question per level, chosen at random on each page load. Unselected levels are dimmed.
- **🏁 Start the race!** validates the setup (provider, key, base URL and model for every horse) and shows what's missing.

## 2. Questions

### Question bank

- 198 factual questions with verified answers in `src/questions.json`: 76 easy, 71 medium, 51 hard (at least 50 per level).
- Each question has a category, a difficulty, a display answer and a list of other accepted answers.
- Hard questions target common LLM mistakes: letter counting, number comparison, multi-step arithmetic, and questions whose popular answer is wrong.

### Expert questions

- Generated fresh for every race, with answers computed in code, so they can't be memorized and the answer key is always correct. Added because the latest models scored 100% on the factual levels.
- Eight kinds: 4-digit multiplication, day of the week for a date, days between two dates, counting a letter in a random string, reversing a random string, base conversion, remainders of large powers, and picking the k-th word after alphabetical sorting.

### Selection

- Questions per race: winning distance × 1.5, rounded up (30 at the default distance of 20), capped by the questions available at the selected levels. Expert is unlimited.
- Questions are split evenly across the selected levels. If a level runs short, the others make up the difference.
- Order is random, or easy → expert with rising difficulty (random within each level).
- All models receive identical questions in the same order.

## 3. Race Mechanics

- A short countdown (bugle, 3-2-1-GO!) starts the race.
- Models answer independently, at their own pace, one question at a time.
- **Correct answer = one step forward**, whatever the difficulty. Wrong answers never move a horse back.
- The first horse to reach the winning distance wins, and the race ends at that moment. Questions still in progress are marked "race over".
- If no horse finishes (out of questions, or the race is stopped), the horse with the most correct answers leads.
- Ranking: finishers first (by finish time), then most correct answers, then lower median latency.

### Grading

- Models are asked to end their reply with `ANSWER: <short answer>`.
- Only the final answer is graded. Reasoning is separated out: `reasoning_content` / `reasoning` fields, `<think>` blocks, and Mistral-style thinking parts.
- The answer is extracted from the `ANSWER:` line (or `\boxed{}`, or the last line), then normalized: case, punctuation, accents, leading articles, number words → digits, thousands separators.
- It is correct if it matches any accepted answer, or if a short answer contains an accepted answer as whole words (e.g. "Canberra, Australia").

### Latency, time limit and errors

- Latency is end-to-end per question, including reasoning time.
- **Time limit:** covers the whole question, including retries. An answer that doesn't arrive in time counts as wrong ("too slow"), not as an error, so it never withdraws a horse. Too-slow answers are excluded from latency statistics.
- Rate limits (429), server errors (5xx) and network failures are retried twice with backoff. Each request has a hard timeout of 180 seconds.
- Failed requests count as wrong.
- A horse is **withdrawn** after an authentication or unknown-model error (401/403/404), or after 3 errors in a row.

## 4. Game Interface

Colorful, animated carnival theme: striped tent banner, marquee title with blinking bulbs, turf race lanes, a checkered finish line, and original SVG horses with jockeys in lane colors.

### Race header

- Race time, the question the leader is on, and the finish line.
- Controls: Stop race, Race again (same questions), New random race, Setup.

### Lanes

- 3 or 4 horizontal lanes. Horses gallop, move smoothly forward one step per correct answer (with a "+1"), and celebrate when they finish.
- Each lane shows three lines:
  1. Model and provider.
  2. Score and status, e.g. `12 / 20  [Working on Q13 · Hard]`. The status pill is colored by the current question's difficulty, and changes to 🏆 Finished, 🚫 Withdrawn (hover for the error), 🏁 Out of questions or Race over.
  3. Stats: **correct count in green (✓)**, **wrong count in red (✗)** (including too slow and errors), accuracy and median latency, e.g. `✓ 12  ✗ 3  80% · med 1.3s`.
- Withdrawn horses are greyed out.

### Question board

- One row per question in **ascending order** (first question first), added as the leader reaches each question.
- Each row: question number, question text, difficulty and category tags, and the expected answer.
- One column per model: the model's answer with ✓ / ✗, its latency, and an expandable "Reasoning" / "Full reply". "⏱ Too slow" and ⚠ errors (hover for details) are shown distinctly.
- The board scrolls with the page. On desktop the column headers stay pinned at the top of the window; on narrow screens the table scrolls sideways.

### Sound and celebration

- Synthesized sound effects (no audio files): bugle, countdown beeps, correct ding with hoofbeats, wrong buzz, error tone, winner fanfare and crowd cheer. Sound on/off in the header.
- Confetti and a bouncing winner when a horse wins (respects reduced-motion settings).

## 5. Results

- Headline: the winner, "Race stopped" with the leader, or "No horse reached the line" with the winner on points.
- Summary line: total race time, number of questions, difficulty levels (and "rising"), winning distance, and time limit if set.
- **Podium** for the top three, showing each model, its provider and its correct count.
- **Standings table:** place, horse (model and provider), correct, incorrect, too slow (when a time limit is set), errors, accuracy, median (p50) latency, p90 latency, answered, and status (finished time, withdrawn reason, out of questions, or still running).
- The complete question-by-question comparison stays on the board below.
- **Export results:**
  - **⬇ Full results (JSON):** race settings, standings with all statistics, and every question reached with each model's answer, verdict, latency, error, full reply and reasoning.
  - **⬇ Answers (CSV):** one row per question per model, for spreadsheets.
  - File names use the race start time, e.g. `llm-derby-2026-10-08-2326.json`.
  - Exports never include API keys. CSV cells that look like spreadsheet formulas are neutralized, and the CSV opens correctly in Excel (UTF-8).

## 6. Controls

- Start race (setup) / Stop race
- New random race (fresh questions, same horses and settings)
- Race again: same questions
- Setup (back to the setup screen)
- Sound on/off
- Assign models, 3/4 horses
- Export results (JSON, CSV)

## 7. Settings, Privacy and Security

- **API keys** are kept only in memory for the current tab: never saved, and sent only to the provider they belong to. They are re-entered each session.
- **Remembered in the browser:** number of horses, each horse's provider, custom base URL, winning distance, difficulty levels, rising difficulty, time limit and sound. Models are restored only for providers that don't need a key (since keys are gone after a reload).
- Model output is always rendered as plain text, never as HTML.
- No third-party scripts, fonts or assets. The production build ships a strict content security policy.

## 8. Debugging

- **🐞 Debug toggle** in the header (next to Sound; remembered; off by default). When on, every request and response is logged to the browser console in a human-readable form:
  - When a request is sent: `→ Lane 2 · DeepSeek-V4.1-Flash @ GMI Cloud · Q8 (Hard) · request sent to <url>`.
  - When it completes, a collapsible entry such as `← Lane 2 · DeepSeek-V4.1-Flash @ GMI Cloud · Q8 (Hard) · ✓ correct "Canberra" · 2.70s` (or ✗ wrong with the expected answer, ⏱ too slow, ⚠ error). Inside: provider, model, question, expected and accepted answers, the extracted answer and verdict, endpoint, HTTP status and provider request ID, timing (total, first byte, streamed chunks, attempts), token usage including reasoning tokens, finish reason (flagging answers cut off by the token limit), the request headers and body, the reasoning and the full reply.
  - Race start (horses with lane colors, providers, base URLs, settings and the question list) and race end (standings table).
  - Lanes are tagged with their lane color. API keys are redacted (`Bearer ••••`).

- Every API failure is logged to the browser console with a `[LLM Derby]` prefix and its context: provider, model, URL, HTTP status, the provider's response body and the original exception. Retries are logged as warnings. API keys are never logged.
- Every model-list load is logged as a collapsible group: the request URL, response shape, a table of all models (shown or hidden, and why), and the raw response.
- Hovering any error shows a tooltip with the details and a pointer to the console: question board cells, withdrawn badges, the results status column, and model-list errors in setup.

## 9. Implementation

- **Stack:** Vite + vanilla TypeScript, no UI framework. Builds to static files with relative paths, so it works under `https://<user>.github.io/<repo>/`.
- **Deployment:** a GitHub Actions workflow runs the tests, builds, and publishes to GitHub Pages on every push to `main`.
- **Layout:** responsive from phone width (no sideways page scrolling) to large screens, suitable for screen recording.
- **Tests** (`npm test`): answer extraction and grading; that every question bank answer grades as correct and each level has at least 50 questions; question selection and splitting; expert generators checked against independent calculations; race statistics and ranking; and exports (including that no API key appears in them).

## 10. Design Goals

- Visually exciting and easy to follow during live demos.
- Responsive and suitable for screen recording.
- Simple, lightweight and browser-based.
- Extensible to compare models across different inference providers.
- Original carnival design (no mockup).
