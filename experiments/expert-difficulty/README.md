# Experiment: making Expert questions harder

Date: 2026-10-11 · App version at start: v17 · Owner: Sujee

## Question

LLM Derby's Expert questions are generated on the fly with computed answers (no memorization possible). Do they still separate today's models? If not, how much harder do they need to be?

## Setup

- **Models:** OpenAI (`https://api.openai.com/v1`): `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`. Anthropic (`https://api.anthropic.com/v1`, OpenAI-compatible endpoint): `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`.
- **Questions:** 24 generated Expert questions per run, same system prompt as the game, one attempt each. **No tools:** each request is a plain chat completion (system prompt plus question) with no code interpreter, search or other tools, so models cannot run code to compute answers; a model that answers with code instead of a number is graded wrong.
- **Seed:** `--seed 1` (new option in `scripts/calibrate.mts`), so the question *types and random draws* are identical before and after. Because the generators changed, the concrete numbers differ.
- **Grading:** the game's own grader. 90-second per-question timeout; timeouts are counted as errors and left out of accuracy.
- **Command:**

  ```bash
  npm run calibrate -- --models gpt-6-astra,gpt-6-sol,gpt-6-luna \
    --base-url https://api.openai.com/v1 --key-env OPENAI_API_KEY \
    --limit 0 --expert 24 --seed 1 --concurrency 4 --out calibration/<name>
  ```

## Results

Accuracy counts a 90-second timeout as a miss, as the game would. The calibrator's own report excludes timeouts; those figures are in brackets.

**Baseline (old generators, seed 1):** all three models 24/24 (100%).

**New Expert generators (A+B), three seeds, 24 questions each:**

| Seed | gpt-6-astra | gpt-6-sol | gpt-6-luna |
| --- | --- | --- | --- |
| 1 | 19/24 = 79% [90%] | 19/24 = 79% | 14/24 = 58% |
| 2 | 21/24 = 88% [100%] | 19/24 = 79% | 15/24 = 63% |
| 3 | 20/24 = 83% [95%] | 18/24 = 75% [78%] | 18/24 = 75% |
| **All 72** | **60/72 = 83% [95%]** | **56/72 = 78% [79%]** | **47/72 = 65%** |

Median answer time (seconds, per seed 1 / 2 / 3): astra 7.1 / 8.4 / 7.2, sol 5.1 / 6.1 / 4.9, luna 7.3 / 8.3 / 6.7. Baseline was 4.2 / 2.8 / 3.6.

Correct answers by category, all three models and all three seeds (answered questions only; the last column counts 90 s timeouts):

| Category | Questions | Correct | Timeouts |
| --- | --- | --- | --- |
| Calendar | 10 | 30/30 | 0 |
| Sorting | 6 | 18/18 | 0 |
| Sequences (Collatz) | 4 | 11/12 | 0 |
| Strings (reverse) | 4 | 11/12 | 0 |
| Number bases | 5 | 13/15 | 0 |
| Multi-step (new chains) | 19 | 44/55 | 2 |
| Counting | 6 | 14/18 | 0 |
| Modular arithmetic | 5 | 10/15 | 0 |
| Arithmetic (multiply, digit sum) | 8 | 12/21 | 3 |
| Primes | 5 | 0/10 | 5 |

## What changed (A+B; the reverse question was rebuilt in run 2)

**A. Scaled-up generators:** multiplication 10-digit × 8-digit; strings of 200 (counting) and 60 (reversal) characters; base conversion of up to 12-digit numbers in more bases; modular exponentiation with 5–6-digit composite moduli and exponents up to 10⁹; sorting 40 words; digit sum of b^e with e up to 900; Collatz starts up to 10⁹; k-th prime after a number up to 10⁹ (k = 3–6).

**B. Four chained generators ("Multi-step"):** base conversion → reverse digits → read back; digit sum of a power → weekday N days after a date; product → digit sum; Collatz steps → next prime.

## Sample questions, before and after

One question per generator type, drawn with the same random seed from the old (v17) and new generators, so the same slot gets the same random draws. The answer key is shown after →.

### Existing kinds, scaled up

