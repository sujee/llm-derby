# LLM Derby - Functional Spec

## Overview

A fun, carnival-style horse racing game where 3 or 4 LLMs compete by answering questions. Correct answers move horses forward. The first horse to reach the finish line wins.

**Browser-only application** with no backend, hosted on GitHub Pages. No CORS proxy is needed: every built-in provider accepts direct browser calls (verified 2026-10-08).

## 1. Setup

### Horses and providers

- Choose **3 or 4 horses**. Each horse has its own provider and model, so a race can compare providers (e.g. Nebius Token Factory vs OpenAI).
- Built-in OpenAI-compatible providers, listed alphabetically: Anthropic, Baseten, Cerebras, DeepInfra, Fireworks AI, GMI Cloud, Google Gemini, Groq, Hugging Face, Mistral AI, Nebius Token Factory (default), OpenAI, OpenRouter and Together AI. Custom and Simulated come last.
  - Anthropic is sent its required browser-access header automatically.
  - Baseten may not list models in the browser; its card notes that the model ID can be typed.
- **Custom (OpenAI-compatible):** any base URL (e.g. `https://api.example.com/v1`), including local servers on `localhost`. Each Custom horse has its own base URL, key and model list, so different servers can race each other (e.g. a local vLLM against a private gateway). The key is optional. A Custom horse is labelled with its server's host (e.g. `localhost:8000`).
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

One panel. On desktop: **Winning distance** and **Time limit** on the first row, **Question difficulty** (chips, then Rising difficulty) on the second, and the **Start block** on the right spanning both rows. On tablets the Start block moves under the difficulty row; on phones everything is one column, with the Start block at the bottom.

