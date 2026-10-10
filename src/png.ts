import { fmtClock, fmtLimit, fmtSec, fmtTok, fmtUsd } from './dom';
import type { RaceExport, SeriesExport } from './export';

/**
 * The results card as a PNG, drawn with the Canvas 2D API. No third-party libraries, so the
 * strict CSP and the no-external-assets rule stay intact. Layout maths (`cardHeight`) is pure and
 * unit-tested; `drawResultsCard` is the only part that touches a canvas.
 */

/** Lane colours, matching LANES in main.ts (lane 3's yellow deepened for legibility on white). */
const LANE_COLORS = ['#e63946', '#1e6fd9', '#c8901a', '#8e44ad'];

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

const INK = '#1c1e21';
const MUTED = '#6b7280';
const HAIR = '#e5e7eb';
const SOFT = '#f4f6f8';

const CARD_W = 1200;
const M = 48;
const CW = CARD_W - M * 2;
const HEADER_H = 156;
const SECTION_GAP = 30;
const SECTION_TITLE_H = 34;
const HEAD_ROW_H = 36;
const ROW_H = 52;
const FOOTER_H = 30;

const PLACE_MARK = ['🥇', '🥈', '🥉'];

/** "meta-llama/Llama-3.3-70B-Instruct" -> "Llama-3.3-70B-Instruct", as the app shows model names. */
const shortModel = (id: string) => id.split('/').pop() || id;

/** Card height for a given export, so the canvas can be sized before drawing. */
export function cardHeight(data: RaceExport, series: SeriesExport | null = null): number {
  let h = M + HEADER_H + SECTION_GAP + SECTION_TITLE_H + HEAD_ROW_H + data.standings.length * ROW_H;
  if (series) h += SECTION_GAP + SECTION_TITLE_H + HEAD_ROW_H + series.standings.length * ROW_H;
  h += SECTION_GAP + FOOTER_H + M;
  return Math.round(h);
}

/** The winner banner, phrased like the results panel. */
export function headlineOf(data: RaceExport): string {
  const w = data.standings[0] ? shortModel(data.standings[0].model) : '—';
  if (data.race.endReason === 'finish') return `🏆 ${w} wins the derby!`;
  if (data.race.endReason === 'stopped') return `⏹ Race stopped. ${w} was in front.`;
  return `🏁 No horse reached the line. ${w} wins on points!`;
}

function metaOf(data: RaceExport): string {
  const { durationMs, questionCount, difficulty, winningDistance, timeLimitSec } = data.race;
  const parts = [`Total race time ${fmtClock(durationMs)}`, `${questionCount} questions (${difficulty})`, `finish at ${winningDistance} correct`];
  if (timeLimitSec != null) parts.push(`timeout ${fmtLimit(timeLimitSec * 1000)} per question`);
  return parts.join(' · ');
}

/** Cut text to fit maxW with an ellipsis. Measures with the context's current font, so set it first. */
function elide(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}

interface TextOpts {
  weight?: number;
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** Cut the text with an ellipsis if it would be wider than this. */
  maxW?: number;
}

function put(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, o: TextOpts = {}) {
  ctx.font = font(o.weight ?? 400, o.size ?? 16);
  ctx.fillStyle = o.color ?? INK;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.baseline ?? 'alphabetic';
  ctx.fillText(o.maxW == null ? text : elide(ctx, text, o.maxW), x, y);
}

/** Right-aligned numeric cell, or an em dash when there is nothing to show. */
function num(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  put(ctx, text, x, y, { size: 17, align: 'right' });
}

/** One horse's two-line identity cell (lane chip, model, provider). */
function horseCell(ctx: CanvasRenderingContext2D, lane: number, model: string, provider: string, x: number, mid: number, maxW: number, note?: string | null) {
  ctx.beginPath();
  ctx.arc(x + 6, mid - 5, 6, 0, Math.PI * 2);
  ctx.fillStyle = LANE_COLORS[(lane - 1) % LANE_COLORS.length];
  ctx.fill();

  // The text starts 22px in, after the lane chip.
  put(ctx, shortModel(model), x + 22, mid - 4, { weight: 600, size: 18, maxW: maxW - 22 });
  const sub = note ? `${provider} · ${note}` : provider;
  put(ctx, sub, x + 22, mid + 15, { size: 13, color: MUTED, maxW: maxW - 22 });
}

