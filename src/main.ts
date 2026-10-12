import './style.css';
import { PROVIDER_MENU, providerById } from './providers';
import { describeError, listModels, logError, type Pricing } from './api';
import { fetchCatalog, lookupPrice, type PriceCatalog } from './pricing';
import pricingSnapshot from './pricing.snapshot.json';
import { Race, statsOf, type RaceSummary, type RacerState, type RacerStats } from './race';
import { $, fmtClock, fmtLimit, fmtPct, fmtSec, fmtTok, fmtTps, fmtUsd, h, SVG_NS, wait } from './dom';
import { horseSvg } from './horse';
import { sound } from './sound';
import { confetti } from './confetti';
import { DEFAULT_LEVELS, LEVELS, available, byLevel, isBankQuestion, ordered, pickQuestions, questionCount, splitCounts } from './questions';
import { GENERATORS, generateExpert } from './generated';
import { buildExport, buildSeriesBundle, buildSeriesExport, download, downloadBlob, exportBaseName, toCsv, toSeriesCsv, type RaceExport, type SeriesExport } from './export';
import { drawResultsCard } from './png';
import { debugLog, logRaceEnd, logRaceStart } from './debuglog';
import { Announcer } from './announcer';
import { Commentator, displayNames } from './commentary';
// The question bank as a file next to the app, so "See all questions" shows this exact version.
import questionsUrl from './questions.json?url';
import { APP_VERSION_LABEL } from './version';
import { SERIES_POINTS, seriesClinched, seriesDone, seriesStandings, type SeriesState } from './series';
import { SHARE_PREFIX, decodeSetup, encodeSetup, type ShareLimits } from './sharelink';
import { aliasPatch, analyzeRace, type Insights } from './insights';
import { DIFFICULTIES, correctAt, difficultyBreakdown, leadChanges, linearScale, niceTicks, raceProgress, spreadLabels } from './charts';
import { sortRows, type SortValue } from './sort';
import type { AnswerResult, Difficulty, Endpoint, Question } from './types';

const LANES = [
  { color: '#e63946', coat: '#9a5530', mane: '#4a2512' },
  { color: '#1e6fd9', coat: '#4b3426', mane: '#1f140d' },
  { color: '#f2b705', coat: '#d9d2c5', mane: '#8c8274' },
  { color: '#8e44ad', coat: '#2b2522', mane: '#0d0b0a' },
];

const MIN_DISTANCE = 3;
const MAX_DISTANCE = 60;

// ---------------------------------------------------------------------------
// State. API keys live only in memory; non-secret settings are remembered.
// ---------------------------------------------------------------------------

interface HorseConfig {
  providerId: string;
  model: string;
  /** Base URL when the provider is Custom; each horse can point at its own server. */
  baseUrl?: string;
}

interface Settings {
  horseCount: number;
  horses: HorseConfig[];
  distance: number;
  sound: boolean;
  /** Show the race announcer's commentary bar. */
  announcer: boolean;
  /** Races per series: 1 for a single race, or best of 3 / 5. */
  series: number;
  /** Selected difficulty levels (at least one). */
  levels: Difficulty[];
  /** Questions run easy → medium → hard → expert. */
  rising: boolean;
  timeLimitOn: boolean;
  timeLimitSec: number;
  /** Log every request and response to the console. */
  debug: boolean;
}

// Kept from the app's original name so existing saved settings still load.
const SETTINGS_KEY = 'llm-horse-racing.settings';
/** Bump when a default changes and older saved values should be replaced by it. */
const SETTINGS_VERSION = 3; // v2: default time limit raised to 30s · v3: default levels Hard + Expert

function loadSettings(): Settings {
  const defaults: Settings = {
    horseCount: 4,
    horses: LANES.map(() => ({ providerId: 'nebius', model: '' })),
    distance: 20,
    sound: true,
    announcer: true,
    series: 1,
    debug: false,
    levels: [...DEFAULT_LEVELS],
    rising: false,
    timeLimitOn: true,
    timeLimitSec: 30,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as
      | (Partial<Settings> & { difficulty?: string; v?: number; customBaseUrl?: string })
      | null;
    if (!saved) return defaults;
    // Settings saved before v2 hold the old 10s/15s default time limit: switch them to 30s once.
    if ((saved.v ?? 1) < 2) delete saved.timeLimitSec;
    // Settings saved before v3 hold the old default levels: switch them to Hard + Expert once.
    if ((saved.v ?? 1) < 3) delete saved.levels;
    // Older versions saved a single `difficulty` ('mixed' or one level).
    let levels = ordered(Array.isArray(saved.levels) ? saved.levels : []);
    if (!levels.length && saved.difficulty) {
      levels = saved.difficulty === 'mixed' ? [...DEFAULT_LEVELS] : ordered([saved.difficulty as Difficulty]);
    }
    const { difficulty: _legacy, v: _version, customBaseUrl: legacyUrl, ...rest } = saved;
    return {
      ...defaults,
      ...rest,
      levels: levels.length ? levels : defaults.levels,
      horses: defaults.horses.map((d, i) => {
        const h = { ...d, ...(saved.horses?.[i] ?? {}) };
        // Older versions had one custom base URL shared by all horses.
        if (providerById(h.providerId).editableUrl && !h.baseUrl && legacyUrl) h.baseUrl = legacyUrl;
        // API keys don't survive a reload, so don't restore models that need one.
        return providerById(h.providerId).noKey ? h : { ...h, model: '' };
      }),
    };
  } catch {
    return defaults;
  }
}

const S = {
  ...loadSettings(),
  // Keys, model lists, prices and load status are per source: the provider ID, or `custom-<lane>`
  // for a Custom horse (each has its own server). See sourceOf().
  keys: {} as Record<string, string>,
  models: {} as Record<string, string[]>,
  /** Published prices by source, then model ID (only for providers that list them). */
  pricing: {} as Record<string, Record<string, Pricing>>,
  modelStatus: {} as Record<string, { state: 'loading' | 'ok' | 'error'; msg: string; detail?: string }>,
  setupError: '',
  /** Information shown above the setup (e.g. after opening a shared link). */
  setupNotice: '',
  questions: [] as Question[],
  /** Difficulty settings the current questions were drawn with. */
  questionsLabel: '',
  race: null as Race | null,
  /** The series in progress, if racing a best-of series. */
  seriesState: null as SeriesState | null,
  /** Wall-clock start of the current race, for exports. */
  raceStartedAt: new Date(),
};

function saveSettings() {
  const { horseCount, horses, distance, sound: snd, announcer, series, levels, rising, timeLimitOn, timeLimitSec, debug } = S;
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        v: SETTINGS_VERSION,
        horseCount,
        horses,
        distance,
        sound: snd,
        announcer,
        series,
        levels,
        rising,
        timeLimitOn,
        timeLimitSec,
        debug,
      }),
    );
  } catch {
    /* storage unavailable; settings just won't persist */
  }
}

sound.enabled = S.sound;

/** Prices for models whose provider doesn't list one: the bundled snapshot, until "Refresh prices" replaces it. */
let priceCatalog = pricingSnapshot as unknown as PriceCatalog;

const activeHorses = () => S.horses.slice(0, S.horseCount);

/** Where horse i's key, models and prices live: its provider, or its own slot for a Custom horse. */
function sourceOf(i: number): string {
  const hc = S.horses[i];
  return providerById(hc.providerId).editableUrl ? `custom-${i}` : hc.providerId;
}

/** "https://api.example.com:8443/v1" -> "api.example.com:8443" */
function hostLabel(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/** Horse i's price for a model: the provider's own listing if it has one, else the models.dev catalog. */
function priceOf(i: number, model: string): Pricing | undefined {
  return S.pricing[sourceOf(i)]?.[model] ?? lookupPrice(priceCatalog, S.horses[i].providerId, model);
}

function endpointFor(i: number): Endpoint {
  const hc = S.horses[i];
  const p = providerById(hc.providerId);
  const baseUrl = p.editableUrl ? (hc.baseUrl ?? '') : p.baseUrl;
  // A Custom horse is named after its server, so different custom endpoints are told apart everywhere.
  const provider = p.editableUrl && baseUrl ? { ...p, name: hostLabel(baseUrl) } : p;
  return { provider, baseUrl, apiKey: S.keys[sourceOf(i)] ?? '' };
}

/** "meta-llama/Llama-3.3-70B-Instruct" -> "Llama-3.3-70B-Instruct" */
const shortModel = (id: string) => id.split('/').pop() || id;

/** A small SVG icon for the copy / copied button states. */
function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = path;
  return svg;
}
const copyIcon = () =>
  icon('<rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M10.5 5.5V4.1a1.6 1.6 0 0 0-1.6-1.6H4.1A1.6 1.6 0 0 0 2.5 4.1v4.8a1.6 1.6 0 0 0 1.6 1.6h1.4"/>');
const checkIcon = () => icon('<path d="M3.5 8.5 6.5 11.5 12.5 4.5"/>');

/** Build an SVG element (namespace-correct, unlike `h`); attributes only, no HTML parsing. */
function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  ...children: (Node | string)[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

interface SortColumn<T> {
  label: string;
  /** A second, smaller line under the label. */
  sub?: string;
  key: (row: T) => SortValue;
  /** Direction of the first click: the one that puts the best on top. */
  dir: 1 | -1;
}

/**
 * A standings table whose every column sorts on a click; a second click reverses it.
 * `rows` arrive in their normal order, which is the first column's.
 */
function sortableStandings<T>(columns: SortColumn<T>[], rows: T[], renderRow: (row: T) => HTMLTableRowElement): HTMLTableElement {
  const trs = new Map(rows.map((row) => [row, renderRow(row)]));
  const body = h('tbody', null, [...trs.values()]);
  let sorted = { col: 0, dir: 1 as 1 | -1 };
  const ths = columns.map((c, ci) =>
    h(
      'th',
      { 'aria-sort': ci ? 'none' : 'ascending' },
      h('button', { type: 'button', class: 'sort', title: `Sort by ${c.label.toLowerCase()}`, onclick: () => sortBy(ci) }, c.label, c.sub ? h('span', { class: 'col-sub' }, c.sub) : null, h('span', { class: 'sort-arrow', 'aria-hidden': 'true' }, ci ? '' : '▲')),
    ),
  );
  const sortBy = (col: number) => {
    sorted = { col, dir: sorted.col === col ? (-sorted.dir as 1 | -1) : columns[col].dir };
    body.append(...sortRows(rows, columns[col].key, sorted.dir).map((row) => trs.get(row)!));
    ths.forEach((th, ci) => {
      th.setAttribute('aria-sort', ci !== col ? 'none' : sorted.dir === 1 ? 'ascending' : 'descending');
      th.querySelector('.sort-arrow')!.textContent = ci !== col ? '' : sorted.dir === 1 ? '▲' : '▼';
    });
  };
  return h('table', { class: 'standings' }, h('thead', null, h('tr', null, ths)), body);
}

/** Copy text to the clipboard, falling back to a temporary textarea where the API is blocked. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Short model name plus a copy button that puts the full model ID on the clipboard. */
function modelName(model: string): HTMLElement {
  const name = h('span', { class: 'model' }, shortModel(model));
  let resetTimer: number | undefined;
  const btn = h(
    'button',
    {
      type: 'button',
      class: 'model-info',
      'aria-label': 'Copy full model name',
      title: 'Copy full model name',
      onclick: async () => {
        if (!(await copyText(model))) return;
        btn.classList.add('copied');
        btn.replaceChildren(checkIcon());
        window.clearTimeout(resetTimer);
        resetTimer = window.setTimeout(() => {
          btn.classList.remove('copied');
          btn.replaceChildren(copyIcon());
        }, 1800);
      },
    },
    copyIcon(),
  );
  return h('span', { class: 'model-line' }, name, btn);
}

const LEVEL_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
/** One random example question per level for the setup legend, picked fresh on each page load. */
const LEVEL_SAMPLE: Record<Difficulty, string> = (() => {
  const random = (level: Difficulty) => {
    const qs = byLevel(level);
    return qs[Math.floor(Math.random() * qs.length)]?.question ?? '';
  };
  return { easy: random('easy'), medium: random('medium'), hard: random('hard'), expert: generateExpert(1)[0].question };
})();
const levelsLabel = (levels: Difficulty[]) => ordered(levels).map((l) => LEVEL_LABEL[l]).join(' + ');
/** "Hard 10 + Expert 20": how many questions of each level are in the race. */
const levelMix = (qs: { difficulty: Difficulty }[]) =>
  ordered([...new Set(qs.map((q) => q.difficulty))])
    .map((l) => `${LEVEL_LABEL[l]} ${qs.filter((q) => q.difficulty === l).length}`)
    .join(' + ');
const MIN_TIME_LIMIT = 3;
const MAX_TIME_LIMIT = 300;

const SHARE_LIMITS: ShareLimits = {
  isProvider: (id) => PROVIDER_MENU.some((p) => p.id === id),
  hasCustomUrl: (id) => !!providerById(id).editableUrl,
  minDistance: MIN_DISTANCE,
  maxDistance: MAX_DISTANCE,
  minTimeLimit: MIN_TIME_LIMIT,
  maxTimeLimit: MAX_TIME_LIMIT,
};

/** Link that reopens the current setup (never includes API keys). */
function setupLink(): string {
  const code = encodeSetup({
    horses: activeHorses().map((hc) => ({
      providerId: hc.providerId,
      model: hc.model,
      ...(providerById(hc.providerId).editableUrl && hc.baseUrl ? { baseUrl: hc.baseUrl } : {}),
    })),
    distance: S.distance,
    levels: S.levels,
    rising: S.rising,
    timeLimitSec: S.timeLimitOn ? S.timeLimitSec : null,
  });
  return `${location.origin}${location.pathname}${SHARE_PREFIX}${code}`;
}

/** Forget every saved setting and the typed keys by reloading the page from the defaults. */
function resetAll() {
  if (!confirm('Reset all settings to the defaults and forget the API keys typed in this session?')) return;
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    /* storage unavailable: nothing was saved */
  }
  location.reload();
}

