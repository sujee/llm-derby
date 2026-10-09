/** 'easy' | 'medium' | 'hard' come from the question bank; 'expert' questions are generated at race time. */
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface Question {
  id: number;
  category: string;
  difficulty: Difficulty;
  question: string;
  /** Display answer; also accepted when grading. */
  answer: string;
  /** Other accepted spellings / forms. */
  aliases: string[];
}

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  /** Where to get an API key. */
  keyUrl?: string;
  note?: string;
  /** Extra request headers (e.g. Anthropic's browser-access opt-in). */
  extraHeaders?: (apiKey: string) => Record<string, string>;
  /** Base URL is entered by the user. */
  editableUrl?: boolean;
  /** No API key needed. */
  noKey?: boolean;
  /** Fake provider that never touches the network. */
  simulated?: boolean;
  /** Extra query string for the model list, e.g. "?verbose=true" to include prices. */
  modelsQuery?: string;
}

export interface Endpoint {
  provider: Provider;
  baseUrl: string;
  apiKey: string;
}

export interface AnswerResult {
  questionIndex: number;
  /** Final reply text with reasoning stripped. */
  raw: string;
  /** Extracted short answer that was graded. */
  answer: string;
  reasoning: string;
  correct: boolean;
  latencyMs: number;
  /** Time to first token, when the reply was streamed. */
  ttftMs?: number;
  /** Token counts (reported by the provider, or estimated from the text). */
  tokens?: { in?: number; cached?: number; out?: number; reasoning?: number; estimated: boolean };
  error?: string;
  /** Not answered within the per-question time limit (counts as wrong, not as an error). */
  timedOut?: boolean;
  /** Multi-line error details for tooltips. */
  errorDetail?: string;
}