function sectionTitle(ctx: CanvasRenderingContext2D, text: string, y: number) {
  put(ctx, text, M, y + 22, { weight: 700, size: 20, maxW: CW });
}

function paintHeader(ctx: CanvasRenderingContext2D, data: RaceExport, y0: number) {
  put(ctx, 'LLM Derby', M, y0 + 34, { weight: 700, size: 34 });
  const titleW = ctx.measureText('LLM Derby').width;
  put(ctx, `v${data.appVersion}`, M + titleW + 12, y0 + 34, { weight: 600, size: 16, color: MUTED });

  const date = new Date(data.exportedAt);
  put(ctx, `Exported ${date.toLocaleString()}`, M + CW, y0 + 22, { size: 14, color: MUTED, align: 'right' });

  put(ctx, headlineOf(data), M, y0 + 86, { weight: 700, size: 24, maxW: CW });
  put(ctx, metaOf(data), M, y0 + 116, { size: 15, color: MUTED, maxW: CW });
  // The podium: each of the top three gets an equal share of the width.
  const top = data.standings.slice(0, 3);
  const share = CW / Math.max(top.length, 1);
  top.forEach((s, i) => put(ctx, `${PLACE_MARK[i]} ${shortModel(s.model)}`, M + share * i, y0 + 140, { size: 16, maxW: share - 24 }));

  ctx.fillStyle = HAIR;
  ctx.fillRect(M, y0 + HEADER_H - 1, CW, 1);
}

const STANDING_COLS = {
  place: M,
  horse: M + 34,
  correct: M + 580,
  missed: M + 690,
  latency: M + 820,
  tokens: M + 960,
  cost: M + CW,
};

function paintStandingsHead(ctx: CanvasRenderingContext2D, y: number) {
  put(ctx, 'Place', STANDING_COLS.place, y + 22, { weight: 600, size: 13, color: MUTED });
  put(ctx, 'Horse', STANDING_COLS.horse + 22, y + 22, { weight: 600, size: 13, color: MUTED });
  for (const [label, label2] of [['Correct', 'correct'], ['Missed', 'missed'], ['Latency p50', 'latency'], ['Tokens out', 'tokens'], ['Cost', 'cost']] as const) {
    put(ctx, label, STANDING_COLS[label2], y + 22, { weight: 600, size: 13, color: MUTED, align: 'right' });
  }
  ctx.fillStyle = HAIR;
  ctx.fillRect(M, y + HEAD_ROW_H - 4, CW, 1);
}

function paintStandingRow(ctx: CanvasRenderingContext2D, s: RaceExport['standings'][number], y: number, alt: boolean) {
  const mid = y + ROW_H / 2;
  if (alt) {
    ctx.fillStyle = SOFT;
    ctx.fillRect(M, y, CW, ROW_H);
  }
  const mark = PLACE_MARK[s.place - 1] ?? String(s.place);
  put(ctx, mark, STANDING_COLS.place, mid + 6, { weight: 700, size: 20 });
  horseCell(ctx, s.lane, s.model, s.provider, STANDING_COLS.horse, mid, STANDING_COLS.correct - STANDING_COLS.horse - 60, s.withdrawnReason);

  num(ctx, String(s.correct), STANDING_COLS.correct, mid + 6);
  // Questions answered but not got right (wrong, timed out or failed). A count, not a percentage:
  // horses answer different numbers of questions, so a percentage alone can mislead.
  num(ctx, s.answered ? String(s.answered - s.correct) : '–', STANDING_COLS.missed, mid + 6);
  num(ctx, fmtSec(s.latencyP50Ms), STANDING_COLS.latency, mid + 6);
  num(ctx, s.answered ? fmtTok(s.tokensOut, s.tokensEstimated) : '–', STANDING_COLS.tokens, mid + 6);
  num(ctx, fmtUsd(s.costUsd, s.tokensEstimated), STANDING_COLS.cost, mid + 6);
}