async function copySetupLink(btn: HTMLButtonElement) {
  const link = setupLink();
  if (await copyText(link)) {
    btn.textContent = '✓ Link copied';
    setTimeout(() => (btn.textContent = '🔗 Copy setup link'), 2000);
  } else {
    // Clipboard blocked (e.g. not a secure context): show the link so it can be copied by hand.
    S.setupNotice = `Copy this link: ${link}`;
    renderSetup();
  }
}

/** Apply a setup from the page's link (#setup=…), then drop it from the address bar. */
function applySharedSetup() {
  if (!location.hash.startsWith(SHARE_PREFIX)) return;
  const shared = decodeSetup(location.hash, SHARE_LIMITS);
  history.replaceState(null, '', location.pathname + location.search);
  if (!shared) {
    S.setupNotice = 'That setup link could not be read, so your previous setup is shown.';
    return;
  }
  S.horseCount = shared.horses.length;
  shared.horses.forEach((x, i) => (S.horses[i] = { ...x }));
  S.distance = shared.distance;
  S.levels = shared.levels;
  S.rising = shared.rising;
  S.timeLimitOn = shared.timeLimitSec != null;
  if (shared.timeLimitSec != null) S.timeLimitSec = shared.timeLimitSec;
  saveSettings();
  const custom = shared.horses.some((x) => x.baseUrl);
  S.setupNotice =
    'Setup loaded from a shared link. Add your API keys to race.' +
    (custom ? ' It includes custom servers: check each Base URL before entering a key there.' : '');
}

