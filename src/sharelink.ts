import type { Difficulty } from './types';
import { DEFAULT_LEVELS, LEVELS } from './questions';

/**
 * A race setup that can travel in a link (the part after `#setup=`).
 * It never holds API keys: only providers, models, custom base URLs and race options.
 */
export interface SharedSetup {
  horses: { providerId: string; model: string; baseUrl?: string }[];
  distance: number;
  levels: Difficulty[];
  rising: boolean;
  /** Seconds per question, or null for no time limit. */
  timeLimitSec: number | null;
}

export interface ShareLimits {
  isProvider: (id: string) => boolean;
  hasCustomUrl: (id: string) => boolean;
  minDistance: number;
  maxDistance: number;
  minTimeLimit: number;
  maxTimeLimit: number;
}

export const SHARE_PREFIX = '#setup=';
const MAX_MODEL_LEN = 200;
const MAX_URL_LEN = 500;

/** Compact wire format: { v, h: [[provider, model, baseUrl?]], d, l, r, t } */
interface Wire {
  v: 1;
  h: [string, string, string?][];
  d: number;
  l: string[];
  r: 0 | 1;
  t: number;
}

function toBase64Url(text: string): string {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeSetup(s: SharedSetup): string {
  const wire: Wire = {
    v: 1,
    h: s.horses.map((x) => (x.baseUrl ? [x.providerId, x.model, x.baseUrl] : [x.providerId, x.model])),
    d: s.distance,
    l: s.levels,
    r: s.rising ? 1 : 0,
    t: s.timeLimitSec ?? 0,
  };
  return toBase64Url(JSON.stringify(wire));
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, '').trim();

/**
 * Read a setup from a location hash. The link may come from anyone, so every field is
 * checked and clamped; anything unusable gives null (the link is then ignored).
 */
export function decodeSetup(hash: string, lim: ShareLimits): SharedSetup | null {
  if (!hash.startsWith(SHARE_PREFIX)) return null;
  let w: Partial<Wire>;
  try {
    w = JSON.parse(fromBase64Url(hash.slice(SHARE_PREFIX.length)));
  } catch {
    return null;
  }
  if (!w || typeof w !== 'object' || w.v !== 1 || !Array.isArray(w.h)) return null;
  if (w.h.length < 3 || w.h.length > 4) return null;

  const horses: SharedSetup['horses'] = [];
  for (const row of w.h) {
    if (!Array.isArray(row)) return null;
    const [providerId, model, baseUrl] = row;
    if (typeof providerId !== 'string' || !lim.isProvider(providerId)) return null;
    const m = typeof model === 'string' ? clean(model).slice(0, MAX_MODEL_LEN) : '';
    const horse: SharedSetup['horses'][number] = { providerId, model: m };
    if (lim.hasCustomUrl(providerId) && typeof baseUrl === 'string') {
      const u = clean(baseUrl);
      if (u.length <= MAX_URL_LEN && /^https?:\/\/\S+$/.test(u)) horse.baseUrl = u;
    }
    horses.push(horse);
  }

  const levels = LEVELS.filter((l) => Array.isArray(w.l) && w.l.includes(l));
  const t = typeof w.t === 'number' && Number.isFinite(w.t) ? w.t : 0;
  return {
    horses,
    distance: clamp(typeof w.d === 'number' && Number.isFinite(w.d) ? w.d : 20, lim.minDistance, lim.maxDistance),
    levels: levels.length ? levels : [...DEFAULT_LEVELS],
    rising: w.r === 1,
    timeLimitSec: t > 0 ? clamp(t, lim.minTimeLimit, lim.maxTimeLimit) : null,
  };
}
