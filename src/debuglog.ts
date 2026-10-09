import type { ApiError, Trace } from './api';
import type { AnswerResult, Question } from './types';

/**
 * Optional, human-readable console logging of every request and response.
 * Toggled from the header (🐞 Debug). Never logs API keys: request headers are redacted.
 */
export const debugLog = { enabled: false };

const LEVEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
const MUTED = 'color:#8a7a68';
const BOLD = 'font-weight:700';

/** Who is asking what: identifies a horse, its model and provider, and the question. */
export interface LogContext {
  lane: number; // 1-based
  color: string;
  model: string;
  provider: string;
  qNo: number; // 1-based
  question: Question;
}

const shortModel = (id: string) => id.split('/').pop() || id;
const secs = (ms: number | undefined) => (ms == null ? '–' : `${(ms / 1000).toFixed(2)}s`);
const laneBadge = (color: string) => `background:${color};color:#fff;border-radius:4px;padding:1px 6px;font-weight:700`;

/** "%c Lane 2 %c DeepSeek-V4.1-Flash @ Nebius · Q8 (Hard)" plus its styles. */
function headline(ctx: LogContext, arrow: string, tail: string, tailStyle = ''): [string, ...string[]] {
  return [
    `%c${arrow}%c Lane ${ctx.lane} %c ${shortModel(ctx.model)} @ ${ctx.provider} · Q${ctx.qNo} (${LEVEL[ctx.question.difficulty]}) %c${tail}`,
    MUTED,
    laneBadge(ctx.color),
    BOLD,
    tailStyle,
  ];
}

/** One aligned "label   value" line inside a group. */
function row(label: string, value: string, valueStyle = '') {
  console.log(`%c${label.padEnd(10)}%c ${value}`, MUTED, valueStyle);
}

function formatUsage(usage: unknown): string | null {
  if (!usage || typeof usage !== 'object') return null;
  const u = usage as Record<string, unknown> & { completion_tokens_details?: { reasoning_tokens?: number } };
  const parts: string[] = [];
  if (typeof u.prompt_tokens === 'number') parts.push(`prompt ${u.prompt_tokens}`);
  const cached =
    (u as { prompt_tokens_details?: { cached_tokens?: number } }).prompt_tokens_details?.cached_tokens ??
    (u as { prompt_cache_hit_tokens?: number }).prompt_cache_hit_tokens;
  if (typeof cached === 'number') parts.push(`(cached ${cached})`);
  if (typeof u.completion_tokens === 'number') parts.push(`completion ${u.completion_tokens}`);
  const reasoning = u.completion_tokens_details?.reasoning_tokens;
  if (typeof reasoning === 'number' && reasoning > 0) parts.push(`(reasoning ${reasoning})`);
  if (typeof u.total_tokens === 'number') parts.push(`total ${u.total_tokens}`);
  return parts.length ? parts.join(' · ') : null;
}

function questionRows(ctx: LogContext) {
  const q = ctx.question;
  row('Provider', ctx.provider);
  row('Model', ctx.model);
  row('Question', `Q${ctx.qNo} (${LEVEL[q.difficulty]} · ${q.category}) ${q.question}`);
  row('Expected', q.aliases.length ? `${q.answer}   (also accepted: ${q.aliases.join(', ')})` : q.answer);
}

function textBlock(title: string, text: string) {
  if (!text) return;
  console.groupCollapsed(`%c${title} (${text.length.toLocaleString()} chars)`, MUTED);
  console.log(text);
  console.groupEnd();
}

/** One line when a request goes out. */
export function logRequest(ctx: LogContext, url: string) {
  if (!debugLog.enabled) return;
  console.log(...headline(ctx, '→', `· request sent ${url ? `to ${url}` : ''}`, MUTED));
}