/** Draw a fresh question set using the current difficulty settings. */
function newQuestions() {
  const rising = S.rising && S.levels.length > 1;
  S.questions = pickQuestions(questionCount(S.distance, S.levels), S.levels, rising);
  S.questionsLabel = `${levelsLabel(S.levels)}${rising ? ', rising' : ''}`;
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

/** Header toggle text: an icon plus a label (the label hides on phones; aria-label keeps it for screen readers). */
function toggleLabel(btn: HTMLElement, icon: string, label: string) {
  btn.replaceChildren(h('span', { 'aria-hidden': 'true' }, icon), h('span', { class: 'toggle-label' }, ` ${label}`));
  btn.setAttribute('aria-label', label);
}

const soundBtn = h('button', { class: 'btn ghost sound-btn', type: 'button', title: 'Turn sound effects on or off', onclick: toggleSound });

function renderSoundBtn() {
  toggleLabel(soundBtn, S.sound ? '🔊' : '🔇', S.sound ? 'Sound on' : 'Sound off');
  soundBtn.setAttribute('aria-pressed', String(S.sound));
}

function toggleSound() {
  S.sound = !S.sound;
  sound.enabled = S.sound;
  saveSettings();
  renderSoundBtn();
}

const announcerBtn = h('button', {
  class: 'btn ghost',
  type: 'button',
  title: 'Show or hide the race commentary',
  onclick: toggleAnnouncer,
});

function renderAnnouncerBtn() {
  toggleLabel(announcerBtn, '📣', S.announcer ? 'Announcer on' : 'Announcer off');
  announcerBtn.setAttribute('aria-pressed', String(S.announcer));
  document.body.classList.toggle('no-announcer', !S.announcer);
}

function toggleAnnouncer() {
  S.announcer = !S.announcer;
  saveSettings();
  renderAnnouncerBtn();
}

const debugBtn = h('button', {
  class: 'btn ghost',
  type: 'button',
  title: 'Log every request and response to the browser console (open DevTools → Console)',
  onclick: toggleDebug,
});

function renderDebugBtn() {
  toggleLabel(debugBtn, '🐞', S.debug ? 'Debug on' : 'Debug off');
  debugBtn.setAttribute('aria-pressed', String(S.debug));
  debugBtn.classList.toggle('on', S.debug);
}

function toggleDebug() {
  S.debug = !S.debug;
  debugLog.enabled = S.debug;
  saveSettings();
  renderDebugBtn();
  console.info(
    S.debug
      ? '%c🐞 LLM Derby debug logging ON: every request and response will be logged here.'
      : '%c🐞 LLM Derby debug logging off.',
    'font-weight:700',
  );
}

// Dev-only badge over the logo's top-left corner while running the Vite dev server.
// `import.meta.env.DEV` is true only in dev and is replaced with `false` in the production build,
// so this never ships.
const devBadge = import.meta.env.DEV
  ? h('span', { class: 'dev-badge', title: `Vite dev server · ${import.meta.env.MODE} mode` }, 'DEV')
  : null;

$('#app').append(
  h(
    'header',
    { class: 'site-header' },
    h('div', { class: 'tent' }),
    h(
      'div',
      { class: 'header-row' },
      h(
        'div',
        { class: 'marquee' },
        h('h1', null, h('a', { href: location.pathname, class: 'logo-link', title: 'Back to the main screen', onclick: (e: Event) => (e.preventDefault(), logoClick()) }, 'LLM Derby')),
        devBadge,
      ),
      h(
        'div',
        { class: 'header-info' },
        h('p', { class: 'tagline' }, 'Step right up! The fastest, smartest model wins the derby!'),
        h(
          'p',
          { class: 'credits' },
          'by ',
          h('a', { href: 'https://sujee.dev', target: '_blank', rel: 'noopener' }, 'sujee.dev'),
          h('span', { class: 'dot', 'aria-hidden': 'true' }, '·'),
          h('a', { href: 'https://github.com/sujee/llm-derby', target: '_blank', rel: 'noopener', title: 'Source code on GitHub' }, 'GitHub ↗'),
          h('span', { class: 'dot', 'aria-hidden': 'true' }, '·'),
          h('span', { class: 'version', title: 'App version' }, APP_VERSION_LABEL),
        ),
      ),
      h('div', { class: 'header-toggles' }, debugBtn, announcerBtn, soundBtn),
    ),
  ),
  h('main', null, h('section', { id: 'setup' }), h('section', { id: 'race', hidden: true })),
  h(
    'footer',
    { class: 'site-footer' },
    'Runs entirely in your browser. API keys are kept in memory only and sent only to the provider you pick. ',
    `LLM Derby ${APP_VERSION_LABEL}`,
  ),
);
renderSoundBtn();
renderAnnouncerBtn();
debugLog.enabled = S.debug;
renderDebugBtn();

function showView(view: 'setup' | 'race') {
  $('#setup').hidden = view !== 'setup';
  $('#race').hidden = view !== 'race';
  window.scrollTo({ top: 0 });
}

/** Stop any race and go to the setup screen. */
function openSetup() {
  S.race?.stop();
  cancelAutoNext();
  setPresenting(false);
  renderSetup();
  showView('setup');
}

/** The logo goes to the main (setup) screen; a race in progress asks first. */
function logoClick() {
  const live = S.race?.racers.some((r) => r.status === 'running' || r.status === 'waiting');
  if (live && !confirm('A race is in progress. Stop it and go to the main screen?')) return;
  openSetup();
}

// ---------------------------------------------------------------------------
// Setup view
// ---------------------------------------------------------------------------

/** Model-list requests in flight, so several cards on one provider share a single request. */
const modelLoads = new Map<string, Promise<void>>();

function loadModelsFor(i: number): Promise<void> {
  const src = sourceOf(i);
  const ep = endpointFor(i);
  const key = `${src}|${ep.baseUrl}|${ep.apiKey}`;
  let load = modelLoads.get(key);
  if (!load) {
    load = fetchModels(src, ep).finally(() => modelLoads.delete(key));
    modelLoads.set(key, load);
  }
  return load;
}

async function fetchModels(src: string, ep: Endpoint) {
  S.modelStatus[src] = { state: 'loading', msg: 'Loading models…' };
  renderSetup();
  try {
    const { ids, pricing } = await listModels(ep);
    S.models[src] = ids;
    S.pricing[src] = pricing;
    const priced = Object.keys(pricing).length;
    S.modelStatus[src] = ids.length
      ? { state: 'ok', msg: `${ids.length} models loaded${priced ? ` · prices for ${priced}` : ''}` }
      : { state: 'error', msg: 'No models returned. Type the model ID instead.' };
  } catch (e) {
    logError(`Loading models for ${ep.provider.name}`, e);
    S.modelStatus[src] = {
      state: 'error',
      msg: `Could not load models (${(e as Error).message}). You can still type the model ID.`,
      detail: describeError(e),
    };
  }
  renderSetup();
}

function horseCard(i: number) {
  const hc = S.horses[i];
  const p = providerById(hc.providerId);
  const lane = LANES[i];
  const src = sourceOf(i);
  const status = S.modelStatus[src];
  const models = S.models[src] ?? [];

  // Models load only when "Load models" is clicked. The simulated provider has no button
  // (its models are built in, no network call), so it fills in right away.
  if (!status && p.simulated) {
    S.modelStatus[src] = { state: 'loading', msg: 'Loading models…' }; // claim it before other cards render
    queueMicrotask(() => void loadModelsFor(i));
  }

  const useForAll = h(
    'button',
    {
      class: 'btn tiny',
      type: 'button',
      title: 'Use this provider for every horse',
      'data-fid': `provider-all-${i}`,
      onclick: () => applyProviderToAll(i),
    },
    'Use for all',
  );

  const providerSel = h(
    'select',
    {
      'data-fid': `provider-${i}`,
      onchange: () => {
        hc.providerId = providerSel.value;
        hc.model = '';
        saveSettings();
        renderSetup();
      },
    },
    PROVIDER_MENU.map((pp) => h('option', { value: pp.id, selected: pp.id === p.id }, pp.name)),
  );

  let urlField: HTMLElement | null = null;
  if (p.editableUrl) {
    const urlInput = h('input', {
      type: 'url',
      placeholder: 'https://your-server.example.com/v1',
      value: hc.baseUrl ?? '',
      spellcheck: 'false',
      'data-fid': `url-${i}`,
      // Update state as you type, and never re-render on blur: that would replace the field
      // or button the user is moving to (and swallow the click).
      oninput: () => {
        hc.baseUrl = urlInput.value.trim();
        saveSettings();
      },
    });
    urlField = h('label', { class: 'field' }, h('span', null, 'Base URL'), urlInput);
  }

  let keyField: HTMLElement | null = null;
  if (!p.noKey) {
    const keyInput = h('input', {
      type: 'password',
      placeholder: p.editableUrl ? 'Leave empty if not needed' : `${p.name} API key`,
      value: S.keys[src] ?? '',
      autocomplete: 'off',
      spellcheck: 'false',
      'data-fid': `key-${i}`,
      oninput: () => {
        S.keys[src] = keyInput.value.trim();
      },
    });
    keyField = h(
      'label',
      { class: 'field' },
      h(
        'span',
        null,
        p.editableUrl ? 'API key (optional)' : 'API key',
        p.keyUrl ? h('a', { href: p.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, 'get a key ↗') : null,
      ),
      h(
        'div',
        { class: 'inline' },
        keyInput,
        h(
          'button',
          {
            class: 'btn small',
            type: 'button',
            onclick: () => {
              S.keys[src] = keyInput.value.trim();
              S.setupError = '';
              void loadModelsFor(i);
            },
            'data-fid': `load-${i}`,
          },
          'Load models',
        ),
      ),
    );
  }

  const listId = `models-${i}`;
  const priceLine = h('p', { class: 'model-price', hidden: true });

  /** Price for the model currently in the box (see priceOf). */
  const updatePrice = () => {
    const model = hc.model.trim();
    const loaded = !!S.pricing[src];
    const price = model ? priceOf(i, model) : undefined;
    // Before a listing is loaded we can only price catalog-known IDs, so don't say "none" yet.
    const canSayNone = loaded && !p.simulated && !p.editableUrl;
    if (!model || (!price && !canSayNone)) {
      priceLine.hidden = true;
      return;
    }
    priceLine.hidden = false;
    if (!price) {
      priceLine.className = 'model-price none';
      priceLine.title = 'Only some providers publish prices, and the models.dev catalog only covers known model IDs.';
      priceLine.replaceChildren('No published price for this model');
      return;
    }
    priceLine.className = 'model-price';
    priceLine.title = price.source === 'models.dev' ? 'Price from the models.dev catalog' : `Price from ${p.name}’s published model list`;
    const perM = (n: number) => `$${n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(3) : n.toPrecision(2)}`;
    const bits: (Node | string)[] = ['💵 ', h('b', null, perM(price.inPerTok * 1e6)), ' in · ', h('b', null, perM(price.outPerTok * 1e6)), ' out / 1M'];
    if (price.cacheReadPerTok != null) bits.push(' · cached ', h('b', null, perM(price.cacheReadPerTok * 1e6)));
    priceLine.replaceChildren(...bits);
  };

  const modelInput = h('input', {
    type: 'text',
    'data-fid': `model-${i}`,
    list: listId,
    value: hc.model,
    spellcheck: 'false',
    placeholder: models.length ? 'Search or pick a model' : 'Type a model ID (or load models)',
    oninput: () => {
      hc.model = modelInput.value.trim();
      saveSettings();
      updatePrice();
    },
  });
  updatePrice();

  return h(
    'article',
    { class: 'horse-card', vars: { '--c': lane.color, '--coat': lane.coat, '--mane': lane.mane, '--silk': lane.color } },
    h('div', { class: 'card-head' }, h('div', { class: 'card-horse' }, horseSvg(i)), h('h3', null, `Horse ${i + 1}`)),
    h('label', { class: 'field' }, h('span', null, 'Provider', useForAll), providerSel),
    urlField,
    keyField,
    h('label', { class: 'field' }, h('span', null, 'Model'), modelInput),
    priceLine,
    h(
      'datalist',
      { id: listId },
      models.map((m) => h('option', { value: m })),
    ),
    status
      ? h('p', { class: `status ${status.state}${status.detail ? ' has-detail' : ''}`, title: status.detail }, status.msg)
      : null,
    p.note ? h('p', { class: 'status note' }, p.note) : null,
  );
}

/** Copy horse `from`'s provider (and, for Custom, its base URL) to every horse. */
function applyProviderToAll(from: number) {
  const src = providerById(S.horses[from].providerId);
  for (let j = 0; j < S.horseCount; j++) {
    const hc = S.horses[j];
    if (hc.providerId !== src.id) {
      hc.providerId = src.id;
      hc.model = ''; // models are specific to a provider
    }
    // A Custom provider means a particular server, so share its base URL too.
    if (src.editableUrl) hc.baseUrl = S.horses[from].baseUrl;
  }
  saveSettings();
  renderSetup();
}

/** Give each horse a random model from its provider's loaded list, avoiding duplicates where possible. */
function assignRandomModels() {
  const taken = new Set<string>();
  const missing: string[] = [];
  for (const [i, hc] of activeHorses().entries()) {
    const src = sourceOf(i);
    const all = S.models[src] ?? [];
    if (!all.length) {
      missing.push(`Horse ${i + 1} (${endpointFor(i).provider.name})`);
      continue;
    }
    const fresh = all.filter((m) => !taken.has(`${src}|${m}`));
    const pool = fresh.length ? fresh : all;
    hc.model = pool[Math.floor(Math.random() * pool.length)];
    taken.add(`${src}|${hc.model}`);
  }
  S.setupError = missing.length ? `Load models first for: ${missing.join(', ')}.` : '';
  saveSettings();
  renderSetup();
}

/** The "Refresh prices" button: use the current models.dev catalog for the rest of this session. */
async function refreshPrices(btn: HTMLButtonElement) {
  btn.disabled = true;
  btn.textContent = '⏳ Refreshing…';
  const fresh = await fetchCatalog();
  if (fresh) priceCatalog = fresh;
  S.setupNotice = fresh ? 'Model prices updated from models.dev.' : 'Could not refresh model prices; the current prices are still shown.';
  renderSetup();
}

function validateSetup(): string {
  for (const [i, hc] of activeHorses().entries()) {
    const p = providerById(hc.providerId);
    if (p.editableUrl && !/^https?:\/\/\S+$/.test(hc.baseUrl ?? '')) return `Horse ${i + 1}: enter the custom base URL.`;
    // A custom server may not need a key (e.g. a local vLLM or Ollama).
    if (!p.noKey && !p.editableUrl && !S.keys[sourceOf(i)]) return `Horse ${i + 1}: enter your ${p.name} API key.`;
    if (!hc.model) return `Horse ${i + 1}: choose a model.`;
  }
  return '';
}

/** Re-render setup, keeping focus and cursor in the field the user was in. */
function renderSetup() {
  const active = document.activeElement as HTMLInputElement | null;
  const fid = active?.dataset?.fid;
  const sel = fid && typeof active?.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  buildSetup();
  if (!fid) return;
  const el = document.querySelector<HTMLInputElement>(`#setup [data-fid="${fid}"]`);
  el?.focus();
  if (el && sel) {
    try {
      el.setSelectionRange(sel[0], sel[1]);
    } catch {
      /* not a text field */
    }
  }
}

function buildSetup() {
  const countToggle = h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'Number of horses' },
    [3, 4].map((n) =>
      h(
        'button',
        {
          type: 'button',
          class: S.horseCount === n ? 'on' : '',
          'aria-pressed': String(S.horseCount === n),
          onclick: () => {
            S.horseCount = n;
            saveSettings();
            renderSetup();
          },
        },
        `${n} horses`,
      ),
    ),
  );

  const qInfo = h('p', { class: 'muted q-info' });
  const setQInfo = () => {
    const n = questionCount(S.distance, S.levels);
    const counts = splitCounts(n, S.levels);
    const parts = ordered(S.levels).map((l) => {
      const avail = available(l);
      return `${counts[l]} ${l}${Number.isFinite(avail) ? ` (of ${avail})` : ''}`;
    });
    let text = `${n} questions per race: ${parts.join(' · ')}.`;
    if (S.levels.includes('expert')) {
      text += ` Expert questions are generated fresh every race (${Object.keys(GENERATORS).length} kinds: arithmetic, calendars, counting, strings, number bases…) with computed answers.`;
    }
    if (n < S.distance) text += ` ⚠ Fewer questions than the winning distance, so no horse can finish: most correct wins.`;
    qInfo.textContent = text;
  };
  setQInfo();
  const distanceInput = h('input', {
    type: 'number',
    id: 'distance',
    'data-fid': 'distance',
    min: String(MIN_DISTANCE),
    max: String(MAX_DISTANCE),
    value: String(S.distance),
    oninput: () => {
      const d = parseInt(distanceInput.value, 10);
      if (Number.isFinite(d)) {
        S.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, d));
        saveSettings();
        setQInfo();
      }
    },
    onchange: () => {
      distanceInput.value = String(S.distance);
    },
  });

  const levelBoxes = h(
    'div',
    { class: 'level-checks', role: 'group', 'aria-label': 'Question difficulty' },
    LEVELS.map((l) => {
      const on = S.levels.includes(l);
      const only = on && S.levels.length === 1;
      const box = h('input', {
        type: 'checkbox',
        checked: on,
        // Keep at least one level selected.
        disabled: only,
        onchange: () => {
          S.levels = box.checked ? ordered([...S.levels, l]) : S.levels.filter((x) => x !== l);
          saveSettings();
          renderSetup();
        },
      });
      return h(
        'label',
        { class: `level-check ${l}${on ? ' on' : ''}`, title: only ? 'At least one level must be selected' : null },
        box,
        LEVEL_LABEL[l],
      );
    }),
  );
  const risingBox = h('input', {
    type: 'checkbox',
    checked: S.rising,
    disabled: S.levels.length < 2,
    onchange: () => {
      S.rising = risingBox.checked;
      saveSettings();
    },
  });
  const limitBox = h('input', {
    type: 'checkbox',
    checked: S.timeLimitOn,
    'aria-label': 'Use a time limit',
    onchange: () => {
      S.timeLimitOn = limitBox.checked;
      limitInput.disabled = !S.timeLimitOn;
      document.querySelectorAll('.ctl-time .unit, .limit-help').forEach((el) => el.classList.toggle('off', !S.timeLimitOn));
      saveSettings();
    },
  });
  const limitInput = h('input', {
    type: 'number',
    class: 'seconds',
    'data-fid': 'seconds',
    min: String(MIN_TIME_LIMIT),
    max: String(MAX_TIME_LIMIT),
    value: String(S.timeLimitSec),
    disabled: !S.timeLimitOn,
    'aria-label': 'Seconds per question',
    oninput: () => {
      const v = parseInt(limitInput.value, 10);
      if (Number.isFinite(v)) {
        S.timeLimitSec = Math.min(MAX_TIME_LIMIT, Math.max(MIN_TIME_LIMIT, v));
        saveSettings();
      }
    },
    onchange: () => {
      limitInput.value = String(S.timeLimitSec);
    },
  });

  const formatToggle = h(
    'div',
    { class: 'segmented format', role: 'group', 'aria-label': 'Races' },
    [
      [1, 'Single race', 'One race'],
      [3, 'Best of 3', 'A series of 3 races with new questions each time; points decide the champion'],
      [5, 'Best of 5', 'A series of 5 races with new questions each time; points decide the champion'],
    ].map(([n, label, title]) =>
      h(
        'button',
        {
          type: 'button',
          class: S.series === n ? 'on' : '',
          'aria-pressed': String(S.series === n),
          title: String(title),
          onclick: () => {
            S.series = Number(n);
            saveSettings();
            renderSetup();
          },
        },
        String(label),
      ),
    ),
  );

  const startBtn = h(
    'button',
    {
      class: 'btn big start-btn',
      type: 'button',
      'data-fid': 'start',
      onclick: () => {
        S.setupError = validateSetup();
        if (S.setupError) return renderSetup();
        S.setupNotice = '';
        S.seriesState = S.series > 1 ? { of: S.series, legs: [] } : null;
        seriesPaused = false;
        newQuestions();
        void startRace();
      },
    },
    S.series > 1 ? `🏁 Start the series!` : '🏁 Start the race!',
  );

  const timeHelp =
    'Answers slower than this count as wrong (shown as “timeout”). ~10s rewards speed (fast “flash” models answer in 2–5s); 15–30s is balanced; 60s+ suits reasoning / thinking models and Expert questions.';

  $('#setup').replaceChildren(
    h('p', { class: 'setup-notice', role: 'status', hidden: !S.setupNotice }, S.setupNotice),
    h(
      'div',
      { class: 'panel' },
      h(
        'div',
        { class: 'panel-head' },
        h('h2', null, 'Saddle up your horses'),
        h(
          'div',
          { class: 'head-actions' },
          h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              title: 'Pick a random model for each horse from its provider’s model list',
              onclick: assignRandomModels,
            },
            '🎲 Assign models',
          ),
          h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              title: 'Download the latest model prices from models.dev (used until this page is reloaded)',
              onclick: (e: Event) => void refreshPrices(e.currentTarget as HTMLButtonElement),
            },
            '🔄 Refresh prices',
          ),
          h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              title: 'Copy a link that opens this setup: providers, models, distance and options. API keys are never included.',
              onclick: (e: Event) => void copySetupLink(e.currentTarget as HTMLButtonElement),
            },
            '🔗 Copy setup link',
          ),
          h(
            'button',
            {
              class: 'btn small ghost',
              type: 'button',
              title: 'Back to the default setup: forgets saved settings and the API keys typed in',
              onclick: resetAll,
            },
            '↺ Reset',
          ),
          countToggle,
          S.race
            ? h(
                'button',
                {
                  class: 'btn small',
                  type: 'button',
                  title: 'Back to the race view (the race was stopped when you opened setup)',
                  onclick: () => showView('race'),
                },
                '← Back to race',
              )
            : null,
        ),
      ),
      h(
        'div',
        { class: 'stable' },
        activeHorses().map((_, i) => horseCard(i)),
      ),
    ),
    h(
      'div',
      { class: 'panel settings-row' },
      h(
        'div',
        { class: 'controls' },
        h(
          'div',
          { class: 'ctl ctl-distance' },
          h('label', { class: 'ctl-label', for: 'distance', title: 'The first horse to this many correct answers wins' }, 'Winning distance'),
          h('div', { class: 'ctl-line' }, distanceInput, h('span', { class: 'unit' }, 'correct')),
        ),
        h(
          'div',
          { class: 'ctl ctl-difficulty' },
          h('span', { class: 'ctl-label' }, 'Question difficulty'),
          levelBoxes,
          h(
            'label',
            {
              class: `option${S.levels.length < 2 ? ' off' : ''}`,
              title: 'With two or more levels: questions start with the easiest level and get harder as the race goes on',
            },
            risingBox,
            '📈 Rising difficulty (easy → hard)',
          ),
        ),
        h(
          'div',
          { class: 'ctl ctl-time', title: timeHelp },
          h('span', { class: 'ctl-label' }, 'Time limit'),
          h(
            'div',
            { class: 'ctl-line' },
            limitBox,
            limitInput,
            h('span', { class: `unit${S.timeLimitOn ? '' : ' off'}` }, 'sec / question'),
          ),
          h('p', { class: `limit-help${S.timeLimitOn ? '' : ' off'}` }, '10s fast · 15–30s balanced · 60s+ reasoning'),
        ),
        h('div', { class: 'ctl ctl-start' }, formatToggle, startBtn),
      ),
      h(
        'div',
        { class: 'preview' },
        h(
          'ul',
          { class: 'level-legend', 'aria-label': 'Sample question per level' },
          LEVELS.map((l) =>
            h(
              'li',
              { class: S.levels.includes(l) ? '' : 'off' },
              h('span', { class: `diff ${l}` }, LEVEL_LABEL[l]),
              h('span', { class: 'sample' }, LEVEL_SAMPLE[l]),
            ),
          ),
        ),
        h(
          'div',
          { class: 'preview-foot' },
          qInfo,
          h(
            'a',
            {
              class: 'all-questions',
              href: questionsUrl,
              target: '_blank',
              rel: 'noopener',
              title: 'Every question in this version of the game, with its accepted answers (Expert questions are generated each race)',
            },
            '📖 See all questions ↗',
          ),
        ),
      ),
    ),
    h('p', { class: 'setup-error', role: 'alert', hidden: !S.setupError }, S.setupError),
    h(
      'p',
      { class: 'fineprint' },
      'API keys are never saved: they stay in this tab’s memory and go only to the provider you choose. ',
      'Tip: use a separate key with a spending limit for live demos. Want to try it without keys? Pick “Simulated”.',
    ),
  );
}