- **Winning distance:** number of correct answers needed to finish (default 20, range 3–60).
- **Question difficulty:** chips for **Easy, Medium, Hard and Expert**, in any combination; at least one stays selected. Default: Hard + Expert (today's models answer Easy and Medium almost perfectly). **📈 Rising difficulty** sits right under the chips (available with two or more levels): questions run easy → medium → hard → expert.
- **Time limit:** a checkbox and seconds per question; on by default at 30 seconds, adjustable from 3 to 300, or off. A short hint under it ("10s fast · 15–30s balanced · 60s+ reasoning"); the full guidance is in the tooltip.
- **Start block:** a **Single race | Best of 3 | Best of 5** switch with the Start button right under it ("🏁 Start the race!" or "🏁 Start the series!"). Start validates the setup (provider, key, base URL and model for every horse) and shows what's missing.
- Below the groups, a preview box shows one sample question per level (chosen at random on each page load; unselected levels dimmed), then a line with how many questions the race will use and how they split across levels, with a warning if there are fewer questions than the winning distance. A **📖 See all questions** link opens the question bank shipped with this version of the game (`questions.json`, copied into the build) in a new tab.

### Series (best of 3 / best of 5)

- Each race in a series uses fresh questions; the race header shows "Best of N · Race k".
- Points per race: 1st 3, 2nd 2, 3rd 1, 4th 0. Ties go to most wins, then most correct answers.
- After each race, a **series standings** table (points, wins, place in each race, total correct) appears under the race results.
- **The series runs on its own:** after each race the results show "Race k of N starts in 8s…" with **▶ Start now**, **⏸ Pause series** (no more automatic starts in this series; a **▶ Next race** button appears instead) and **⏹ End series now** (the standings so far decide it). After a stopped race the series waits for you.
- Long model names are cut with "…" in the race strip and tables; the full name is in the tooltip.
- The series ends early when the leader can no longer be caught. The champion is announced with "🏆 … wins the series!", then **🏆 New series** or **🎲 Single race**.
- A stopped race doesn't count; it can be run again. During a series the "Race again" and "New random race" buttons are replaced by the series buttons, so every race counts once.
- The JSON export includes the series standings.
- **Race strip:** from the first race of a series, a strip above the race view lists every race in it (`Race 1 🏆 steady · Race 2 live · Race 3 · Race 4 · Race 5`) and a **🏆 Series tally** tab. Races not run yet are greyed out and can't be clicked; the tally becomes clickable after the first race.
  - Click a race to see it again exactly as it finished: lanes, results, the series standings at that point, and its question board. Past races are read-only (no race controls or announcer), but their exports work and export that race.
  - **🏆 Series tally** shows the whole series so far: points, wins, each horse's place in every race, total correct, and accuracy, latency p50, tok/s p50 and cost across all counted races.

## 2. Questions

### Question bank

- 266 questions with verified answers in `src/questions.json`: 76 easy, 119 medium, 71 hard (at least 50 per level). Levels are checked against real models with `npm run calibrate`: Hard questions that every model answered correctly were moved to Medium, and Hard is mostly multi-step math, counting and reasoning (computed answers checked in code).
- Each question has a category, a difficulty, a display answer and a list of other accepted answers.
- Hard questions target common LLM mistakes: letter counting, number comparison, multi-step arithmetic, and questions whose popular answer is wrong.

### Expert questions

- Generated fresh for every race, with answers computed in code, so they can't be memorized and the answer key is always correct. Added because the latest models scored 100% on the factual levels.
- Eleven kinds, sized so that strong reasoning models still slip (calibration: gpt-oss-120b 85%, DeepSeek-V4.1-Flash 82%, Qwen3-30B 57%, Gemma 3 27B 21%): 6-digit × 5-digit multiplication; day of the week for a date in 1600–2399; days between two dates (up to 30,000 days); counting a letter in an 80-character string; reversing a 24-letter string; converting a number up to 9,999,999 to base 3–16; remainders of large powers (exponent up to 99,999); picking the k-th of 12 words after sorting; the digit sum of a power such as 7^45; Collatz steps from a 4–5 digit number; and the k-th prime after a 5-digit number.

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
- The answer is extracted from the `ANSWER:` line (or `\boxed{}`, or the last line), then normalized: case, punctuation, accents, leading articles, number words → digits, thousands separators (`50,201,940`, `50.201.940` and `50 201 940` all read as 50201940; `1.234` stays a decimal, and badly grouped digits like `502,019,40` don't match).
- It is correct if it matches any accepted answer, or if a short answer contains an accepted answer as whole words (e.g. "Canberra, Australia").

### Latency, time limit and errors

- Two timings per answer, both measured on the attempt that succeeded:
  - **TTFT** (time to first token): from sending the request to the first streamed token, reasoning or answer. Not available when a provider doesn't stream.
  - **Latency** (end-to-end): from sending the request to the complete answer, including reasoning time.
- Statistics use the median (p50) of each.
- **Time limit:** covers the whole question, including retries. An answer that doesn't arrive in time counts as wrong and is shown as "Timeout (30s)" with the current limit, not as an error, so it never withdraws a horse. Timeouts are excluded from latency statistics.
- On a timeout, whatever streamed in before the cutoff is kept (never graded): the partial reasoning and reply, and the time to first token. This shows whether the provider never responded ("no response received") or the model was still working ("started after 1.3s").
- Rate limits (429), server errors (5xx) and network failures are retried twice with backoff. Each request has a hard timeout of 180 seconds.
- Failed requests count as wrong.
- A horse is **withdrawn** after an authentication or unknown-model error (401/403/404), or after 3 errors in a row.

## 4. Game Interface

Colorful, animated carnival theme: striped tent banner, marquee title with blinking bulbs, turf race lanes, a checkered finish line, and original SVG horses with jockeys in lane colors.

### Race header

- Race time, the question the leader is on, and the finish line.
- Controls: Stop race, Race again (same questions), New random race, Setup.

### Announcer

- A caption bar between the race header and the lanes calls the race as it happens: the start, the first correct answer, lead changes and ties, streaks (3, 5, 7, 10 in a row), halfway, the final stretch, stumbles on Hard/Expert questions, timeouts, withdrawn horses, and the finish ("📸 Photo finish!" when the runner-up is one answer behind, or the winner), a stopped race, or a win on points.
- Paced for readability: each call stays up about 2.5 seconds (1.6 when busy). Big moments go first; minor calls are dropped when things happen too fast. The closing call appears immediately.
- **📣 Announcer on/off** in the header (remembered; on by default). Off hides the bar; it can be switched back on mid-race.
- Horse names appear as pills in their lane color. When two horses run the same model, names add the provider (e.g. "DeepSeek-V4 @ GMI Cloud") or, on the same provider, the lane number (e.g. "steady #2").

### Lanes

- 3 or 4 horizontal lanes. Horses gallop, move smoothly forward one step per correct answer (with a "+1"), and celebrate when they finish.
- Each lane shows three lines:
  1. Model and provider.
  2. Score and status, e.g. `12 / 20  [Working on Q13 · Hard]`. The status pill is colored by the current question's difficulty, and changes to 🏆 Finished, 🚫 Withdrawn (hover for the error), 🏁 Out of questions or Race over.
  3. Stats: **correct count in green (✓)**, **wrong count in red (✗)** (including timeouts and errors), accuracy and median end-to-end latency, e.g. `✓ 12  ✗ 3  80% · latency (p50) 1.3s`. (TTFT is in the results table, exports and debug log.)
- Withdrawn horses are greyed out.

### Question board

- One row per question in **ascending order** (first question first), added as the leader reaches each question.
- Each row: question number, question text, difficulty and category tags, and the expected answer.
- One column per model: the model's answer with ✓ / ✗, its latency and tokens, and an expandable "Response" showing two boxes, Reasoning and Reply ("(none)" when a model sent no reasoning). "⏱ Timeout (30s)" and ⚠ errors (hover for details) are shown distinctly. Timeout cells say "started after 1.3s" or "no response received", with an expandable "Response (cut off)" showing the reasoning and reply received so far.
- The board scrolls with the page. On desktop the column headers stay pinned at the top of the window; on narrow screens the table scrolls sideways.

### Sound and celebration

- Synthesized sound effects (no audio files): bugle, countdown beeps, correct ding with hoofbeats, wrong buzz, error tone, winner fanfare and crowd cheer. Sound on/off in the header.
- Confetti and a bouncing winner when a horse wins (respects reduced-motion settings).

## 5. Results

- Headline: the winner, "Race stopped" with the leader, or "No horse reached the line" with the winner on points.
- Summary line: total race time, number of questions, difficulty levels (and "rising"), winning distance, and time limit if set.
- **Podium** for the top three, showing each model, its provider and its correct count.
- **Standings table:** place, horse (model and provider), correct, incorrect, timeouts (when a time limit is set; the header shows the limit, e.g. "Timeout (30s)"), errors, accuracy, TTFT p50, latency p50, tok/s p50 (output tokens, reasoning included, per second after the first token; "–" when the reply arrived in one burst or token counts are missing, "~" when estimated), tokens in, cached tokens, tokens out and cost. Whether a horse finished or withdrew (and why) shows in its lane and in the export.
- The complete question-by-question comparison stays on the board below.
- **Export results:**
  - **⬇ Full results (JSON):** race settings, standings with all statistics (including TTFT p50 and latency p50), and every question reached with each model's answer, verdict, TTFT, latency, error, full reply and reasoning.
  - **⬇ Answers (CSV):** one row per question per model (result is correct, wrong, timeout, error or not answered; includes `ttft_ms`, `latency_ms` and `tok_per_sec`), for spreadsheets.
  - File names use the race start time, e.g. `llm-derby-2026-10-08-2326.json`.
  - Exports never include API keys. CSV cells that look like spreadsheet formulas are neutralized, and the CSV opens correctly in Excel (UTF-8).

## 6. Controls

- Start race (setup) / Stop race
- New random race (fresh questions, same horses and settings)
- Race again: same questions
- Setup (back to the setup screen)
- Sound on/off, Announcer on/off
- **📺 Present:** full screen with a bigger announcer and lanes, for a projector or screen share. The header, footer and question board are hidden; results and the podium still appear at the end. Esc or "✕ Exit presentation" leaves it.
- Assign models, 3/4 horses
- **🔗 Copy setup link:** copies a link (`…/#setup=…`) that opens the same setup: providers, models, custom base URLs, distance, difficulty levels, rising difficulty and time limit. It never includes API keys. Opening the link fills in the setup screen and shows a notice (asking the visitor to check custom base URLs before entering a key); every value from a link is validated and clamped, and an unreadable link is ignored.
- Export results (JSON, CSV)

## 7. Settings, Privacy and Security

- **API keys** are kept only in memory for the current tab: never saved, and sent only to the provider they belong to. They are re-entered each session.
- **Remembered in the browser:** number of horses, each horse's provider and custom base URL, winning distance, difficulty levels, rising difficulty, time limit, sound and announcer. Models are restored only for providers that don't need a key (since keys are gone after a reload).
- Model output is always rendered as plain text, never as HTML.
- No third-party scripts, fonts or assets. The production build ships a strict content security policy.

## 8. Debugging

- **🐞 Debug toggle** in the header (next to Sound; remembered; off by default). When on, every request and response is logged to the browser console in a human-readable form:
  - When a request is sent: `→ Lane 2 · DeepSeek-V4.1-Flash @ GMI Cloud · Q8 (Hard) · request sent to <url>`.
  - When it completes, a collapsible entry such as `← Lane 2 · DeepSeek-V4.1-Flash @ GMI Cloud · Q8 (Hard) · ✓ correct "Canberra" · 2.70s` (or ✗ wrong with the expected answer, ⏱ timeout (30s), ⚠ error). Inside: provider, model, question, expected and accepted answers, the extracted answer and verdict, endpoint, HTTP status and provider request ID, timing (total, first token, first byte, streamed chunks, attempts), token usage including reasoning tokens, finish reason (flagging answers cut off by the token limit), the request headers and body, the reasoning and the full reply.
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