| Kind | Before (v17) | After |
| --- | --- | --- |
| Multiply | What is 110534 × 15576? → 1721677584 | What is 1105342778 × 15576243? → 17217087708423054 |
| Count a letter | letter "g" in a 80-character string → 9 | letter "c" in a 200-character string → 19 |
| Reverse | Write this string backwards: `bczrnlmgpshftnfkhnhzgwfd` (24 letters) | Write this string backwards: `bczrnlmgpshftnfkhnhzgwfdfhntcxpqrzqxvbfklbctklmxsrjkddxjfqjb` (60 letters) |
| Base conversion | Write 215877 in base 3 → 101222010110 | Write 11803582677 in base 3 → 1010110121112010102210 |
| Modular power | What is the remainder when 63 to the power 97713 is divided by 41? → 15 | What is the remainder when 6197 to the power 976930725 is divided by 21587? → 6468 |
| Sort words | Sort these 12 words alphabetically… which comes 2nd? → dinner | Sort these 40 words alphabetically… which comes k-th? (same list, 28 more words) |
| Digit sum of a power | Sum of the digits of 3 to the power 33 → 72 | Sum of the digits of 3 to the power 337 → 774 |
| Collatz | Start at 2158 … how many steps to reach 1? → 50 | Start at 21587705 … how many steps to reach 1? → 221 |
| k-th prime | What is the 1st prime greater than 11053? → 11057 | What is the 3rd prime greater than 21587705? → 21587729 |

Not changed: weekday of a date (e.g. 13 May 1609 → Wednesday) and days between two dates (7 July 1803 to 3 March 1811 → 2796). They were never missed in the new run either (Calendar 30/30), so they are the easiest slots in the tier.

### New chained kinds ("Multi-step", no equivalent before)

- **Base, reverse, read back:** Write the decimal number 2158770 in base 3. Reverse the order of its digits, read the result as a base 3 number, and give that value in decimal. → 807574
- **Power digit sum, then weekday:** Let N be the sum of the digits of 3 to the power 112. In the Gregorian calendar, what day of the week is it N days after 10 May 2096? → Monday
- **Product, then digit sum:** Multiply 11053427 by 15576243, then add up the digits of the product. What is the sum? → 66
- **Collatz, then next prime:** Start at 1269304. If the number is even, halve it; if it is odd, multiply by 3 and add 1. Let S be the number of steps to reach 1. What is the smallest prime number greater than S × 100? → 14207

## Findings