// ---------------------------------------------------------------------------
// Race view
// ---------------------------------------------------------------------------

interface LaneUI {
  horse: HTMLElement;
  score: HTMLElement;
  ok: HTMLElement;
  bad: HTMLElement;
  meta: HTMLElement;
  /** Status pill: "Working on Q8 · Hard", then Finished / Withdrawn / Out of questions / Race over. */
  state: HTMLElement;
}

interface RaceUI {
  lanes: LaneUI[];
  lanesWrap: HTMLElement;
  timer: HTMLElement;
  frontier: HTMLElement;
  results: HTMLElement;
  /** Holder for the advisory question-bank feedback, above the question board. */
  feedbackHost: HTMLElement;
  tbody: HTMLTableSectionElement;
  rows: Map<number, HTMLTableCellElement[]>;
  stopBtn: HTMLButtonElement;
  againBtn: HTMLButtonElement;
  newBtn: HTMLButtonElement;
  setupBtn: HTMLButtonElement;
  clockFrame: number;
  announcer: Announcer;
}

let UI: RaceUI | null = null;

// ---------------------------------------------------------------------------
// Series history: each finished race's view stays available from a strip of race buttons.
// ---------------------------------------------------------------------------

interface RacePage {
  page: HTMLElement;
  /** Race number in the series. */
  num: number;
  /** Short result for the strip, e.g. "🏆 sprinter" or "stopped". */
  result: string;
  /** Counted toward the series (a stopped race isn't). */
  counted: boolean;
  race: Race;
  /** Full model ID of the winner, for the tooltip. */
  winner?: string;
  /** The race's full export, built when it ends; the series tally bundles these. */
  data?: RaceExport;
}

/** Earlier races of the current series, oldest first. */
const pastPages: RacePage[] = [];
let livePage: RacePage | null = null;
const raceStrip = h('nav', { class: 'race-strip', 'aria-label': 'Races in this series', hidden: true });
const tallyEl = h('section', { class: 'panel results-panel tally', hidden: true });
type StripView = RacePage | 'tally';

function mountRacePage(page: HTMLElement, num: number) {
  const s = S.seriesState;
  if (!s || !s.legs.length) pastPages.length = 0; // single race, or a new series
  else if (livePage?.counted) {
    livePage.page.classList.add('archived');
    pastPages.push(livePage);
  }
  livePage = { page, num, result: 'live', counted: false, race: S.race! };
  $('#race').replaceChildren(raceStrip, tallyEl, ...pastPages.map((p) => p.page), page);
  showRacePage(livePage);
}

function showRacePage(target: StripView) {
  for (const p of [...pastPages, livePage]) if (p) p.page.hidden = p !== target;
  tallyEl.hidden = target !== 'tally';
  if (target === 'tally') renderTally();
  const series = S.seriesState;
  raceStrip.hidden = !series;
  if (!series) return;
  const legs = series.legs.length;
  const show = (view: StripView) => () => {
    showRacePage(view);
    window.scrollTo({ top: 0 });
  };
  // One button per race in the series; races not run yet are shown but disabled.
  const total = Math.max(series.of, livePage?.num ?? 0);
  const raceBtns = Array.from({ length: total }, (_, i) => {
    const num = i + 1;
    const p = [...pastPages, livePage].find((x) => x?.num === num) ?? null;
    if (!p) {
      return h('button', { type: 'button', class: 'strip-race', disabled: true, title: 'Not run yet' }, h('strong', null, `Race ${num}`));
    }
    return h(
      'button',
      {
        type: 'button',
        class: `strip-race${p === target ? ' on' : ''}${p === livePage ? ' latest' : ''}`,
        'aria-pressed': String(p === target),
        title: `${p === livePage ? 'The latest race' : `Look at race ${num} again: lanes, results and question board`}${p.winner ? `\nWinner: ${p.winner}` : ''}`,
        onclick: show(p),
      },
      h('strong', null, `Race ${num}`),
      ` ${p.result}`,
    );
  });
  const tallyBtn = h(
    'button',
    {
      type: 'button',
      class: `strip-race tally-btn${target === 'tally' ? ' on' : ''}`,
      'aria-pressed': String(target === 'tally'),
      disabled: !legs,
      title: legs ? 'The whole series so far: points, places and totals across all races' : 'Available after the first race',
      onclick: show('tally'),
    },
    h('strong', null, '🏆 Series tally'),
  );
  raceStrip.replaceChildren(h('span', { class: 'strip-label' }, `Best of ${series.of}`), ...raceBtns, tallyBtn);
}

/** Whole-series summary: standings plus totals over every counted race. */
function renderTally() {
  const s = S.seriesState;
  const counted = [...pastPages, livePage].filter((p): p is RacePage => !!p?.counted);
  if (!s || !counted.length) return tallyEl.replaceChildren();
  const racers = counted[counted.length - 1].race.racers;
  const rows = seriesStandings(s, racers.length);
  const over = seriesDone(s) || seriesClinched(s, racers.length);
  const name = (r: RacerState) => shortModel(r.entry.model);
  // One combined record per horse across all counted races, so the usual stats apply.
  const combined = (lane: number): RacerState => {
    const all = counted.map((p) => p.race.racers[lane]);
    return {
      ...all[all.length - 1],
      results: all.flatMap((r) => r.results),
      correct: all.reduce((n, r) => n + r.correct, 0),
      errors: all.reduce((n, r) => n + r.errors, 0),
    };
  };
  const leader = racers[rows[0].lane];
  const left = s.of - s.legs.length;
  type TallyRow = { row: (typeof rows)[number]; r: RacerState; st: RacerStats; place: number };
  const tallyRows: TallyRow[] = rows.map((row, i) => {
    const r = combined(row.lane);
    return { row, r, st: statsOf(r), place: i + 1 };
  });
  const tallyColumns: SortColumn<TallyRow>[] = [
    { label: 'Place', key: (x) => x.place, dir: 1 },
    { label: 'Horse', key: (x) => name(x.r).toLowerCase(), dir: 1 },
    { label: 'Points', key: (x) => x.row.points, dir: -1 },
    { label: 'Wins', key: (x) => x.row.wins, dir: -1 },
    ...s.legs.map((_, k): SortColumn<TallyRow> => ({ label: `Race ${k + 1}`, sub: s.legs[k].durationMs != null ? fmtClock(s.legs[k].durationMs!) : undefined, key: (x) => x.row.places[k] || null, dir: 1 })),
    { label: 'Attempted', key: (x) => x.st.answered, dir: -1 },
    { label: 'Correct', key: (x) => x.row.correct, dir: -1 },
    { label: 'Incorrect', key: (x) => x.st.incorrect, dir: 1 },
    { label: 'Accuracy', key: (x) => x.st.accuracy, dir: -1 },
    { label: 'Latency p50', key: (x) => x.st.medianLatencyMs, dir: 1 },
    { label: 'Tok/s p50', key: (x) => x.st.tokPerSecP50, dir: -1 },
    { label: 'Cost', key: (x) => x.st.costUsd, dir: 1 },
  ];
  tallyEl.replaceChildren(
    h('h2', { class: 'headline' }, over ? `🏆 ${name(leader)} wins the series!` : `🏆 Series tally after ${s.legs.length} of ${s.of} races`),
    h(
      'p',
      { class: 'muted' },
      over
        ? `${s.legs.length} race${s.legs.length > 1 ? 's' : ''}${left > 0 ? ` (clinched with ${left} to spare)` : ''}. `
        : `${name(leader)} leads. `,
      `Points per race: ${SERIES_POINTS.slice(0, racers.length).map((pts, i) => `${['1st', '2nd', '3rd', '4th'][i]} ${pts}`).join(' · ')}. Ties go to most wins, then most correct answers.`,
    ),
    h(
      'div',
      { class: 'table-wrap' },
      sortableStandings(tallyColumns, tallyRows, ({ row, r, st, place }) =>
        h(
          'tr',
          { vars: { '--c': LANES[row.lane].color } },
          h('td', null, String(place)),
          h('td', { class: 'who' }, h('span', { class: 'lane-num' }, String(row.lane + 1)), h('div', null, h('div', { class: 'model', title: r.entry.model }, name(r)), h('div', { class: 'provider' }, r.entry.endpoint.provider.name))),
          h('td', { class: 'num points' }, String(row.points)),
          h('td', { class: 'num' }, String(row.wins)),
          s.legs.map((_, k) => h('td', { class: 'num' }, row.places[k] ? PLACE_MARK[row.places[k] - 1] : '–')),
          h('td', { class: 'num' }, String(st.answered)),
          h('td', { class: 'num' }, String(row.correct)),
          h('td', { class: 'num' }, String(st.incorrect)),
          h('td', { class: 'num' }, fmtPct(st.accuracy)),
          h('td', { class: 'num' }, fmtSec(st.medianLatencyMs)),
          h('td', { class: 'num' }, fmtTps(st.tokPerSecP50, st.tokPerSecEstimated)),
          h('td', { class: 'num' }, fmtUsd(st.costUsd, st.tokensEstimated)),
        ),
      ),
    ),
    h(
      'div',
      { class: 'results-actions export' },
      h(
        'button',
        {
          class: 'btn ghost small',
          type: 'button',
          title: 'The series standings plus every counted race: settings, standings, and every answer with replies and reasoning',
          onclick: () => exportSeries('json', counted, s, racers),
        },
        '⬇ Series results (JSON)',
      ),
      h(
        'button',
        {
          class: 'btn ghost small',
          type: 'button',
          title: 'One row per question per model for every counted race, with a race_no column, for spreadsheets',
          onclick: () => exportSeries('csv', counted, s, racers),
        },
        '⬇ Series answers (CSV)',
      ),
    ),
    h('p', { class: 'muted' }, 'Click a race above to see its lanes, results and question board. Exports never include API keys.'),
  );
}

