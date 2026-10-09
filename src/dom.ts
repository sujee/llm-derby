type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

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

export function fmtPct(x: number | null): string {
  return x == null ? '–' : `${Math.round(x * 100)}%`;
}