1. The old Expert tier was saturated: 72/72 correct. The new one gives a consistent order on all three seeds: astra ≥ sol > luna, with 83%, 78% and 65% overall (timeouts at the 90 s calibrator cap counted as misses; at the game's 30 s default, 71%, 74% and 61%, see the time-limit table).
2. The new tier is hard but not brutal: the best model still gets about 8 in 10. There is room above it (option C generators) but no urgent need.
3. **Primes is unsolved by all three models: 0/10 answered, 5 timeouts.** Typical failures: the model answers with code (`sympy.nextprime(52302412, 4)`) instead of a number, or gives a nearby prime. The keys were checked independently. Part of this is format failure, not only inability.
4. **Digit sum of a large power** (e.g. 8^436) is the second hardest. Models often answer with `sum(map(int, str(8436)))` (code, and the power is mangled) or a wrong number.
5. **gpt-6-astra's misses are almost all timeouts:** 9 of its 72 answers hit the 90 s cap, on Primes and digit sums, and when it answered it was right 95% of the time. In the game, the time limit turns this into misses, so astra's standing depends on that limit (see the time-limit table).
6. Calendar questions (weekday, days between, weekday-after-N-days) are never missed; they could be made harder or replaced.

## Effect of the time limit

The game's per-question limit is a user setting (default 30 s, range 3–300 s). To see how much it matters, the 72 answers per model were replayed against different cutoffs: an answer counts only if it is correct and arrived within the cutoff (timeouts count as misses).

| Cutoff | gpt-6-astra | gpt-6-sol | gpt-6-luna |
| --- | --- | --- | --- |
| 30 s (game default) | 51/72 = 71% | 53/72 = 74% | 44/72 = 61% |
| 45 s | 56/72 = 78% | 55/72 = 76% | 46/72 = 64% |
| 60 s | 58/72 = 81% | 55/72 = 76% | 47/72 = 65% |
| 90 s (calibrator cap) | 60/72 = 83% | 56/72 = 78% | 47/72 = 65% |

- At the default 30 s, gpt-6-astra ranks below gpt-6-sol; from 45 s upward it ranks above. Its answers are accurate but slow, so the limit decides the order of the top two.
- Raising the limit helps astra a lot and sol and luna very little. Beyond 60 s almost nothing changes for any model.
- Decision: the default stays at 30 s. A fast model should be rewarded for being fast, and the limit is already adjustable.

## Anthropic models

The same three seeds (same 24 questions per seed, same setup, no tools) were run against Anthropic's three top models: `claude-fable-5-1`, `claude-opus-5-5` and `claude-sonnet-5-5`, through Anthropic's OpenAI-compatible endpoint (`https://api.anthropic.com/v1`). The IDs were taken from the live `/v1/models` list.

| Seed | claude-fable-5-1 | claude-opus-5-5 | claude-sonnet-5-5 |
| --- | --- | --- | --- |
| 1 | 18/24 = 75% [86%] | 18/24 = 75% [86%] | 21/24 = 88% [100%] |
| 2 | 18/24 = 75% [90%] | 20/24 = 83% [95%] | 19/24 = 79% [95%] |
| 3 | 18/24 = 75% [86%] | 19/24 = 79% [90%] | 21/24 = 88% [100%] |
| **All 72** | **54/72 = 75%** | **57/72 = 79%** | **61/72 = 85%** |

Timeouts (90 s) count as misses; the calibrator's figures with timeouts excluded are in brackets. Median answer time: fable 8.8 s, opus 9.0 s, sonnet 6.8 s (the three GPT models: 4.9–8.4 s). 29 of the 216 Claude answers hit the 90 s cap, mostly on Primes (13), Arithmetic (8) and Multi-step (8).

### Side-by-side (all six models, 72 questions each)

| Model | At 90 s cutoff | At 30 s (game default) | At 90 s, reverse-string questions excluded |
| --- | --- | --- | --- |
| claude-sonnet-5-5 | 61/72 = 85% | 56/72 = 78% | 57/68 = 84% |
| claude-opus-5-5 | 57/72 = 79% | 52/72 = 72% | 57/68 = 84% |
| gpt-6-astra | 60/72 = 83% | 51/72 = 71% | 56/68 = 82% |
| claude-fable-5-1 | 54/72 = 75% | 42/72 = 58% | 54/68 = 79% |
| gpt-6-sol | 56/72 = 78% | 53/72 = 74% | 52/68 = 76% |
| gpt-6-luna | 47/72 = 65% | 44/72 = 61% | 44/68 = 65% |

### Finding: Opus and Fable are blocked by a content filter on reverse-string questions

`claude-opus-5-5` and `claude-fable-5-1` returned an **empty reply with `finish_reason: "content_filter"`** on every "Write this string backwards: …" question (4 of 4 each), so the game would grade them wrong. This is not a reasoning failure:

- It happens on the old 24-letter string as well as the new 60-letter one, and on other random consonant strings. A real phrase ("stressed desserts") works.
- `claude-sonnet-5-5` answers all of them correctly.
- The key is right (checked by the unit test and by reversing the question string directly).

What I probed by hand (one request each, same system prompt): `finish_reason` for Opus / Fable.

| Prompt | Opus | Fable |
| --- | --- | --- |
| Random consonants, 24 or 60 letters, several strings | content_filter | content_filter |
| Random digits, 40–60 digits (6 strings) | content_filter (6/6) | content_filter (3/6) |
| Random letters, rephrased ("Reverse the order of the characters…", quoted) | filtered | filtered |
| Letters with spaces / letters mixed with digits / pronounceable nonsense | mixed: each variant passed on one model and was blocked on the other | |
| Real words run together (`walnutharborvelvet…`) | stop, correct | stop, correct |
| Real word, spelled backwards (`incomprehensibilities`) | stop, correct | stop, correct |
| Short phrase ("stressed desserts"), word list, spaced numbers | stop, correct | stop, correct |

So the trigger is "reverse a random character string", however it is phrased, and it is erratic at the edges. I cannot see the filter's rules; a safety classifier reacting to a possible obfuscation or encoding trick is a guess. Real words pass reliably.

So the Strings column understates two of the three Claude models. With those four questions excluded, Opus and Sonnet tie at 84%, and Fable rises to 79%. The reverse-string generator, which depended on random letters, needed a different form of string (real words, as in run 2) if the tier is meant to be comparable across providers. Digits do not work.

### Other observations

- None of the 7 wrong Claude answers was code (the GPT models often answered with code such as `nextprime(…)`). On Primes and digit sums the Claude models mostly ran out of time instead. When they did answer Primes, they were still off in 2 of 2 cases.
- Claude Sonnet 5.5 was the fastest of the three and answered the most questions; it was wrong on only 1 of the 62 questions it answered (10 others timed out).
- Fable 5.1 is the slowest to finish within 30 s: only 42/72 answers were both correct and fast enough for the game default.

## Run 2: reverse question rebuilt from real words

Change: the reverse-string generator now glues 8 real words together (about 50 letters, e.g. `walnutharborvelvetorangepebblekettlebridge`) instead of random consonants. It is still hard for models (letter-level reversal of long strings) but passes the filter. The unit test now also checks the string is at least 40 lowercase letters. The spec was updated.

All six models, same three seeds, same setup. Because the generator draws a different number of random values, **the later questions in each seed also change**, so run 2 is a fresh draw of 72 questions, not the same questions as run 1. Compare it with run 1 as a second sample, not as a controlled before/after.

| Model | Seeds 1 / 2 / 3 | At 90 s cutoff | At 30 s (game default) | Timeouts (90 s) |
| --- | --- | --- | --- | --- |
| gpt-6-astra | 19 / 22 / 21 of 24 | 62/72 = 86% | 55/72 = 76% | 7 |
| claude-fable-5-1 | 19 / 21 / 20 | 60/72 = 83% | 51/72 = 71% | 6 |
| claude-opus-5-5 | 19 / 21 / 20 | 60/72 = 83% | 57/72 = 79% | 10 |
| gpt-6-sol | 17 / 22 / 20 | 59/72 = 82% | 58/72 = 81% | 0 |
| claude-sonnet-5-5 | 16 / 20 / 20 | 56/72 = 78% | 55/72 = 76% | 9 |
| gpt-6-luna | 19 / 14 / 18 | 51/72 = 71% | 49/72 = 68% | 0 |

- **The filter problem is gone:** no model returned an empty reply. The Strings category went 28/30 across all six models (5 reverse questions per model). Opus and Fable now answer all of them (5/5); Sonnet got 3/5 and the GPT models 5/5.
- **The spread narrowed:** 71–86% across the six models, against 65–85% in run 1. Within a few points, the top five are not distinguishable at 72 questions each; luna is clearly last.
- **At the 30 s default, sol leads** (81%), because it never times out. astra is first at 90 s (86%) but drops to 76% at 30 s.
- **Primes is still 0/11** for all six models (13 timeouts); the digit-sum-of-a-power questions are second hardest (Arithmetic 29/47). Wrong answers there are estimates: on `7^875` all three Claude models answered 3334 (the key is 3325, recomputed independently), which suggests they approximate the digit sum from the number of digits instead of computing it.
- Keys: the calibrator's "possible key problem" flags were models agreeing on estimates; the unit tests and an independent recomputation confirm the keys.

Raw data for run 2: `data/run2-gpt-seed{1,2,3}/` and `data/run2-claude-seed{1,2,3}/`.

## Answer keys

Every answer key was checked: the unit tests recompute each generator independently on 300 draws, and the digit-sum, modular-power and prime keys for the questions that every model missed were recomputed outside the project (Python big integers, trial division). The calibrator's "possible key problem" flags (seeds 1–3) were all models disagreeing with a correct key.

## Caveats

- 72 questions per model over three seeds, one attempt each, two providers. A single question is about 1.4 points per model, so gaps of a few points are noise. The order astra ≥ sol > luna held on every seed, but astra vs. sol is close once timeouts are counted.
- Question numbers differ between baseline and the new run because the generators changed; the seed fixes the random draws, not the final numbers.
- The calibrator sends one plain chat request per question with no tools. A model that can run code in a real race setup would score differently.

## Side finding: a grading bug

While scaling up multiplication (answers around 10¹⁸), a unit test showed the grader accepted `answer + 1` as correct. The cause was that `normalize` in `src/grading.ts` passed whole numbers through JavaScript `Number`, which rounds above 2⁵³ (about 9 × 10¹⁵). It now keeps whole numbers as exact digit strings (only leading zeros are dropped). A first A+B run graded before the fix was discarded and re-run; the numbers above are from the fixed grader.

## Reproducing

- Baseline: generators as of commit `e4a2508` (v17) with the `--seed` option applied.
- New Expert generators: `src/generated.ts` in this change. Run the command above with `--seed 1`, `--seed 2`, `--seed 3` and `--out calibration/expert-AB-seed<N>`.
- Raw data: `data/baseline/`, `data/AB/` (seed 1), `data/AB-seed2/`, `data/AB-seed3/` (GPT models), `data/claude-seed1/`, `data/claude-seed2/`, `data/claude-seed3/` (Claude models). Each `report.md` lists every question, the key and each model's answer; `results.json` is the same in machine-readable form. No API keys are included.
- The spec (`spec-v1.md`, Expert questions) describes the new generator set.