/** Download every counted race of the series as one file. */
function exportSeries(format: 'json' | 'csv', pages: RacePage[], series: SeriesState, racers: RacerState[]) {
  const races = pages.flatMap((p) => (p.data ? [{ raceNo: p.num, data: p.data }] : []));
  if (!races.length) return;
  const name = `${exportBaseName(new Date(races[0].data.race.startedAt))}-series`;
  if (format === 'json') download(`${name}.json`, JSON.stringify(buildSeriesBundle(buildSeriesExport(series, racers), races), null, 2), 'application/json');
  else download(`${name}.csv`, '\ufeff' + toSeriesCsv(races), 'text/csv;charset=utf-8');
}

/** Record how the latest race ended, for its button in the strip. */
function markLiveRace(result: string, counted: boolean, winner?: string) {
  if (!livePage) return;
  livePage.result = result;
  livePage.counted = counted;
  livePage.winner = winner;
  showRacePage(livePage);
}

// ---------------------------------------------------------------------------
// Presentation mode: full screen, bigger lanes and announcer, no question board.
// ---------------------------------------------------------------------------

const presentBtns = new Set<HTMLButtonElement>();

function labelPresentBtn(b: HTMLButtonElement) {
  const on = document.body.classList.contains('present');
  b.textContent = on ? '✕ Exit presentation' : '📺 Present';
  b.setAttribute('aria-pressed', String(on));
}

function renderPresentBtns() {
  for (const b of presentBtns) {
    if (b.isConnected) labelPresentBtn(b);
    else presentBtns.delete(b); // from a race view that has been replaced
  }
}

function setPresenting(on: boolean) {
  document.body.classList.toggle('present', on);
  renderPresentBtns();
  if (on && !document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {
      /* full screen not allowed here; the bigger layout still applies */
    });
  } else if (!on && document.fullscreenElement) {
    void document.exitFullscreen?.();
  }
  window.scrollTo({ top: 0 });
}

// Leaving full screen (Esc, or the browser's own exit) ends presentation mode too.
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && document.body.classList.contains('present')) setPresenting(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('present')) setPresenting(false);
});

function presentButton(): HTMLButtonElement {
  const b = h('button', {
    class: 'btn ghost present-btn',
    type: 'button',
    title: 'Full screen with bigger lanes, for a projector or screen share (Esc to exit)',
    onclick: () => setPresenting(!document.body.classList.contains('present')),
  });
  labelPresentBtn(b);
  presentBtns.add(b);
  return b;
}

function buildRaceView(racers: RacerState[], distance: number) {
  const series = S.seriesState;
  const announcerEl = h(
    'div',
    { class: 'announcer', 'aria-live': 'polite' },
    h('span', { class: 'mic', 'aria-hidden': 'true' }, '📣'),
    h('span', { class: 'call' }, 'The horses are at the gate…'),
  );
  const timer = h('div', { class: 'hud-value' }, '00:00.0');
  const frontier = h('div', { class: 'hud-value' }, `0 / ${S.questions.length}`);
  const stopBtn = h('button', { class: 'btn danger', type: 'button', disabled: true, onclick: () => S.race?.stop() }, '⏹ Stop race');
  const againBtn = h('button', { class: 'btn', type: 'button', onclick: () => void startRace() }, '🔁 Race again: same questions');
  const newBtn = h(
    'button',
    {
      class: 'btn',
      type: 'button',
      onclick: () => {
        newQuestions();
        void startRace();
      },
    },
    '🎲 New random race',
  );
  const setupBtn = h(
    'button',
    {
      class: 'btn ghost',
      type: 'button',
      onclick: openSetup,
    },
    '⚙ Setup',
  );

  const lanes: LaneUI[] = [];
  const laneEls = racers.map((r, i) => {
    const lane = LANES[i];
    const p = r.entry.endpoint.provider;
    const horse = h('div', { class: 'horse', vars: { '--p': '0' } }, horseSvg(i));
    const score = h('span', { class: 'score' }, `0 / ${distance}`);
    const ok = h('span', { class: 'ok-count', title: 'Correct' }, '✓ 0');
    const bad = h('span', { class: 'bad-count', title: 'Wrong (incorrect, timeout or error)' }, '✗ 0');
    const meta = h('span', {
      class: 'lane-meta',
      title: 'Accuracy · median end-to-end time per answer (latency p50)',
    });
    const state = h('span', { class: 'lane-state' }, 'At the gate');
    lanes.push({ horse, score, ok, bad, meta, state });
    const ticks = Array.from({ length: distance - 1 }, (_, k) =>
      h('span', { class: 'tick', vars: { '--k': String((k + 1) / distance) } }),
    );
    return h(
      'div',
      { class: 'lane', vars: { '--c': lane.color, '--coat': lane.coat, '--mane': lane.mane, '--silk': lane.color } },
      h(
        'div',
        { class: 'lane-info' },
        h(
          'div',
          { class: 'lane-title' },
          h('span', { class: 'lane-num' }, String(i + 1)),
          h(
            'div',
            { class: 'lane-names' },
            modelName(r.entry.model),
            h('div', { class: 'provider' }, p.name),
          ),
        ),
        h('div', { class: 'lane-progress' }, score, state),
        h('div', { class: 'lane-stats' }, ok, bad, meta),
      ),
      h('div', { class: 'track' }, ticks, h('div', { class: 'gate' }), h('div', { class: 'finish' }), horse),
    );
  });
  const lanesWrap = h('div', { class: 'lanes' }, laneEls);

  const tbody = h('tbody');
  const table = h(
    'table',
    { class: 'grid' },
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        h('th', { class: 'qnum' }, '#'),
        h('th', { class: 'qcol' }, 'Question'),
        racers.map((r, i) =>
          h('th', { class: 'mcol', vars: { '--c': LANES[i].color } }, h('span', { class: 'lane-num' }, String(i + 1)), ' ', shortModel(r.entry.model)),
        ),
      ),
    ),
    tbody,
  );

  const results = h('div', { class: 'results', hidden: true });
  const feedbackHost = h('div', { class: 'feedback-host', hidden: true });

  const page = h(
    'div',
    { class: 'race-page' },
    h(
      'div',
      { class: 'hud panel' },
      h('div', { class: 'hud-item' }, h('div', { class: 'hud-label' }, 'Race time'), timer),
      h('div', { class: 'hud-item' }, h('div', { class: 'hud-label' }, 'Leader on question'), frontier),
      h('div', { class: 'hud-item' }, h('div', { class: 'hud-label' }, 'Finish line'), h('div', { class: 'hud-value' }, `${distance} correct`)),
      series
        ? h('div', { class: 'hud-item' }, h('div', { class: 'hud-label' }, `Best of ${series.of}`), h('div', { class: 'hud-value' }, `Race ${Math.min(series.legs.length + 1, series.of)}`))
        : null,
      // In a series, the next race starts from the results (so every race counts once).
      h('div', { class: 'hud-controls' }, stopBtn, series ? null : againBtn, series ? null : newBtn, setupBtn, presentButton()),
    ),
    announcerEl,
    lanesWrap,
    results,
    feedbackHost,
    h(
      'div',
      { class: 'panel grid-panel' },
      h('h2', null, 'Question board'),
      h('div', { class: 'grid-wrap' }, table),
    ),
    );
  mountRacePage(page, series ? series.legs.length + 1 : 0);

  UI = {
    announcer: new Announcer(announcerEl),
    lanes,
    lanesWrap,
    timer,
    frontier,
    results,
    feedbackHost,
    tbody,
    rows: new Map(),
    stopBtn,
    againBtn,
    newBtn,
    setupBtn,
    clockFrame: 0,
  };
}

function setRunningControls(running: boolean) {
  if (!UI) return;
  UI.stopBtn.disabled = !running;
  UI.againBtn.disabled = running;
  UI.newBtn.disabled = running;
}

/**
 * The expected answer line for a question. When the question accepts more than one
 * answer (extra spellings and forms, `aliases`), the primary answer becomes an
 * expandable summary that reveals the other accepted answers.
 */
function answerInfo(q: Question): HTMLElement {
  const line = h('span', { class: 'answer-line' }, 'Answer: ', h('strong', null, q.answer));
  if (!q.aliases.length) return line;
  return h(
    'details',
    { class: 'more-answers' },
    h('summary', { title: 'Show the other answers accepted as correct' }, line),
    h('span', { class: 'aliases' }, h('span', { class: 'aliases-label' }, 'Also accepted: '), q.aliases.join(' · ')),
  );
}

function ensureRow(qi: number): HTMLTableCellElement[] {
  const ui = UI!;
  let cells = ui.rows.get(qi);
  if (cells) return cells;
  const q = S.questions[qi];
  cells = S.race!.racers.map(() => h('td', { class: 'cell waiting' }));
  ui.rows.set(qi, cells);
  const row = h(
    'tr',
    null,
    h('td', { class: 'qnum' }, String(qi + 1)),
    h(
      'td',
      { class: 'qcol' },
      h('div', { class: 'qtext' }, q.question),
      h(
        'div',
        { class: 'qmeta' },
        h('span', { class: `diff ${q.difficulty}` }, q.difficulty),
        isBankQuestion(q) ? h('span', { class: 'qid', title: 'Question ID in the shipped bank (questions.json)' }, `id: ${q.id}`) : null,
        h('span', { class: 'cat' }, q.category),
        ' ',
        answerInfo(q),
      ),
    ),
    cells,
  );
  // First question first. Rows are always created in question order (a horse reaches
  // question n only after n-1, which created that row), so appending keeps them sorted.
  ui.tbody.append(row);
  row.classList.add('fresh');
  ui.frontier.textContent = `${qi + 1} / ${S.questions.length}`;
  return cells;
}

function setPending(td: HTMLTableCellElement) {
  td.className = 'cell pending';
  td.replaceChildren(h('span', { class: 'dots' }, h('i'), h('i'), h('i')));
}

/** "211 tok" for a board cell, with an in/out/reasoning breakdown as its tooltip. */
function tokenBits(res: AnswerResult): { text: string; title: string } | null {
  const t = res.tokens;
  if (!t || t.out == null) return null;
  const parts = [`in ${fmtTok(t.in, t.estimated)}`];
  if (t.cached != null) parts.push(`cached ${fmtTok(t.cached)}`);
  parts.push(`out ${fmtTok(t.out, t.estimated)}`);
  if (t.reasoning) parts.push(`reasoning ${fmtTok(t.reasoning, t.estimated)}`);
  return {
    text: `${fmtTok(t.out, t.estimated)} tok`,
    title: `Tokens: ${parts.join(' · ')}${t.estimated ? ' (estimated from text length)' : ''}`,
  };
}

/** Expandable "Response" with labelled Reasoning and Reply boxes ("(none)" when empty). */
function responseDetails(res: AnswerResult, cutOff = false): HTMLElement {
  const box = (label: string, text: string, cls = '') => [
    h('div', { class: 'detail-label' }, cutOff ? `${label} (so far)` : label),
    text ? h('pre', { class: cls }, text) : h('pre', { class: 'empty' }, '(none)'),
  ];
  return h(
    'details',
    null,
    h('summary', null, cutOff ? 'Response (cut off)' : 'Response'),
    box('Reasoning', res.reasoning, 'reasoning'),
    box('Reply', res.raw),
  );
}

function fillCell(td: HTMLTableCellElement, res: AnswerResult) {
  if (res.timedOut) {
    td.className = 'cell slow';
    const timeoutParts: (Node | null)[] = [
      h('div', { class: 'ans' }, h('span', { class: 'mark' }, '⏱'), h('span', { class: 'txt' }, `Timeout (${fmtLimit(res.latencyMs)})`)),
      // Tells "provider never responded" apart from "model was still thinking".
      h(
        'div',
        { class: 'lat' },
        res.ttftMs != null
          ? `started after ${fmtSec(res.ttftMs)}${tokenBits(res) ? ` · ${tokenBits(res)!.text}` : ''} · counts as wrong`
          : 'no response received · counts as wrong',
      ),
      res.reasoning || res.raw ? responseDetails(res, true) : null,
    ];
    td.replaceChildren(...timeoutParts.filter((n): n is Node => n !== null));
    return;
  }
  td.className = `cell ${res.error ? 'err' : res.correct ? 'ok' : 'bad'}`;
  const mark = res.error ? '⚠' : res.correct ? '✓' : '✗';
  const text = res.error ? res.error : res.answer || '(no answer)';
  const parts: Node[] = [
    h('div', { class: 'ans' }, h('span', { class: 'mark' }, mark), h('span', { class: 'txt', title: res.errorDetail ?? text }, text)),
  ];
  if (res.error) {
    td.title = res.errorDetail ?? res.error;
    parts.push(h('div', { class: 'lat' }, 'Hover for details · see console'));
  }
  if (!res.error) {
    const tok = tokenBits(res);
    parts.push(h('div', { class: 'lat', title: tok?.title }, tok ? `${fmtSec(res.latencyMs)} · ${tok.text}` : fmtSec(res.latencyMs)));
  }
  if (res.reasoning || res.raw) parts.push(responseDetails(res));
  td.replaceChildren(...parts);
}

