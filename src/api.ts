import type { Endpoint, Question } from './types';
import { SYSTEM_PROMPT } from './prompt';

export { SYSTEM_PROMPT };

export const REQUEST_TIMEOUT_MS = 180_000;
const MAX_RETRIES = 2;

/** Context for debugging a failed request. Never contains the API key. */
export interface ErrorDebug {
  provider?: string;
  model?: string;
  method?: string;
  url?: string;
  status?: number;
  /** Raw response body (or the error chunk from a stream). */
  body?: string;
  question?: string;
  /** Original exception, e.g. the browser's TypeError for CORS blocks. */
  cause?: unknown;
}

export class ApiError extends Error {
  debug: ErrorDebug = {};
  /** Whatever streamed in before the request was cancelled (e.g. by the time limit). */
  partial?: { content: string; reasoning: string; trace: Trace; tokens: TokenUsage };

  constructor(
    message: string,
    public status = 0,
    /** Worth retrying (rate limit, server error, network blip). */
    public retryable = false,
    /** Will fail for every question (bad key, unknown model). */
    public fatal = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Token counts for one answer. `estimated` when the provider didn't report usage. */
export interface TokenUsage {
  in?: number;
  /** Part of `in` served from the provider's prompt cache, when reported. */
  cached?: number;
  out?: number;
  /** Part of `out` spent on reasoning, when the provider reports it. */
  reasoning?: number;
  estimated: boolean;
}

/** Rough token estimate (~4 characters per token) when a provider reports no usage. */
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/** Reported usage if the provider sent it, otherwise an estimate from the text. */
export function tokenUsage(usage: unknown, prompt: string, content: string, reasoning: string): TokenUsage {
  const u = (usage ?? {}) as Record<string, unknown> & {
    completion_tokens_details?: { reasoning_tokens?: unknown };
    prompt_tokens_details?: { cached_tokens?: unknown };
  };
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
  const out = num(u.completion_tokens);
  if (out != null) {
    return {
      in: num(u.prompt_tokens),
      // Standard OpenAI field, or the DeepSeek-style one some models/providers send instead.
      cached: num(u.prompt_tokens_details?.cached_tokens) ?? num(u.prompt_cache_hit_tokens),
      out,
      reasoning: num(u.completion_tokens_details?.reasoning_tokens),
      estimated: false,
    };
  }
  if (!content && !reasoning) return { estimated: true };
  return {
    in: estimateTokens(prompt),
    out: estimateTokens(content) + estimateTokens(reasoning),
    reasoning: reasoning ? estimateTokens(reasoning) : undefined,
    estimated: true,
  };
}

/** Cost of one answer in USD; undefined when there's no price or no token counts. */
export function answerCost(tokens: TokenUsage | undefined, price: Pricing | undefined): number | undefined {
  if (!tokens || !price || tokens.out == null) return undefined;
  const input = tokens.in ?? 0;
  const cached = Math.min(tokens.cached ?? 0, input);
  return (input - cached) * price.inPerTok + cached * (price.cacheReadPerTok ?? price.inPerTok) + tokens.out * price.outPerTok;
}

/** Base URLs that rejected `stream_options`; we stop sending it to them. */
const noStreamOptions = new Set<string>();

export interface AskResult {
  content: string;
  reasoning: string;
  latencyMs: number;
  tokens: TokenUsage;
  /** Time to first token (reasoning or answer). Undefined when the reply wasn't streamed. */
  ttftMs?: number;
  trace: Trace;
}

/** What happened on the wire for one question, for debug logging. Never holds the API key. */
export interface Trace {
  method: string;
  url: string;
  /** Request headers with the key redacted. */
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  status?: number;
  /** Time until response headers arrived. */
  firstByteMs?: number;
  /** Time until the first streamed token (reasoning or answer). */
  firstTokenMs?: number;
  /** Streamed chunks received (0 when the provider returned plain JSON). */
  chunks: number;
  streamed: boolean;
  usage?: unknown;
  finishReason?: string;
  /** Provider request id, when the provider exposes one to browsers. */
  requestId?: string;
  attempts: number;
}

/** Headers as they'd be logged: secrets replaced. */
function redact(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    out[k] = /^(authorization|x-api-key)$/i.test(k) ? (k.toLowerCase() === 'authorization' ? 'Bearer ••••' : '••••') : v;
  }
  return out;
}

export type Phase = 'thinking' | 'answering' | 'retrying';
export type OnText = (text: string, phase: Phase) => void;

const str = (x: unknown): string => (typeof x === 'string' ? x : '');

function headers(ep: Endpoint, json: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (ep.apiKey) h['Authorization'] = `Bearer ${ep.apiKey}`;
  return { ...h, ...(ep.provider.extraHeaders?.(ep.apiKey) ?? {}) };
}

function endpointUrl(ep: Endpoint, path: string): string {
  const base = ep.baseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) {
    throw new ApiError('Enter a base URL first, e.g. https://api.example.com/v1', 0, false, true);
  }
  return base + path;
}

