// Focused, one-off debugging of a single question sent to a few models.
//
// For every (model, run) it prints the full raw reply, the separated reasoning,
// the extracted short answer, the grade against the answer key, timing, finish
// reason and token usage. It uses the same system prompt and grading as the app
// (src/prompt.ts, src/grading.ts) and streams the reply the same way src/api.ts
// does, so what you see matches a race.
//
//   npm run debug -- --id 123 --models a,b
//   npm run debug -- --question "Capital of France?" --answer Paris --models a,b
//   npm run debug -- --file one-question.json --models a,b --repeats 3
//
// Options:
//   --id N            question id from src/questions.json
//   --question TEXT   inline question (needs --answer; optional --aliases a,b)
//   --answer TEXT     accepted answer key (use with --question)
//   --aliases a,b     extra accepted spellings (use with --question)
//   --file PATH       JSON file: one question object or an array of them
//   --models a,b      model IDs to ask (required)
//   --repeats N       ask each model N times (default 1)
//   --provider ID     provider preset id (default nebius); use sim to run offline
//   --base-url URL    override the provider's base URL
//   --key-env NAME    environment variable holding the key (default: per provider)
//
// Keys come from the environment (see .env.example); load them with
// `set -a; . ./.env; set +a`. The key is never printed.
//
// Node scripts here import only the app's pure modules (see scripts/calibrate.mts);
// src/api.ts is browser-only (Vite resolves its imports, Node does not), so this
// script speaks the same OpenAI-compatible protocol itself.
import { readFileSync } from 'node:fs';
import { SYSTEM_PROMPT } from '../src/prompt.ts';
import { extractFinalAnswer, isCorrect, splitThinking } from '../src/grading.ts';
import { providerById } from '../src/providers.ts';
import type { Difficulty, Provider, Question } from '../src/types.ts';

const KEY_ENV: Record<string, string> = {
  nebius: 'NEBIUS_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  together: 'TOGETHER_API_KEY',
  groq: 'GROQ_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  deepinfra: 'DEEPINFRA_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  huggingface: 'HF_TOKEN',
  gmi: 'GMI_API_KEY',
  baseten: 'BASETEN_API_KEY',
  custom: 'CUSTOM_API_KEY',
};

const TIMEOUT_MS = 120_000;

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1]?.startsWith('--') ? 'true' : (process.argv[++i] ?? 'true'));
}

function fail(msg: string): never {
  console.error(msg);
  console.error('Usage: npm run debug -- (--id N | --question "…" --answer "…" | --file PATH) --models a,b [options]');
  process.exit(1);
}

if (args.has('help')) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 24).join('\n'));
  process.exit(0);
}

const provider: Provider = providerById(args.get('provider') ?? 'nebius');
const baseUrl = (args.get('base-url') ?? provider.baseUrl).replace(/\/+$/, '');
const keyEnv = args.get('key-env') ?? KEY_ENV[provider.id] ?? 'API_KEY';
const apiKey = process.env[keyEnv] ?? '';

const models = (args.get('models') ?? '')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
if (!models.length) fail('No models given. Pass --models model-a,model-b');
if (!provider.simulated && !apiKey) fail(`${keyEnv} is not set. Load your keys first: set -a; . ./.env; set +a`);
if (provider.editableUrl && !args.get('base-url')) fail('This provider needs --base-url, e.g. --base-url https://api.example.com/v1');