function updateLane(r: RacerState) {
  const ui = UI!.lanes[r.lane];
  const st = statsOf(r);
  const d = S.race!.distance;
  ui.score.textContent = `${r.correct} / ${d}`;
  ui.ok.textContent = `✓ ${st.correct}`;
  ui.bad.textContent = `✗ ${st.incorrect + st.errors + st.timeouts}`;
  // One decimal is plenty at a glance; the results table has the precise numbers.
  const s1 = (ms: number | null) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)}s`);
  ui.meta.textContent = st.answered
    ? `${fmtPct(st.accuracy)} · latency (p50) ${s1(st.medianLatencyMs)}`
    : '';
  ui.horse.style.setProperty('--p', String(Math.min(1, r.correct / d)));
}

/**
 * Set a lane's status pill. `kind` picks the color: a difficulty level while working,
 * or an end state. `detail` becomes its tooltip.
 */
function setLaneState(lane: number, text: string, kind: string, detail?: string) {
  const el = UI!.lanes[lane].state;
  el.textContent = text;
  el.className = `lane-state ${kind}${detail ? ' has-detail' : ''}`;
  el.title = detail ?? text;
}

function runClock() {
  const ui = UI!;
  const step = () => {
    if (!S.race || UI !== ui) return;
    ui.timer.textContent = fmtClock(S.race.elapsedMs);
    if (!S.race.over) ui.clockFrame = requestAnimationFrame(step);
  };
  ui.clockFrame = requestAnimationFrame(step);
}

async function countdown() {
  const text = h('div', { class: 'cd-text' }, '🎺 To the post!');
  const overlay = h('div', { class: 'countdown', 'aria-live': 'assertive' }, text);
  document.body.append(overlay);
  sound.bugle();
  await wait(1700);
  for (const n of ['3', '2', '1', 'GO!']) {
    text.textContent = n;
    text.classList.remove('pop');
    void text.offsetWidth; // restart the CSS animation
    text.classList.add('pop');
    if (n === 'GO!') sound.go();
    else sound.beep();
    await wait(n === 'GO!' ? 450 : 650);
  }
  overlay.remove();
}

let raceSeq = 0;

async function startRace() {
  cancelAutoNext();
  S.race?.stop();
  UI?.announcer.stop();
  const seq = ++raceSeq;
  // Created once the race exists; events only fire after race.start().
  let commentator: Commentator | null = null;
  const entries = activeHorses().map((hc, i) => ({
    endpoint: endpointFor(i),
    model: hc.model,
    color: LANES[i].color,
    pricing: priceOf(i, hc.model),
  }));
  const race = new Race(entries, S.questions, S.distance, {
    onAsk(r, qi) {
      setPending(ensureRow(qi)[r.lane]);
      const level = S.questions[qi].difficulty;
      setLaneState(r.lane, `Working on Q${qi + 1} · ${LEVEL_LABEL[level]}`, level);
    },
    onText() {
      // Live text isn't shown in the lanes; full replies are on the question board.
    },
    onAnswer(r, res) {
      fillCell(ensureRow(res.questionIndex)[r.lane], res);
      updateLane(r);
      commentator?.answer(r, res, S.questions[res.questionIndex], res.questionIndex + 1);
      const lane = UI!.lanes[r.lane];
      if (res.correct) {
        sound.correct();
        lane.horse.classList.remove('boost');
        void lane.horse.offsetWidth;
        lane.horse.classList.add('boost');
        lane.score.classList.remove('bump');
        void lane.score.offsetWidth;
        lane.score.classList.add('bump');
      } else if (res.error) sound.error();
      else sound.wrong();
      if (r.status === 'dnf') {
        lane.horse.classList.add('out');
        setLaneState(r.lane, '🚫 Withdrawn', 'withdrawn', r.dnfDetail);
      }
    },
    onFinish(r) {
      UI!.lanes[r.lane].horse.classList.add('winner');
      setLaneState(r.lane, '🏆 Finished', 'finished');
      commentator?.finish(r);
    },
    onRacerDone(r) {
      if (r.status === 'done') setLaneState(r.lane, '🏁 Out of questions', 'ended');
    },
    onEnd(summary) {
      if (summary.reason !== 'finish') commentator?.end(summary.reason, summary.ranking[0]);
      // A stopped race doesn't count toward a series.
      if (S.seriesState && summary.reason !== 'stopped' && !seriesOver()) {
        S.seriesState.legs.push({
          order: summary.ranking.map((r) => r.lane),
          correct: race.racers.map((r) => r.correct),
          durationMs: summary.durationMs,
        });
        markLiveRace(`🏆 ${shortModel(summary.ranking[0].entry.model)}`, true, summary.ranking[0].entry.model);
      } else if (S.seriesState) markLiveRace('stopped', false);
      showResults(summary);
    },
  }, S.timeLimitOn ? S.timeLimitSec * 1000 : null);
  S.race = race;
  buildRaceView(race.racers, race.distance);
  setRunningControls(false);
  UI!.againBtn.disabled = UI!.newBtn.disabled = true;
  showView('race');
  await countdown();
  if (seq !== raceSeq || S.race !== race) return; // superseded while counting down
  UI!.lanesWrap.classList.add('racing');
  setRunningControls(true);
  S.raceStartedAt = new Date();
  logRaceStart({
    horses: entries.map((e, i) => ({
      lane: i + 1,
      color: LANES[i].color,
      provider: e.endpoint.provider.name,
      model: e.model,
      baseUrl: e.endpoint.provider.simulated ? '(simulated, no network)' : e.endpoint.baseUrl,
    })),
    questions: S.questions,
    distance: race.distance,
    levels: S.questionsLabel,
    timeLimitSec: race.timeLimitMs == null ? null : race.timeLimitMs / 1000,
  });
  const names = displayNames(
    race.racers.map((r) => ({ lane: r.lane, model: r.entry.model, provider: r.entry.endpoint.provider.name })),
  );
  const announcer = UI!.announcer;
  commentator = new Commentator(
    race.racers,
    race.distance,
    race.questions.length,
    (r) => ({ lane: r.lane, name: names.get(r.lane) ?? r.entry.model, color: LANES[r.lane].color }),
    (parts, priority) => announcer.say(parts, priority),
    (parts) => announcer.final(parts),
  );
  race.start();
  commentator.start();
  runClock();
}

/** What an export needs, captured when a race ends (so a past race in a series exports itself). */
interface ExportContext {
  race: Race;
  startedAt: Date;
  difficulty: string;
  series: SeriesState | null;
}

function raceExportData(summary: RaceSummary, ctx: ExportContext): RaceExport {
  const { race, startedAt } = ctx;
  return buildExport(race.racers, race.questions, race.distance, summary, {
    startedAt,
    difficulty: ctx.difficulty,
    timeLimitMs: race.timeLimitMs,
  });
}

function exportResults(summary: RaceSummary, format: 'json' | 'csv' | 'png', ctx: ExportContext) {
  const { startedAt, race } = ctx;
  const data = raceExportData(summary, ctx);
  const name = exportBaseName(startedAt);
  const series = ctx.series && buildSeriesExport(ctx.series, race.racers);
  if (format === 'json') download(`${name}.json`, JSON.stringify(series ? { ...data, series } : data, null, 2), 'application/json');
  // The BOM makes Excel read the file as UTF-8 (accents, symbols).
  else if (format === 'csv') download(`${name}.csv`, '\ufeff' + toCsv(data), 'text/csv;charset=utf-8');
  else exportPng(`${name}.png`, data, series);
}

/** Render the standings card and save it as a PNG. */
async function exportPng(filename: string, data: RaceExport, series: SeriesExport | null) {
  const canvas = document.createElement('canvas');
  drawResultsCard(canvas, data, series);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (blob) downloadBlob(filename, blob);
}

/** The series has a champion: every race is run, or the leader can't be caught. */
function seriesOver(): boolean {
  const s = S.seriesState;
  return !!s && (seriesDone(s) || seriesClinched(s, S.race?.racers.length ?? S.horseCount));
}

const PLACE_MARK = ['🥇', '🥈', '🥉', '4th'];

/** Series standings (when racing a series) and the buttons for what to do next. */
function seriesAndActions(summary: RaceSummary, name: (r: RacerState) => string): HTMLElement {
  const box = h('div', { class: 'series-box' });
  const render = () => box.replaceChildren(...[nextActions(summary, render), seriesPanel(summary, name)].filter((x): x is HTMLElement => !!x));
  render();
  return box;
}

function seriesPanel(summary: RaceSummary, name: (r: RacerState) => string): HTMLElement | null {
  const s = S.seriesState;
  const race = S.race;
  if (!s || !race) return null;
  const rows = seriesStandings(s, race.racers.length);
  const over = seriesOver();
  const left = s.of - s.legs.length;
  const champ = race.racers[rows[0].lane];
  const title = over
    ? `🏆 ${name(champ)} wins the series!`
    : `Series standings after race ${s.legs.length} of ${s.of}`;
  const note = [
    summary.reason === 'stopped' ? 'This race was stopped, so it doesn’t count. ' : '',
    over && left > 0 ? `Clinched with ${left} race${left > 1 ? 's' : ''} to spare. ` : '',
    `Points per race: ${SERIES_POINTS.slice(0, race.racers.length).map((pts, i) => `${['1st', '2nd', '3rd', '4th'][i]} ${pts}`).join(' · ')}. Ties go to most wins, then most correct answers.`,
  ].join('');
  const raced = Array.from({ length: s.of }, (_, k) => k);
  return h(
    'div',
    { class: `series-panel${over ? ' over' : ''}` },
    h('h3', null, title),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'standings series-table' },
        h('thead', null, h('tr', null, ['Place', 'Horse', 'Points', 'Wins', ...raced.map((k) => `Race ${k + 1}`), 'Correct'].map((t) => h('th', null, t)))),
        h(
          'tbody',
          null,
          rows.map((row, i) => {
            const r = race.racers[row.lane];
            return h(
              'tr',
              { vars: { '--c': LANES[row.lane].color } },
              h('td', null, String(i + 1)),
              h('td', { class: 'who' }, h('span', { class: 'lane-num' }, String(row.lane + 1)), h('div', null, h('div', { class: 'model', title: r.entry.model }, name(r)), h('div', { class: 'provider' }, r.entry.endpoint.provider.name))),
              h('td', { class: 'num points' }, String(row.points)),
              h('td', { class: 'num' }, String(row.wins)),
              raced.map((k) => h('td', { class: 'num' }, row.places[k] ? PLACE_MARK[row.places[k] - 1] : '–')),
              h('td', { class: 'num' }, String(row.correct)),
            );
          }),
        ),
      ),
    ),
    h('p', { class: 'muted' }, note),
  );
}

/** Seconds between races when a series runs on its own. */
const AUTO_NEXT_SEC = 8;
let autoNextTimer = 0;
/** The user paused the current series: no more automatic starts until a new series. */
let seriesPaused = false;

function cancelAutoNext() {
  clearInterval(autoNextTimer);
  autoNextTimer = 0;
}

function nextActions(summary: RaceSummary, rerender: () => void): HTMLElement {
  const btn = (label: string, onclick: () => void, cls = 'btn') => h('button', { class: cls, type: 'button', onclick }, label);
  const go = (series: SeriesState | null) => {
    cancelAutoNext();
    if (!series?.legs.length) seriesPaused = false; // a new series (or a single race) starts unpaused
    S.seriesState = series;
    newQuestions();
    void startRace();
  };
  const s = S.seriesState;
  if (!s) {
    return h(
      'div',
      { class: 'results-actions' },
      btn('🔁 Race again: same questions', () => void startRace()),
      btn('🎲 New random race', () => go(null)),
    );
  }
  if (seriesOver()) {
    return h(
      'div',
      { class: 'next-bar done', role: 'group', 'aria-label': 'Series controls' },
      h('div', { class: 'next-status' }, h('div', null, h('div', { class: 'next-title' }, '🏁 Series complete'), h('div', { class: 'next-sub' }, 'Points, places and totals across every race'))),
      h(
        'div',
        { class: 'next-controls' },
        btn('🏆 See final tally', () => {
          showRacePage('tally');
          window.scrollTo({ top: 0 });
        }),
        btn(`New series (best of ${s.of})`, () => go({ of: s.of, legs: [] }), 'btn ghost'),
        btn('🎲 Single race', () => go(null), 'btn ghost'),
      ),
    );
  }
  const k = s.legs.length + 1;
  const endBtn = btn(
    '⏹ End series',
    () => {
      cancelAutoNext();
      if (!s.legs.length) S.seriesState = null;
      else s.of = s.legs.length; // the standings so far decide it
      rerender();
    },
    'btn ghost',
  );
  const bar = (state: string, status: HTMLElement[], ...controls: HTMLElement[]) =>
    h(
      'div',
      { class: `next-bar ${state}`, role: 'group', 'aria-label': 'Series controls' },
      h('div', { class: 'next-status' }, ...status),
      h('div', { class: 'next-controls' }, ...controls),
    );
  const label = (text: string, sub: string) => [h('div', { class: 'next-title' }, text), h('div', { class: 'next-sub' }, sub)];

  // A race the user stopped never continues by itself.
  if (summary.reason === 'stopped') {
    return bar('waiting', label(`Race ${k} of ${s.of} is next`, 'The stopped race doesn’t count'), btn(`🔁 Run race ${k} again`, () => go(s)), endBtn);
  }
  // The series runs on its own: the next race starts after a short countdown, unless paused.
  // The bar stays in place in every state, so the controls are always where you left them.
  if (seriesPaused) {
    return bar(
      'paused',
      label('⏸ Series paused', `Race ${k} of ${s.of} is next`),
      btn('▶ Start race now', () => go(s)),
      btn(
        '⏵ Resume auto-start',
        () => {
          seriesPaused = false;
          rerender();
        },
        'btn ghost',
      ),
      endBtn,
    );
  }
  let left = AUTO_NEXT_SEC;
  const secs = h('div', { class: 'next-secs', 'aria-hidden': 'true' }, String(left));
  const live = h('div', { class: 'sr-only', role: 'status' }, `Race ${k} of ${s.of} starts in ${left} seconds`);
  cancelAutoNext();
  autoNextTimer = window.setInterval(() => {
    left--;
    if (!secs.isConnected) return cancelAutoNext(); // the view was replaced
    if (left <= 0) return go(s);
    secs.textContent = String(left);
    if (left % 4 === 0) live.textContent = `Race ${k} of ${s.of} starts in ${left} seconds`;
  }, 1000);
  const counting = bar(
    'counting',
    [secs, ...label(`Race ${k} of ${s.of} starts in…`, 'seconds'), live],
    btn('▶ Start now', () => go(s)),
    btn(
      '⏸ Pause',
      () => {
        cancelAutoNext();
        seriesPaused = true;
        rerender();
      },
      'btn ghost',
    ),
    endBtn,
  );
  counting.style.setProperty('--dur', `${AUTO_NEXT_SEC}s`);
  return counting;
}

/** A small button that copies `text()` and shows a brief "Copied" state. */
function copyButton(label: string, text: () => string): HTMLButtonElement {
  let resetTimer: number | undefined;
  const btn = h('button', { type: 'button', class: 'btn ghost small' }, label);
  btn.addEventListener('click', async () => {
    if (!(await copyText(text()))) return;
    btn.textContent = '✓ Copied';
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => (btn.textContent = label), 1800);
  });
  return btn;
}

/**
 * Advisory "question bank feedback" panel, built from the race just run. Shows questions
 * where two or more models agreed on the same wrong answer (likely a missing alias or a
 * wrong key); it never edits the bank. Hidden entirely when there is nothing to show.
 */
function feedbackPanel(insights: Insights): HTMLElement | null {
  const { flags, checked } = insights;
  if (!flags.length) return null;
  return h(
    'div',
    { class: 'panel feedback' },
    h('h2', null, '🔎 Question bank feedback'),
    h(
      'p',
      { class: 'muted' },
      `These questions had several models agree on the same wrong answer — usually a missing alias (or a wrong key). Advisory only: one race is a small sample (${checked} bank question${checked === 1 ? '' : 's'} checked).`,
    ),
    h(
      'ul',
      { class: 'feedback-list' },
      flags.map((f) =>
        h(
          'li',
          { class: 'feedback-item' },
          h(
            'div',
            { class: 'feedback-head' },
            h('span', { class: 'feedback-tag' }, 'Possible missing alias'),
            h('span', { class: `diff ${f.question.difficulty}` }, f.question.difficulty),
            h('span', { class: 'qid', title: 'Question ID in the shipped bank (questions.json)' }, `id: ${f.question.id}`),
          ),
          h('div', { class: 'feedback-q' }, f.question.question),
          h('div', { class: 'feedback-detail' }, `${f.count} of ${f.graded} models answered “${f.answer}” · key “${f.question.answer}”`),
          copyButton('Copy alias patch', () => aliasPatch(f.question, f.answer)),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Race analytics (results): what the standings table can't show: the race over time, accuracy per level
// ---------------------------------------------------------------------------

/** Lane colours for chart marks. Lane 3's yellow is too light on a white card, so it uses a deeper gold. */
const CHART_COLORS = LANES.map((l, i) => (i === 2 ? '#c8901a' : l.color));

/** A coloured dot that says which horse a label belongs to (labels themselves stay in ink). */
const chartKey = (lane: number) => h('span', { class: 'chart-key', vars: { '--c': CHART_COLORS[lane] } });

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Seconds on the time axis: 45s, 1:30. */
const fmtAxisTime = (sec: number) => (sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`);