/** Parse a JSON body, with a clear message when the server returned a web page instead. */
async function readJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const looksHtml = /^\s*</.test(text);
    const err = new ApiError(
      looksHtml
        ? 'Got a web page instead of JSON: check the base URL (it usually ends in /v1)'
        : 'Invalid JSON in response',
    );
    err.debug.body = text.slice(0, 4000);
    throw err;
  }
}

async function httpError(res: Response): Promise<ApiError> {
  let detail = '';
  let body = '';
  try {
    const text = await res.text();
    body = text;
    try {
      const j = JSON.parse(text);
      const d = j?.error?.message ?? j?.error ?? j?.message ?? j?.detail ?? text;
      detail = typeof d === 'string' ? d : JSON.stringify(d);
    } catch {
      detail = text;
    }
  } catch {
    /* body unreadable */
  }
  const s = res.status;
  const msg = `HTTP ${s}${detail ? `: ${detail.slice(0, 240)}` : ''}`;
  const err = new ApiError(msg, s, s === 429 || s >= 500, s === 401 || s === 403 || s === 404);
  err.debug = { status: s, body: body.slice(0, 4000) };
  return err;
}

function toApiError(e: unknown, signal?: AbortSignal): ApiError {
  if (e instanceof ApiError) return e;
  let err: ApiError;
  const name = (e as { name?: string })?.name;
  if (signal?.aborted) err = new ApiError('Cancelled');
  else if (name === 'TimeoutError' || name === 'AbortError') err = new ApiError(`Timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
  else if (name === 'SyntaxError') err = new ApiError('Invalid JSON in response');
  else err = new ApiError('Network error: request blocked (CORS) or offline', 0, true);
  err.debug.cause = e;
  return err;
}

/** Attach request context to an error (existing fields win). */
function withContext(err: ApiError, ctx: ErrorDebug): ApiError {
  err.debug = { ...ctx, ...err.debug };
  return err;
}

const LOG_PREFIX = '[LLM Derby]';

/** Multi-line summary for tooltips. */
export function describeError(e: unknown): string {
  const err = e instanceof ApiError ? e : toApiError(e);
  const d = err.debug;
  const lines = [err.message];
  if (d.provider || d.model) lines.push([d.provider, d.model].filter(Boolean).join(' · '));
  if (d.url) lines.push(`${d.method ?? 'GET'} ${d.url}`);
  if (err.status === 0 && err.retryable) {
    lines.push('Network errors are often CORS blocks or a wrong base URL; the console shows the browser’s exact reason.');
  }
  lines.push('See the browser console (F12) for full details.');
  return lines.join('\n');
}

/** Log an error with its debug context to the console. */
export function logError(label: string, e: unknown, extra: Record<string, unknown> = {}) {
  const err = e instanceof ApiError ? e : toApiError(e);
  console.error(`${LOG_PREFIX} ${label}: ${err.message}`, { ...err.debug, ...extra, retryable: err.retryable, fatal: err.fatal });
}

const NON_CHAT_ID =
  /(embed|whisper|tts|dall-e|text-to-|flux|stable-diffusion|sdxl|rerank|moderation|transcribe|audio|speech|imagen|veo-|guard)/i;
const NON_CHAT_TYPE = /^(embed|image|rerank|moderation|audio|speech|transcri|tts|video)/i;

interface ModelRow {
  id: string;
  type: string;
  owned_by: string;
  shown: boolean;
  reason: string;
}

/** Why a model would be hidden from the picker ('' = shown). */
function hideReason(id: string, type: string): string {
  if (!id) return 'no id';
  const m = id.match(NON_CHAT_ID);
  if (m) return `name contains "${m[1]}"`;
  if (NON_CHAT_TYPE.test(type)) return `type "${type}"`;
  return '';
}

/** Log a model listing as a collapsible console group so it can be inspected. */
function logModelListing(provider: string, url: string, raw: unknown, rows: ModelRow[], ms: number) {
  const shown = rows.filter((r) => r.shown);
  const hidden = rows.filter((r) => !r.shown);
  console.groupCollapsed(
    `${LOG_PREFIX} ${provider}: ${rows.length} models listed → ${shown.length} shown, ${hidden.length} hidden (${Math.round(ms)} ms)`,
  );
  console.log('Request:', `GET ${url}`);
  const shape = Array.isArray(raw) ? 'top-level array' : raw && typeof raw === 'object' ? `object with keys: ${Object.keys(raw).join(', ')}` : typeof raw;
  console.log('Response shape:', shape);
  console.log('All models (shown = available in the picker):');
  console.table(rows);
  if (hidden.length) {
    console.log('Hidden models:');
    console.table(hidden.map(({ id, type, reason }) => ({ id, type, reason })));
  }
  console.log('Raw response:', raw);
  console.groupEnd();
}

/** Price per token in USD, from a provider's model list. */
export interface Pricing {
  inPerTok: number;
  outPerTok: number;
  /** Price for cached input tokens, when the provider lists one. */
  cacheReadPerTok?: number;
}

/**
 * Read a model's price from its listing, when the provider publishes one:
 * OpenRouter / GMI style `pricing.prompt` / `pricing.completion` (USD per token, as strings),
 * or Together style `pricing.input` / `pricing.output` (USD per 1M tokens).
 */
export function parsePricing(model: unknown): Pricing | undefined {
  const p = (model as { pricing?: Record<string, unknown> } | null)?.pricing;
  if (!p || typeof p !== 'object') return undefined;
  const n = (x: unknown) => {
    const v = typeof x === 'string' || typeof x === 'number' ? Number(x) : NaN;
    return Number.isFinite(v) && v >= 0 ? v : undefined; // OpenRouter uses -1 for "varies"
  };
  if (p.prompt != null && p.completion != null) {
    const inP = n(p.prompt);
    const outP = n(p.completion);
    if (inP == null || outP == null) return undefined;
    return { inPerTok: inP, outPerTok: outP, cacheReadPerTok: n(p.input_cache_read) };
  }
  if (p.input != null && p.output != null) {
    const inP = n(p.input);
    const outP = n(p.output);
    if (inP == null || outP == null) return undefined;
    return { inPerTok: inP / 1e6, outPerTok: outP / 1e6 };
  }
  return undefined;
}

export interface ModelList {
  ids: string[];
  /** Prices by model ID, for models whose listing includes one. */
  pricing: Record<string, Pricing>;
}

/** List chat-capable models (and any published prices) for a provider. The listing is logged to the console. */
export async function listModels(ep: Endpoint): Promise<ModelList> {
  if (ep.provider.simulated) {
    const ids = Object.keys(SIM_PROFILES);
    const rows = ids.map((id) => ({ id, type: 'simulated', owned_by: 'sim', shown: true, reason: '' }));
    logModelListing(ep.provider.name, '(no request: simulated)', SIM_PROFILES, rows, 0);
    return { ids, pricing: {} };
  }
  let url = '';
  let j;
  const t0 = performance.now();
  try {
    url = endpointUrl(ep, `/models${ep.provider.modelsQuery ?? ''}`);
    console.info(`${LOG_PREFIX} ${ep.provider.name}: loading models from ${url}`);
    const res = await fetch(url, { headers: headers(ep, false), signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw await httpError(res);
    j = await readJson(res);
  } catch (e) {
    const err = toApiError(e);
    // A 404/405 on /models usually means the base URL is missing its version path.
    if ((err.status === 404 || err.status === 405) && !/\/v\d+$/.test(ep.baseUrl.trim().replace(/\/+$/, ''))) {
      err.message += ' (the base URL usually ends in /v1)';
    }
    throw withContext(err, { provider: ep.provider.name, method: 'GET', url });
  }
  const arr: unknown[] = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : [];
  const seen = new Set<string>();
  const pricing: Record<string, Pricing> = {};
  const rows: ModelRow[] = arr.map((m) => {
    const o = (typeof m === 'object' && m) || {};
    const id = typeof m === 'string' ? m : str((o as { id?: unknown }).id) || str((o as { name?: unknown }).name);
    const type = str((o as { type?: unknown }).type);
    // Only hide models that are clearly not chat models; unknown types are kept.
    let reason = hideReason(id, type);
    if (!reason && seen.has(id)) reason = 'duplicate';
    seen.add(id);
    const price = parsePricing(m);
    if (price && !reason) pricing[id] = price;
    return { id, type, owned_by: str((o as { owned_by?: unknown }).owned_by), shown: !reason, reason };
  });
  logModelListing(ep.provider.name, url, j, rows, performance.now() - t0);
  return { ids: rows.filter((r) => r.shown).map((r) => r.id).sort((a, b) => a.localeCompare(b)), pricing };
}

/** Split an OpenAI content field, which may be a string or Mistral-style typed parts. */
function contentParts(c: unknown): { text: string; thinking: string } {
  if (typeof c === 'string') return { text: c, thinking: '' };
  let text = '';
  let thinking = '';
  if (Array.isArray(c)) {
    for (const p of c) {
      if (p?.type === 'thinking') {
        thinking += Array.isArray(p.thinking) ? p.thinking.map((t: { text?: unknown }) => str(t?.text)).join('') : str(p.thinking);
      } else text += str(p?.text);
    }
  }
  return { text, thinking };
}

/** One chat completion, streamed. Latency covers the whole request including reasoning. */
async function askOnce(ep: Endpoint, model: string, q: Question, signal: AbortSignal, onText: OnText): Promise<AskResult> {
  if (ep.provider.simulated) return simulate(model, q, signal, onText);
  const t0 = performance.now();
  // Ask for token usage in the stream (OpenAI's stream_options), unless this endpoint rejected it before.
  const endpointKey = ep.baseUrl.trim();
  const withUsage = !noStreamOptions.has(endpointKey);
  const body = {
    model,
    stream: true,
    ...(withUsage ? { stream_options: { include_usage: true } } : {}),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: q.question },
    ],
  };
  const promptText = SYSTEM_PROMPT + q.question;
  const reqSignal = AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
  let url = '';
  const reqHeaders = headers(ep, true);
  const trace: Trace = {
    method: 'POST',
    url: '',
    requestHeaders: redact(reqHeaders),
    requestBody: body,
    chunks: 0,
    streamed: false,
    attempts: 1,
  };
  let content = '';
  let reasoning = '';
  const take = (msg: Record<string, unknown>) => {
    const p = contentParts(msg.content);
    content += p.text;
    // Some servers send both fields with the same text, so prefer one.
    reasoning += p.thinking + (str(msg.reasoning_content) || str(msg.reasoning));
  };
  try {
    url = endpointUrl(ep, '/chat/completions');
    trace.url = url;
    const res = await fetch(url, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(body),
      signal: reqSignal,
    });
    trace.status = res.status;
    trace.firstByteMs = performance.now() - t0;
    trace.requestId =
      res.headers.get('x-request-id') ?? res.headers.get('x-gmi-request-id') ?? res.headers.get('request-id') ?? undefined;
    if (!res.ok) {
      const err = await httpError(res);
      // Some providers reject stream_options (not always saying so). Retry once without it, and keep
      // that rule for the endpoint only if the retry succeeds, i.e. stream_options was the problem.
      if (res.status === 400 && withUsage) {
        noStreamOptions.add(endpointKey);
        try {
          const out = await askOnce(ep, model, q, signal, onText);
          console.info(`${LOG_PREFIX} ${ep.provider.name} rejected stream_options; sending without it from now on (token counts may be estimated).`);
          return out;
        } catch (retryErr) {
          noStreamOptions.delete(endpointKey);
          throw retryErr;
        }
      }
      throw err;
    }

    if (!res.body || (res.headers.get('content-type') ?? '').includes('application/json')) {
      // Provider ignored stream: true.
      const j = await readJson(res);
      if (j?.error) throw streamError(j);
      take(j?.choices?.[0]?.message ?? {});
      trace.usage = j?.usage ?? undefined;
      trace.finishReason = j?.choices?.[0]?.finish_reason ?? undefined;
    } else {
      trace.streamed = true;
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
        if (j?.error) throw streamError(j);
        trace.chunks++;
        // Usage and finish reason usually arrive on the last chunks; keep the latest non-empty values.
        if (j?.usage && Object.values(j.usage).some((v) => typeof v === 'number' && v > 0)) trace.usage = j.usage;
        trace.finishReason = j?.choices?.[0]?.finish_reason ?? trace.finishReason;
        const delta = j?.choices?.[0]?.delta ?? j?.choices?.[0]?.message;
        if (!delta) return;
        take(delta);
        if (trace.firstTokenMs == null && (content || reasoning)) trace.firstTokenMs = performance.now() - t0;
        onText(content || reasoning, content ? 'answering' : 'thinking');
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
  } catch (e) {
    const err = withContext(toApiError(e, signal), { provider: ep.provider.name, model, method: 'POST', url, question: q.question });
    err.partial = { content, reasoning, trace, tokens: tokenUsage(undefined, promptText, content, reasoning) };
    throw err;
  }
  return {
    content,
    reasoning,
    latencyMs: performance.now() - t0,
    ttftMs: trace.firstTokenMs,
    tokens: tokenUsage(trace.usage, promptText, content, reasoning),
    trace,
  };
}

/** Error object returned inside a 200 response or stream chunk. */
function streamError(j: { error: { message?: unknown } }): ApiError {
  const err = new ApiError((str(j.error.message) || JSON.stringify(j.error)).slice(0, 240));
  err.debug.body = JSON.stringify(j).slice(0, 4000);
  return err;
}

/** Ask with retries on rate limits / server errors. Latency is from the successful attempt. */
export async function ask(ep: Endpoint, model: string, q: Question, signal: AbortSignal, onText: OnText): Promise<AskResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      const out = await askOnce(ep, model, q, signal, onText);
      out.trace.attempts = attempt + 1;
      return out;
    } catch (e) {
      const err = toApiError(e, signal);
      if (signal.aborted || !err.retryable || attempt >= MAX_RETRIES) throw err;
      console.warn(`${LOG_PREFIX} ${ep.provider.name} · ${model}: attempt ${attempt + 1} failed, retrying: ${err.message}`, err.debug);
      onText(`${err.message}. Retrying…`, 'retrying');
      await sleep(1000 * 2 ** attempt, signal);
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ApiError('Cancelled'));
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new ApiError('Cancelled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// ---- Simulated provider: for offline demos and testing the UI without keys ----

interface SimProfile {
  min: number;
  max: number;
  accuracy: number;
  errorRate?: number;
}

export const SIM_PROFILES: Record<string, SimProfile> = {
  'sim/sprinter': { min: 500, max: 1600, accuracy: 0.7 },
  'sim/scholar': { min: 2200, max: 4200, accuracy: 0.97 },
  'sim/steady': { min: 1100, max: 2400, accuracy: 0.85 },
  'sim/wildcard': { min: 300, max: 5000, accuracy: 0.78 },
  'sim/flaky': { min: 700, max: 2200, accuracy: 0.85, errorRate: 0.12 },
};

const WRONG = ['Atlantis', 'Narnia', 'Gondor', 'Wakanda', '9999', 'Unobtainium', 'Hogwarts', 'Bikini Bottom', 'Zanzibar Prime'];

async function simulate(model: string, q: Question, signal: AbortSignal, onText: OnText): Promise<AskResult> {
  const p = SIM_PROFILES[model] ?? SIM_PROFILES['sim/steady'];
  const t0 = performance.now();
  const total = p.min + Math.random() * (p.max - p.min);
  const reasoning = `The question asks: "${q.question}" Let me recall the relevant facts and double-check before answering.`;
  const steps = 10;
  let ttftMs: number | undefined;
  let soFar = '';
  const simTrace = (): Trace => ({
    method: 'SIMULATED',
    url: '(no network request)',
    requestHeaders: {},
    requestBody: { model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: q.question }] },
    status: 200,
    firstTokenMs: ttftMs,
    chunks: soFar ? Math.round((soFar.length / reasoning.length) * steps) : 0,
    streamed: true,
    attempts: 1,
  });
  try {
    for (let i = 1; i <= steps; i++) {
      await sleep((total * 0.85) / steps, signal);
      ttftMs ??= performance.now() - t0;
      soFar = reasoning.slice(0, Math.round((reasoning.length * i) / steps));
      onText(soFar, 'thinking');
    }
  } catch (e) {
    if (e instanceof ApiError) {
      e.partial = { content: '', reasoning: soFar, trace: simTrace(), tokens: tokenUsage(undefined, SYSTEM_PROMPT + q.question, '', soFar) };
    }
    throw e;
  }
  if (p.errorRate && Math.random() < p.errorRate) {
    const err = new ApiError('HTTP 503: simulated overload', 503, true);
    err.debug = { provider: 'Simulated', model, status: 503, body: '{"error":{"message":"simulated overload"}}', question: q.question };
    throw err;
  }
  const ans = Math.random() < p.accuracy ? q.answer : WRONG[Math.floor(Math.random() * WRONG.length)];
  await sleep(total * 0.15, signal);
  const content = `I'm fairly confident about this one.\nANSWER: ${ans}`;
  onText(content, 'answering');
  const trace: Trace = { ...simTrace(), chunks: steps, finishReason: 'stop' };
  const tokens = tokenUsage(undefined, SYSTEM_PROMPT + q.question, content, reasoning);
  return { content, reasoning, latencyMs: performance.now() - t0, ttftMs, tokens, trace };
}