function loadQuestions(): Question[] {
  const file = args.get('file');
  if (file) {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const list = (Array.isArray(parsed) ? parsed : [parsed]) as Question[];
    for (const q of list) if (!q.question || q.answer == null) fail(`${file}: every entry needs "question" and "answer"`);
    return list;
  }
  if (args.has('question')) {
    const answer = args.get('answer');
    if (!answer) fail('--question needs --answer (the accepted answer key).');
    return [
      {
        id: 0,
        category: args.get('category') ?? 'debug',
        difficulty: (args.get('difficulty') ?? 'medium') as Difficulty,
        question: args.get('question')!,
        answer,
        aliases: (args.get('aliases') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      },
    ];
  }
  if (args.has('id')) {
    const id = Number(args.get('id'));
    const bank = JSON.parse(readFileSync(new URL('../src/questions.json', import.meta.url), 'utf8')) as Question[];
    const q = bank.find((x) => x.id === id);
    if (!q) fail(`No question with id ${id} in src/questions.json`);
    return [q];
  }
  return fail('Give a question with --id N, --question "…" --answer "…", or --file PATH');
}

// ---- The request itself: OpenAI-compatible chat completions, streamed. ----

interface TokenUsage {
  in?: number;
  out?: number;
  reasoning?: number;
  estimated: boolean;
}

interface Attempt {
  content: string;
  reasoning: string;
  latencyMs: number;
  ttftMs?: number;
  finishReason?: string;
  requestId?: string;
  tokens: TokenUsage;
}

const estimate = (text: string) => Math.ceil(text.length / 4);

async function askOnce(model: string, q: Question): Promise<Attempt> {
  if (provider.simulated) return simulate(model, q);

  const t0 = performance.now();
  const body = {
    model,
    stream: true,
    stream_options: { include_usage: true },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: q.question },
    ],
  };
  const url = `${baseUrl}/chat/completions`;
  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...(provider.extraHeaders?.(apiKey) ?? {}),
  };

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text();
      // Some providers reject stream_options: retry once without it.
      if (res.status === 400 && body.stream_options) {
        delete (body as { stream_options?: unknown }).stream_options;
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      const detail = (() => {
        try {
          const j = JSON.parse(text);
          const d = j?.error?.message ?? j?.error ?? j?.message ?? j?.detail;
          return typeof d === 'string' ? d : JSON.stringify(d);
        } catch {
          return text.slice(0, 240);
        }
      })();
      throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}\n${text.slice(0, 1000)}`);
    }

    let content = '';
    let reasoning = '';
    let ttftMs: number | undefined;
    let finishReason: string | undefined;
    let usage: Record<string, unknown> | undefined;
    const requestId =
      res.headers.get('x-request-id') ?? res.headers.get('x-gmi-request-id') ?? res.headers.get('request-id') ?? undefined;
    const take = (delta: Record<string, unknown>) => {
      const parts = delta.content;
      if (typeof parts === 'string') content += parts;
      else if (Array.isArray(parts)) {
        for (const p of parts) {
          if (p?.type === 'thinking') reasoning += str(p.thinking);
          else content += str(p?.text);
        }
      }
      reasoning += str(delta.reasoning_content) || str(delta.reasoning);
    };

    const ct = res.headers.get('content-type') ?? '';
    if (!res.body || ct.includes('application/json')) {
      const j = await res.json();
      if (j?.error) throw new Error(str(j.error.message) || JSON.stringify(j.error));
      take(j?.choices?.[0]?.message ?? {});
      usage = j?.usage;
      finishReason = j?.choices?.[0]?.finish_reason;
    } else {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const handle = (line: string) => {
        if (!line.startsWith('data:')) return;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') return;
        let j;
        try {
          j = JSON.parse(data);
        } catch {
          return;
        }
        if (j?.error) throw new Error(str(j.error.message) || JSON.stringify(j.error));
        if (j?.usage && Object.values(j.usage).some((v) => typeof v === 'number' && v > 0)) usage = j.usage;
        finishReason = j?.choices?.[0]?.finish_reason ?? finishReason;
        const delta = j?.choices?.[0]?.delta ?? j?.choices?.[0]?.message;
        if (!delta) return;
        take(delta);
        if (ttftMs == null && (content || reasoning)) ttftMs = performance.now() - t0;
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          handle(buf.slice(0, nl).trim());
          buf = buf.slice(nl + 1);
        }
      }
      handle(buf.trim());
    }

    const u = (usage ?? {}) as {
      prompt_tokens?: number;
      completion_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    };
    const prompt = SYSTEM_PROMPT + q.question;
    const tokens: TokenUsage =
      typeof u.completion_tokens === 'number'
        ? { in: u.prompt_tokens, out: u.completion_tokens, reasoning: u.completion_tokens_details?.reasoning_tokens, estimated: false }
        : { in: estimate(prompt), out: estimate(content) + estimate(reasoning), reasoning: estimate(reasoning), estimated: true };

    return { content, reasoning, latencyMs: performance.now() - t0, ttftMs, finishReason, requestId, tokens };
  }
}

const str = (x: unknown) => (typeof x === 'string' ? x : '');

/** Offline stand-in so the script can be smoke-tested without keys. */
async function simulate(model: string, q: Question): Promise<Attempt> {
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, 200));
  const good = !/wildcard|sprinter/.test(model);
  const answer = good ? q.answer : 'Atlantis';
  const reasoning = `Simulated reasoning for ${model}: the question asks "${q.question}".`;
  const content = `I'm fairly confident about this one.\nANSWER: ${answer}`;
  return {
    content,
    reasoning,
    latencyMs: performance.now() - t0,
    ttftMs: 200,
    finishReason: 'stop',
    tokens: { in: estimate(SYSTEM_PROMPT + q.question), out: estimate(content + reasoning), reasoning: estimate(reasoning), estimated: true },
  };
}