function chartCard(title: string, hint: string, ...body: (HTMLElement | null)[]): HTMLElement {
  return h(
    'figure',
    { class: 'chart-card' },
    h('figcaption', null, h('strong', null, title), h('span', { class: 'chart-hint' }, hint)),
    body,
  );
}

const PROGRESS_H = 250;
/** Narrower than this, the end-of-line labels are dropped and the legend carries the names. */
const PROGRESS_LABEL_MIN_W = 560;

/** Correct answers against the race clock, one stepped line per horse. */
function progressCard(summary: RaceSummary, distance: number, name: (r: RacerState) => string): HTMLElement | null {
  const racers = summary.ranking;
  const lines = raceProgress(racers, summary.durationMs);
  if (!lines.some((l) => l.points.length > 1)) return null;
  const endMs = Math.max(summary.durationMs, ...lines.map((l) => l.points[l.points.length - 1].tMs), 1);
  const changes = leadChanges(lines);

  const svg = svgEl('svg', { class: 'chart', role: 'img', 'aria-label': 'Correct answers over time for each horse' });
  const tip = h('div', { class: 'chart-tip', hidden: true });
  const plot = h('div', { class: 'chart-plot' }, svg, tip);

  const draw = (width: number) => {
    const labelled = width >= PROGRESS_LABEL_MIN_W;
    const x0 = 30;
    const x1 = width - (labelled ? 150 : 12);
    const y0 = PROGRESS_H - 26;
    const y1 = 18;
    const sx = linearScale([0, endMs], [x0, x1]);
    const sy = linearScale([0, distance], [y0, y1]);
    svg.setAttribute('viewBox', `0 0 ${width} ${PROGRESS_H}`);
    svg.setAttribute('height', String(PROGRESS_H));

    const yTicks = niceTicks(distance).filter((t) => Number.isInteger(t) && t < distance);
    const xTicks = niceTicks(endMs / 1000, width < 480 ? 3 : 6).filter((t) => t * 1000 <= endMs);
    const ends = lines.map((l) => {
      const last = l.points[l.points.length - 1];
      return { lane: l.lane, x: sx(last.tMs), y: sy(last.correct), correct: last.correct };
    });
    const labelY = spreadLabels(ends.map((e) => e.y), 15, y1, y0);

    const hair = svgEl('line', { class: 'chart-hair', y1, y2: y0, visibility: 'hidden' });
    svg.replaceChildren(
      ...yTicks.flatMap((t) => [
        svgEl('line', { x1: x0, x2: x1, y1: sy(t), y2: sy(t), class: t ? 'chart-gridline' : 'chart-axis' }),
        svgEl('text', { x: x0 - 7, y: sy(t), class: 'chart-tick', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, String(t)),
      ]),
      ...xTicks.map((t) => svgEl('text', { x: sx(t * 1000), y: y0 + 16, class: 'chart-tick', 'text-anchor': 'middle' }, fmtAxisTime(t))),
      // The finish line: reaching it ends the race.
      svgEl('line', { x1: x0, x2: x1, y1: sy(distance), y2: sy(distance), class: 'chart-finish' }),
      svgEl('text', { x: x0 - 7, y: sy(distance), class: 'chart-tick strong', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, String(distance)),
      svgEl('text', { x: x0 + 4, y: sy(distance) - 6, class: 'chart-tick strong' }, '🏁 Finish'),
      hair,
      ...lines.map((l) =>
        svgEl('path', {
          class: 'chart-line',
          stroke: CHART_COLORS[l.lane],
          // Stepped: flat until the next correct answer lands, then straight up.
          d: l.points.map((p, i) => (i ? `H${sx(p.tMs).toFixed(1)}V${sy(p.correct).toFixed(1)}` : `M${sx(p.tMs).toFixed(1)},${sy(p.correct).toFixed(1)}`)).join(''),
        }),
      ),
      ...ends.flatMap((e, i) => {
        const r = racers[i];
        const dot = svgEl('circle', { cx: e.x, cy: e.y, r: 5, fill: CHART_COLORS[e.lane], class: 'chart-dot' });
        if (!labelled) return [dot];
        const lx = x1 + 14;
        return [
          // A thin leader ties a label to its line end when the two had to part.
          svgEl('line', { x1: e.x, y1: e.y, x2: lx - 4, y2: labelY[i], class: 'chart-leader' }),
          dot,
          svgEl('text', { x: lx, y: labelY[i], class: 'chart-label', 'dominant-baseline': 'middle' }, `${clip(name(r), 17)} · ${e.correct}`),
        ];
      }),
    );

    // Hover: a hairline at the pointer's time, and every horse's score at that moment.
    svg.onpointermove = (ev) => {
      const box = svg.getBoundingClientRect();
      const px = Math.min(x1, Math.max(x0, ev.clientX - box.left));
      const tMs = ((px - x0) / (x1 - x0)) * endMs;
      hair.setAttribute('x1', String(px));
      hair.setAttribute('x2', String(px));
      hair.setAttribute('visibility', 'visible');
      const rows = lines.map((l, i) => ({ r: racers[i], n: correctAt(l, tMs) })).sort((a, b) => b.n - a.n);
      tip.replaceChildren(
        h('div', { class: 'chart-tip-head' }, `At ${fmtSec(tMs)}`),
        ...rows.map(({ r, n }) => h('div', { class: 'chart-tip-row' }, chartKey(r.lane), h('span', null, clip(name(r), 22)), h('b', null, String(n)))),
      );
      tip.hidden = false;
      const flip = px > (x0 + x1) / 2;
      tip.style.left = flip ? '' : `${px + 12}px`;
      tip.style.right = flip ? `${width - px + 12}px` : '';
    };
    svg.onpointerleave = () => {
      hair.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    };
  };

  // Drawn at the card's real pixel width, so text stays readable from phone to projector.
  new ResizeObserver(([entry]) => {
    const width = Math.floor(entry.contentRect.width);
    if (width > 0) draw(width);
  }).observe(plot);

  const story = changes === 0 ? 'No lead changes' : `${changes} lead change${changes === 1 ? '' : 's'}`;
  return chartCard(
    'How the race unfolded',
    `Correct answers over time · ${story}`,
    h(
      'div',
      { class: 'chart-legend' },
      racers.map((r) => h('span', { title: r.entry.model }, chartKey(r.lane), name(r))),
    ),
    plot,
  );
}

/** Per-level accuracy as a small grid: the deeper the green, the more answers were right. */
function difficultyCard(racers: RacerState[], questions: Question[], name: (r: RacerState) => string): HTMLElement | null {
  const breakdown = difficultyBreakdown(racers, questions);
  const levels = DIFFICULTIES.filter((l) => racers.some((r) => (breakdown.get(r.lane)!.find((x) => x.difficulty === l)?.answered ?? 0) > 0));
  if (levels.length < 2) return null;
  const table = h(
    'table',
    { class: 'level-grid' },
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Horse'), levels.map((l) => h('th', { scope: 'col' }, LEVEL_LABEL[l])))),
    h(
      'tbody',
      null,
      racers.map((r) => {
        const per = breakdown.get(r.lane)!;
        return h(
          'tr',
          null,
          h('th', { scope: 'row', title: r.entry.model }, h('span', { class: 'bar-name' }, chartKey(r.lane), h('span', null, name(r)))),
          ...levels.map((l) => {
            const x = per.find((y) => y.difficulty === l)!;
            if (x.accuracy == null) return h('td', { class: 'none', title: 'No answers at this level' }, '–');
            return h(
              'td',
              { vars: { '--a': (0.04 + x.accuracy * 0.5).toFixed(2) }, title: `${x.correct} of ${x.answered} correct` },
              h('b', null, fmtPct(x.accuracy)),
              h('span', null, `${x.correct}/${x.answered}`),
            );
          }),
        );
      }),
    ),
  );
  return chartCard('Accuracy by difficulty', 'Correct out of answered, per question level · errors and timeouts not counted', h('div', { class: 'table-wrap' }, table));
}

/** The whole analytics section, or null when a race has too little data to show. */
function analyticsSection(summary: RaceSummary, race: Race): HTMLElement | null {
  const name = (r: RacerState) => shortModel(r.entry.model);
  const racers = summary.ranking;
  if (racers.filter((r) => r.answered > 0).length < 2) return null;
  const progress = progressCard(summary, race.distance, name);
  const levels = difficultyCard(racers, race.questions, name);
  if (!progress && !levels) return null;
  return h('div', { class: 'panel analytics' }, h('h2', null, '📊 Race analytics'), progress, levels);
}

function showResults(summary: RaceSummary) {
  const ui = UI!;
  const race = S.race!;
  setRunningControls(false);
  ui.lanesWrap.classList.remove('racing');
  ui.timer.textContent = fmtClock(summary.durationMs);

  // Questions a horse was still working on when the race ended.
  for (const r of race.racers) {
    const qi = r.currentQ;
    if (qi >= 0 && !r.results[qi]) {
      const td = ui.rows.get(qi)?.[r.lane] ?? ensureRow(qi)[r.lane];
      td.className = 'cell cut';
      td.replaceChildren(h('span', { class: 'muted' }, '— race over'));
    }
    if (r.status === 'stopped') setLaneState(r.lane, 'Race over', 'ended');
  }

  const winner = summary.ranking[0];
  const name = (r: RacerState) => shortModel(r.entry.model);
  const headline =
    summary.reason === 'finish'
      ? `🏆 ${name(winner)} wins the derby!`
      : summary.reason === 'stopped'
        ? `⏹ Race stopped. ${name(winner)} was in front.`
        : `🏁 No horse reached the line. ${name(winner)} wins on points!`;

  logRaceEnd({
    headline,
    durationMs: summary.durationMs,
    standings: summary.ranking.map((r, i) => {
      const st = statsOf(r);
      return {
        place: i + 1,
        lane: r.lane + 1,
        model: r.entry.model,
        provider: r.entry.endpoint.provider.name,
        correct: st.correct,
        wrong: st.incorrect,
        timeouts: st.timeouts,
        errors: st.errors,
        accuracy: fmtPct(st.accuracy),
        ttftP50: fmtSec(st.ttftP50Ms),
        latencyP50: fmtSec(st.medianLatencyMs),
        tokPerSec: fmtTps(st.tokPerSecP50, st.tokPerSecEstimated),
        tokensIn: fmtTok(st.tokensIn, st.tokensEstimated),
        cached: st.tokensCached == null ? '–' : fmtTok(st.tokensCached),
        tokensOut: fmtTok(st.tokensOut, st.tokensEstimated),
        cost: fmtUsd(st.costUsd, st.tokensEstimated),
        status: r.status,
      };
    }),
  });

  if (summary.reason !== 'stopped') {
    ui.lanes[winner.lane].horse.classList.add('winner');
    sound.fanfare();
    sound.cheer();
    confetti();
  }

  const podiumOrder = [summary.ranking[1], summary.ranking[0], summary.ranking[2]].filter(Boolean);
  const place = (r: RacerState) => summary.ranking.indexOf(r) + 1;
  const podium = h(
    'div',
    { class: 'podium' },
    podiumOrder.map((r) =>
      h(
        'div',
        {
          class: `step place-${place(r)}`,
          vars: { '--c': LANES[r.lane].color, '--coat': LANES[r.lane].coat, '--mane': LANES[r.lane].mane, '--silk': LANES[r.lane].color },
        },
        h('div', { class: 'podium-horse' }, horseSvg(r.lane)),
        h('div', { class: 'podium-name', title: r.entry.model }, name(r)),
        h('div', { class: 'podium-provider' }, r.entry.endpoint.provider.name),
        h('div', { class: 'podium-score' }, `${r.correct} correct`),
        h('div', { class: 'block' }, ['🥇', '🥈', '🥉'][place(r) - 1]),
      ),
    ),
  );

  const limited = race.timeLimitMs != null;
  // Every column sorts on a click: first click puts the best on top (`dir`), the next reverses it.
  type StandingRow = { r: RacerState; st: RacerStats; place: number };
  const standing: StandingRow[] = summary.ranking.map((r, i) => ({ r, st: statsOf(r), place: i + 1 }));
  const columns: SortColumn<StandingRow>[] = [
    { label: 'Place', key: (x) => x.place, dir: 1 },
    { label: 'Horse', key: (x) => name(x.r).toLowerCase(), dir: 1 },
    { label: 'Correct', key: (x) => x.st.correct, dir: -1 },
    { label: 'Incorrect', key: (x) => x.st.incorrect, dir: 1 },
    ...(limited ? [{ label: `Timeout (${fmtLimit(race.timeLimitMs!)})`, key: (x: StandingRow) => x.st.timeouts, dir: 1 as const }] : []),
    { label: 'Errors', key: (x) => x.st.errors, dir: 1 },
    { label: 'Accuracy', key: (x) => x.st.accuracy, dir: -1 },
    { label: 'TTFT p50', key: (x) => x.st.ttftP50Ms, dir: 1 },
    { label: 'Latency p50', key: (x) => x.st.medianLatencyMs, dir: 1 },
    { label: 'Tok/s p50', key: (x) => x.st.tokPerSecP50, dir: -1 },
    { label: 'Tokens in', key: (x) => (x.st.answered ? x.st.tokensIn : null), dir: -1 },
    { label: 'Cached', key: (x) => x.st.tokensCached, dir: -1 },
    { label: 'Tokens out', key: (x) => (x.st.answered ? x.st.tokensOut : null), dir: -1 },
    { label: 'Cost', key: (x) => x.st.costUsd, dir: 1 },
  ];
  const table = sortableStandings(columns, standing, ({ r, st, place: i }) =>
    h(
    'tr',
    { vars: { '--c': LANES[r.lane].color } },
    h('td', null, String(i)),
    h(
      'td',
      { class: 'who' },
      h('span', { class: 'lane-num' }, String(r.lane + 1)),
      h('div', null, h('div', { class: 'model', title: r.entry.model }, name(r)), h('div', { class: 'provider' }, r.entry.endpoint.provider.name)),
    ),
    h('td', { class: 'num' }, String(st.correct)),
    h('td', { class: 'num' }, String(st.incorrect)),
    limited ? h('td', { class: 'num' }, String(st.timeouts)) : null,
    h('td', { class: 'num' }, String(st.errors)),
    // The count sits under the percentage: 100% of one answer is not 100% of twenty.
    h('td', { class: 'num' }, fmtPct(st.accuracy), st.answered ? h('div', { class: 'of' }, `${st.correct} of ${st.answered}`) : null),
    h('td', { class: 'num', title: 'Median time to first token' }, fmtSec(st.ttftP50Ms)),
    h('td', { class: 'num', title: 'Median end-to-end time per answer' }, fmtSec(st.medianLatencyMs)),
    h(
      'td',
      { class: 'num', title: `Median output speed: output tokens (reasoning included) per second after the first token${st.tokPerSecEstimated ? ' (partly from estimated token counts)' : ''}` },
      fmtTps(st.tokPerSecP50, st.tokPerSecEstimated),
    ),
    h(
      'td',
      { class: 'num', title: st.tokensEstimated ? 'Some counts estimated from text length (~)' : 'Total prompt tokens' },
      st.answered ? fmtTok(st.tokensIn, st.tokensEstimated) : '–',
    ),
    h(
      'td',
      { class: 'num', title: 'Input tokens served from the provider’s prompt cache (– when not reported)' },
      st.tokensCached == null ? '–' : fmtTok(st.tokensCached),
    ),
    h(
      'td',
      {
        class: 'num',
        title: `Total output tokens${st.tokensReasoning ? `, of which reasoning ${fmtTok(st.tokensReasoning, st.tokensEstimated)}` : ''}${st.tokensEstimated ? ' (some estimated)' : ''}`,
      },
      st.answered ? fmtTok(st.tokensOut, st.tokensEstimated) : '–',
    ),
    h(
      'td',
      {
        class: 'num',
        title: r.entry.pricing
          ? `${r.entry.pricing.source === 'models.dev' ? 'From the models.dev catalog' : `From ${r.entry.endpoint.provider.name}’s published prices`}: $${(r.entry.pricing.inPerTok * 1e6).toFixed(2)} / $${(r.entry.pricing.outPerTok * 1e6).toFixed(2)} per 1M input / output tokens${st.tokensEstimated ? ' (token counts partly estimated)' : ''}`
          : 'No published price for this model (only some providers list prices)',
      },
      fmtUsd(st.costUsd, st.tokensEstimated),
    ),
    ),
  );

  const exportCtx: ExportContext = {
    race,
    startedAt: S.raceStartedAt,
    difficulty: S.questionsLabel,
    series: S.seriesState && { of: S.seriesState.of, legs: [...S.seriesState.legs] },
  };
  if (livePage?.race === race) livePage.data = raceExportData(summary, exportCtx);
  const insights = analyzeRace(race.racers, race.questions);

  const resultsPanel = h(
    'div',
    { class: 'panel results-panel' },
    h('h2', { class: 'headline' }, headline),
    h('p', { class: 'muted' }, `Total race time ${fmtClock(summary.durationMs)} · First to ${race.distance} correct answers wins the race · ${S.questions.length} questions (${levelMix(S.questions)}${S.questionsLabel.endsWith(', rising') ? ', rising' : ''})${limited ? ` · timeout ${fmtLimit(race.timeLimitMs!)} per question` : ''}`),
    podium,
    h('div', { class: 'table-wrap' }, table),
    seriesAndActions(summary, name),
    h(
      'div',
      { class: 'results-actions export' },
      h(
        'button',
        {
          class: 'btn ghost small',
          type: 'button',
          title: 'Race settings, standings, and every answer with replies and reasoning',
          onclick: () => exportResults(summary, 'json', exportCtx),
        },
        '⬇ Full results (JSON)',
      ),
      h(
        'button',
        {
          class: 'btn ghost small',
          type: 'button',
          title: 'One row per question per model, for spreadsheets',
          onclick: () => exportResults(summary, 'csv', exportCtx),
        },
        '⬇ Answers (CSV)',
      ),
      h(
        'button',
        {
          class: 'btn ghost small',
          type: 'button',
          title: 'A shareable image of the standings',
          onclick: () => exportResults(summary, 'png', exportCtx),
        },
        '⬇ Results image (PNG)',
      ),
    ),
    h('p', { class: 'muted board-note' }, 'The full question-by-question comparison is on the board below. Exports never include API keys.'),
  );
  // Analytics get a panel of their own, after the standings and the race controls.
  const analytics = analyticsSection(summary, race);
  ui.results.replaceChildren(resultsPanel, ...(analytics ? [analytics] : []));
  ui.results.hidden = false;
  // Bank feedback sits just above the question board, below the results.
  const feedback = feedbackPanel(insights);
  ui.feedbackHost.replaceChildren(...(feedback ? [feedback] : []));
  ui.feedbackHost.hidden = !feedback;
  ui.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

applySharedSetup();
// A link pasted into a tab that already has the app open only changes the hash.
window.addEventListener('hashchange', () => {
  if (!location.hash.startsWith(SHARE_PREFIX)) return;
  applySharedSetup();
  renderSetup();
  if (!S.race || S.race.over) showView('setup');
});
renderSetup();
showView('setup');