function paintSeries(ctx: CanvasRenderingContext2D, series: SeriesExport, name: (s: SeriesExport['standings'][number]) => string, y0: number) {
  let y = y0;
  const champ = series.standings[0];
  const title = series.over ? `🏆 ${champ ? shortModel(name(champ)) : ''} wins the series!` : `Series standings after race ${series.racesCounted} of ${series.bestOf}`;
  sectionTitle(ctx, title, y);
  y += SECTION_TITLE_H;

  const pointsX = M + 640;
  const winsX = M + 720;
  const correctX = M + CW;
  const raceStart = M + 780;
  const raceEnd = correctX - 90;
  const races = Math.max(series.bestOf, 1);
  const step = races > 0 ? (raceEnd - raceStart) / races : 0;
  const raceX = (k: number) => raceStart + step * (k + 0.5);

  put(ctx, 'Place', M, y + 22, { weight: 600, size: 13, color: MUTED });
  put(ctx, 'Horse', M + 34 + 22, y + 22, { weight: 600, size: 13, color: MUTED });
  put(ctx, 'Points', pointsX, y + 22, { weight: 600, size: 13, color: MUTED, align: 'right' });
  put(ctx, 'Wins', winsX, y + 22, { weight: 600, size: 13, color: MUTED, align: 'right' });
  for (let k = 0; k < races; k++) put(ctx, `R${k + 1}`, raceX(k), y + 22, { weight: 600, size: 13, color: MUTED, align: 'center' });
  put(ctx, 'Correct', correctX, y + 22, { weight: 600, size: 13, color: MUTED, align: 'right' });
  ctx.fillStyle = HAIR;
  ctx.fillRect(M, y + HEAD_ROW_H - 4, CW, 1);
  y += HEAD_ROW_H;

  series.standings.forEach((row, i) => {
    const mid = y + ROW_H / 2;
    if (i % 2 === 1) {
      ctx.fillStyle = SOFT;
      ctx.fillRect(M, y, CW, ROW_H);
    }
    const mark = PLACE_MARK[row.place - 1] ?? String(row.place);
    put(ctx, mark, M, mid + 6, { weight: 700, size: 20 });
    horseCell(ctx, row.lane, name(row), row.provider, M + 34, mid, pointsX - M - 34 - 40);
    num(ctx, String(row.points), pointsX, mid + 6);
    num(ctx, String(row.wins), winsX, mid + 6);
    for (let k = 0; k < races; k++) {
      const place = row.placeByRace[k];
      put(ctx, place ? (PLACE_MARK[place - 1] ?? String(place)) : '–', raceX(k), mid + 6, { size: 16, align: 'center' });
    }
    num(ctx, String(row.correct), correctX, mid + 6);
    y += ROW_H;
  });
  return y;
}

function paintFooter(ctx: CanvasRenderingContext2D, data: RaceExport, y: number, height: number) {
  ctx.fillStyle = HAIR;
  ctx.fillRect(M, y - 16, CW, 1);
  put(ctx, `LLM Derby v${data.appVersion} · llm-derby · Exports never include API keys.`, CARD_W / 2, height - M + 4, {
    size: 13,
    color: MUTED,
    align: 'center',
  });
}

/** Draw the results card onto a canvas, sizing it for a crisp image. */
export function drawResultsCard(canvas: HTMLCanvasElement, data: RaceExport, series: SeriesExport | null = null): void {
  const height = cardHeight(data, series);
  const scale = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
  canvas.width = CARD_W * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CARD_W, height);

  paintHeader(ctx, data, M);
  let y = M + HEADER_H + SECTION_GAP;

  sectionTitle(ctx, 'Standings', y);
  y += SECTION_TITLE_H;
  paintStandingsHead(ctx, y);
  y += HEAD_ROW_H;
  data.standings.forEach((s, i) => {
    paintStandingRow(ctx, s, y, i % 2 === 1);
    y += ROW_H;
  });

  if (series) {
    y += SECTION_GAP;
    y = paintSeries(ctx, series, (row) => row.model, y);
  }

  paintFooter(ctx, data, y + SECTION_GAP, height);
}