/** A collapsible entry when a question is done: answer, verdict, timing, and the full exchange. */
export function logResult(ctx: LogContext, res: AnswerResult, trace?: Trace, err?: ApiError) {
  if (!debugLog.enabled) return;
  let tail: string;
  let style: string;
  if (res.timedOut) {
    tail = `· ⏱ timeout (${Math.round(res.latencyMs / 100) / 10}s)`;
    style = 'color:#5f3dc4;font-weight:700';
  } else if (res.error) {
    tail = `· ⚠ error: ${res.error}`;
    style = 'color:#b8590b;font-weight:700';
  } else if (res.correct) {
    tail = `· ✓ correct "${res.answer}" · ${secs(res.latencyMs)}${res.ttftMs != null ? ` (TTFT ${secs(res.ttftMs)})` : ''}`;
    style = 'color:#2f9e44;font-weight:700';
  } else {
    tail = `· ✗ wrong "${res.answer || '(no answer)'}" (expected "${ctx.question.answer}") · ${secs(res.latencyMs)}${res.ttftMs != null ? ` (TTFT ${secs(res.ttftMs)})` : ''}`;
    style = 'color:#c92a2a;font-weight:700';
  }
  console.groupCollapsed(...headline(ctx, '←', tail, style));

  questionRows(ctx);
  if (res.timedOut) {
    row(
      'Result',
      `⏱ timeout: cancelled after ${secs(res.latencyMs)} (counts as wrong); ` +
        (res.ttftMs != null ? `the model had started after ${secs(res.ttftMs)}` : 'no response was received'),
      style,
    );
  } else if (res.error) {
    row('Result', `⚠ ${res.error}`, style);
  } else {
    row('Answer', `"${res.answer || '(no answer)'}"  →  ${res.correct ? '✓ correct' : '✗ wrong'}`, style);
  }

  if (trace) {
    row('Endpoint', `${trace.method} ${trace.url}`);
    const status = trace.status != null ? `HTTP ${trace.status}` : '–';
    row('Response', `${status}${trace.requestId ? ` · request id ${trace.requestId}` : ''}`);
    row(
      'Timing',
      `total ${secs(res.latencyMs)} · first token ${secs(trace.firstTokenMs)} · first byte ${secs(trace.firstByteMs)} · ` +
        `${trace.streamed ? `${trace.chunks} streamed chunks` : 'not streamed'} · ` +
        `${trace.attempts} attempt${trace.attempts === 1 ? '' : 's'}`,
    );
    const usage = formatUsage(trace.usage);
    if (usage) row('Tokens', usage);
    else if (res.tokens?.out != null) {
      row('Tokens', `~in ${res.tokens.in ?? '–'} · ~out ${res.tokens.out} (estimated from text length; provider sent no usage)`);
    }
    if (trace.finishReason) {
      row(
        'Finish',
        trace.finishReason === 'length' ? `${trace.finishReason} (cut off: hit the token limit)` : trace.finishReason,
        trace.finishReason === 'length' ? 'color:#c92a2a' : '',
      );
    }
    console.groupCollapsed('%cRequest (headers and body)', MUTED);
    console.log('Headers', trace.requestHeaders);
    console.log('Body', trace.requestBody);
    console.groupEnd();
  }
  if (err) {
    if (err.debug.url) row('Endpoint', `${err.debug.method ?? 'POST'} ${err.debug.url}`);
    if (err.debug.status) row('Response', `HTTP ${err.debug.status}`);
    if (err.debug.body) textBlock('Response body', err.debug.body);
    if (err.debug.cause) console.log('Cause', err.debug.cause);
  }
  // On a timeout these hold whatever arrived before the cutoff.
  textBlock(res.timedOut ? 'Partial reasoning (cut off)' : 'Reasoning', res.reasoning);
  textBlock(res.timedOut ? 'Partial reply (cut off)' : 'Reply', res.raw);
  console.groupEnd();
}

export interface RaceStartInfo {
  horses: { lane: number; color: string; provider: string; model: string; baseUrl: string }[];
  questions: Question[];
  distance: number;
  levels: string;
  timeLimitSec: number | null;
}

export function logRaceStart(info: RaceStartInfo) {
  if (!debugLog.enabled) return;
  console.group(`%c🏁 LLM Derby · race started`, 'font-size:13px;font-weight:800');
  row('Horses', String(info.horses.length));
  for (const h of info.horses) {
    console.log(`%c Lane ${h.lane} %c ${h.model} @ ${h.provider} %c${h.baseUrl}`, laneBadge(h.color), BOLD, MUTED);
  }
  row('Finish', `${info.distance} correct answers`);
  row('Questions', `${info.questions.length} (${info.levels})`);
  row('Time limit', info.timeLimitSec == null ? 'off' : `${info.timeLimitSec}s per question`);
  console.groupCollapsed('%cQuestion list', MUTED);
  console.table(
    info.questions.map((q, i) => ({ no: i + 1, difficulty: q.difficulty, category: q.category, question: q.question, answer: q.answer })),
  );
  console.groupEnd();
  console.groupEnd();
}

export interface RaceEndInfo {
  headline: string;
  durationMs: number;
  standings: Record<string, unknown>[];
}

export function logRaceEnd(info: RaceEndInfo) {
  if (!debugLog.enabled) return;
  console.group(`%c🏆 LLM Derby · race over: ${info.headline}`, 'font-size:13px;font-weight:800');
  row('Duration', secs(info.durationMs));
  console.table(info.standings);
  console.groupEnd();
}