// ---- Run and print ----

const questions = loadQuestions();
const repeats = Math.max(1, Number(args.get('repeats') ?? 1) || 1);
const LEVEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
const secs = (ms: number | undefined) => (ms == null ? '–' : `${(ms / 1000).toFixed(2)}s`);
const row = (label: string, value: string) => console.log(`  ${label.padEnd(10)} ${value}`);
const block = (label: string, text: string) => {
  console.log(`  ${label}:`);
  console.log(text.trim() ? text.trimEnd() : '    (none)');
  console.log();
};

console.log('LLM Derby · question debug');
row('Provider', `${provider.name}${baseUrl ? ` (${baseUrl})` : ''}`);
row('Models', models.join(', '));
row('Repeats', String(repeats));
row('Questions', String(questions.length));

const outcomes: { model: string; correct: boolean; latencyMs: number }[] = [];

for (const q of questions) {
  console.log();
  console.log(`Question ${q.id ? `#${q.id} ` : ''}(${LEVEL[q.difficulty] ?? q.difficulty} · ${q.category})`);
  row('Text', q.question);
  row('Key', `${q.answer}${q.aliases.length ? `   (also accepted: ${q.aliases.join(', ')})` : ''}`);

  for (const model of models) {
    for (let run = 1; run <= repeats; run++) {
      console.log();
      const title = `${model}${repeats > 1 ? ` · run ${run}/${repeats}` : ''}`;
      console.log(`── ${title} ${'─'.repeat(Math.max(0, 48 - title.length))}`);
      try {
        const out = await askOnce(model, q);
        const { reply, thinking } = splitThinking(out.content);
        const answer = extractFinalAnswer(reply);
        const correct = isCorrect(answer, [q.answer, ...q.aliases]);
        const reasoning = [out.reasoning.trim(), thinking].filter(Boolean).join('\n\n');
        outcomes.push({ model, correct, latencyMs: out.latencyMs });

        row('Verdict', correct ? '✓ correct' : '✗ wrong');
        row('Answer', answer ? `"${answer}"` : '(no answer)');
        row('Expected', q.answer);
        row('Latency', `${secs(out.latencyMs)}${out.ttftMs != null ? `  (TTFT ${secs(out.ttftMs)})` : ''}`);
        if (out.finishReason) row('Finish', out.finishReason === 'length' ? 'length (cut off: hit the token limit)' : out.finishReason);
        row(
          'Tokens',
          `${out.tokens.in ?? '–'} in · ${out.tokens.out ?? '–'} out${out.tokens.reasoning ? ` (${out.tokens.reasoning} reasoning)` : ''}${out.tokens.estimated ? ' (estimated)' : ''}`,
        );
        if (out.requestId) row('Request id', out.requestId);
        console.log();
        block('Reasoning', reasoning);
        block('Reply', reply);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const [first, ...rest] = msg.split('\n');
        row('Verdict', '⚠ error');
        row('Error', first);
        if (rest.join('\n').trim()) block('Response body', rest.join('\n'));
      }
    }
  }
}

console.log('Summary');
const byModel = new Map<string, { model: string; correct: boolean; latencyMs: number }[]>();
for (const o of outcomes) byModel.set(o.model, [...(byModel.get(o.model) ?? []), o]);
for (const [model, os] of byModel) {
  const correct = os.filter((o) => o.correct).length;
  const med = os.map((o) => o.latencyMs).sort((a, b) => a - b)[Math.floor(os.length / 2)];
  console.log(`  ${model.padEnd(36)} ${correct}/${os.length} correct   median ${secs(med)}`);
}
