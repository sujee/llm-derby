type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

/** XML namespace for elements built with createElementNS (icons, the horse SVG). */
export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Tiny element builder. Strings always become text nodes, so model output can never
 * inject markup. `vars` sets CSS custom properties (allowed under a strict CSP).
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'vars') for (const [n, val] of Object.entries(v as Record<string, string>)) el.style.setProperty(n, val);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled') (el as unknown as Props)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function $(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Missing element ${sel}`);
  return el;
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function fmtSec(ms: number | null | undefined): string {
  return ms == null ? '–' : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
}

export function fmtClock(ms: number): string {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

/** A time limit as a short label: 30000 → "30s", 7500 → "7.5s". */
export function fmtLimit(ms: number): string {
  const s = ms / 1000;
  return `${Number.isInteger(s) ? s : s.toFixed(1)}s`;
}

/** Token count: 950 → "950", 12345 → "12.3k", 2500000 → "2.5M". `~` marks an estimate. */
export function fmtTok(n: number | undefined, estimated = false): string {
  if (n == null) return '–';
  const s = n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
  return estimated ? `~${s}` : s;
}

/** Tokens per second: 87 tok/s, 4.2 tok/s. "–" when unknown. */
export function fmtTps(n: number | null | undefined, estimated = false): string {
  if (n == null) return '–';
  const s = n >= 10 ? String(Math.round(n)) : n.toFixed(1);
  return estimated ? `~${s}` : s;
}

/** Dollars with enough precision for tiny per-race costs: $1.23, $0.042, $0.00041. "–" when unknown. */
export function fmtUsd(n: number | null | undefined, estimated = false): string {
  if (n == null) return '–';
  const s = n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(3) : n === 0 ? '0' : n.toPrecision(2);
  return `${estimated ? '~' : ''}$${s}`;
}

export function fmtPct(x: number | null): string {
  return x == null ? '–' : `${Math.round(x * 100)}%`;
}
