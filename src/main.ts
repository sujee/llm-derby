import './style.css';
import { PROVIDERS, providerById } from './providers';
import { describeError, listModels, logError } from './api';
import { Race, statsOf, type RaceSummary, type RacerState } from './race';
import { $, fmtClock, fmtPct, fmtSec, h, wait } from './dom';
import { horseSvg } from './horse';
import { sound } from './sound';
import { confetti } from './confetti';
import { DEFAULT_LEVELS, LEVELS, available, byLevel, ordered, pickQuestions, questionCount, splitCounts } from './questions';
import { GENERATORS, generateExpert } from './generated';
import { buildExport, download, exportBaseName, toCsv } from './export';
import { debugLog, logRaceEnd, logRaceStart } from './debuglog';
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
}

interface Settings {
  horseCount: number;
  horses: HorseConfig[];
  distance: number;
  customBaseUrl: string;
  sound: boolean;
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
const SETTINGS_VERSION = 2; // v2: default time limit raised to 30s

function loadSettings(): Settings {
  const defaults: Settings = {
    horseCount: 4,
    horses: LANES.map(() => ({ providerId: 'nebius', model: '' })),
    distance: 20,
    customBaseUrl: '',
    sound: true,
    debug: false,
    levels: [...DEFAULT_LEVELS],
    rising: false,
    timeLimitOn: true,
    timeLimitSec: 30,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as
      | (Partial<Settings> & { difficulty?: string; v?: number })
      | null;
    if (!saved) return defaults;
    // Settings saved before v2 hold the old 10s/15s default time limit: switch them to 30s once.
    if ((saved.v ?? 1) < 2) delete saved.timeLimitSec;
    // Older versions saved a single `difficulty` ('mixed' or one level).
    let levels = ordered(Array.isArray(saved.levels) ? saved.levels : []);
    if (!levels.length && saved.difficulty) {
      levels = saved.difficulty === 'mixed' ? [...DEFAULT_LEVELS] : ordered([saved.difficulty as Difficulty]);
    }
    const { difficulty: _legacy, v: _version, ...rest } = saved;
    return {
      ...defaults,
      ...rest,
      levels: levels.length ? levels : defaults.levels,
      horses: defaults.horses.map((d, i) => {
        const h = { ...d, ...(saved.horses?.[i] ?? {}) };
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
  keys: {} as Record<string, string>,
  models: {} as Record<string, string[]>,
  modelStatus: {} as Record<string, { state: 'loading' | 'ok' | 'error'; msg: string; detail?: string }>,
  setupError: '',
  questions: [] as Question[],
  /** Difficulty settings the current questions were drawn with. */
  questionsLabel: '',
  race: null as Race | null,
  /** Wall-clock start of the current race, for exports. */
  raceStartedAt: new Date(),
};

function saveSettings() {
  const { horseCount, horses, distance, customBaseUrl, sound: snd, levels, rising, timeLimitOn, timeLimitSec, debug } = S;
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        v: SETTINGS_VERSION,
        horseCount,
        horses,
        distance,
        customBaseUrl,
        sound: snd,
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

const activeHorses = () => S.horses.slice(0, S.horseCount);

function endpointFor(providerId: string): Endpoint {
  const provider = providerById(providerId);
  return {
    provider,
    baseUrl: provider.editableUrl ? S.customBaseUrl : provider.baseUrl,
    apiKey: S.keys[providerId] ?? '',
  };
}

/** "meta-llama/Llama-3.3-70B-Instruct" -> "Llama-3.3-70B-Instruct" */
const shortModel = (id: string) => id.split('/').pop() || id;

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
const MIN_TIME_LIMIT = 3;
const MAX_TIME_LIMIT = 300;

/** Draw a fresh question set using the current difficulty settings. */
function newQuestions() {
  const rising = S.rising && S.levels.length > 1;
  S.questions = pickQuestions(questionCount(S.distance, S.levels), S.levels, rising);
  S.questionsLabel = `${levelsLabel(S.levels)}${rising ? ', rising' : ''}`;
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

const soundBtn = h('button', { class: 'btn ghost sound-btn', type: 'button', onclick: toggleSound });

function renderSoundBtn() {
  soundBtn.textContent = S.sound ? '🔊 Sound on' : '🔇 Sound off';
  soundBtn.setAttribute('aria-pressed', String(S.sound));
}

function toggleSound() {
  S.sound = !S.sound;
  sound.enabled = S.sound;
  saveSettings();
  renderSoundBtn();
}

const debugBtn = h('button', {
  class: 'btn ghost',
  type: 'button',
  title: 'Log every request and response to the browser console (open DevTools → Console)',
  onclick: toggleDebug,
});

function renderDebugBtn() {
  debugBtn.textContent = S.debug ? '🐞 Debug on' : '🐞 Debug off';
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
        h('h1', null, 'LLM Derby'),
        h('p', { class: 'tagline' }, 'Step right up! The fastest, smartest model wins the derby!'),
      ),
      h('div', { class: 'header-toggles' }, debugBtn, soundBtn),
    ),
  ),
  h('main', null, h('section', { id: 'setup' }), h('section', { id: 'race', hidden: true })),
  h(
    'footer',
    { class: 'site-footer' },
    'Runs entirely in your browser. API keys are kept in memory only and sent only to the provider you pick.',
  ),
);
renderSoundBtn();
debugLog.enabled = S.debug;
renderDebugBtn();

function showView(view: 'setup' | 'race') {
  $('#setup').hidden = view !== 'setup';
  $('#race').hidden = view !== 'race';
  window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------------------
// Setup view
// ---------------------------------------------------------------------------

/** Model-list requests in flight, so several cards on one provider share a single request. */
const modelLoads = new Map<string, Promise<void>>();

function loadModelsFor(providerId: string): Promise<void> {
  const ep = endpointFor(providerId);
  const key = `${providerId}|${ep.baseUrl}|${ep.apiKey}`;
  let load = modelLoads.get(key);
  if (!load) {
    load = fetchModels(providerId, ep).finally(() => modelLoads.delete(key));
    modelLoads.set(key, load);
  }
  return load;
}

async function fetchModels(providerId: string, ep: Endpoint) {
  S.modelStatus[providerId] = { state: 'loading', msg: 'Loading models…' };
  renderSetup();
  try {
    const ids = await listModels(ep);
    S.models[providerId] = ids;
    S.modelStatus[providerId] = ids.length
      ? { state: 'ok', msg: `${ids.length} models loaded` }
      : { state: 'error', msg: 'No models returned. Type the model ID instead.' };
  } catch (e) {
    logError(`Loading models for ${providerById(providerId).name}`, e);
    S.modelStatus[providerId] = {
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
  const status = S.modelStatus[p.id];
  const models = S.models[p.id] ?? [];

  // Models load only when "Load models" is clicked. The simulated provider has no button
  // (its models are built in, no network call), so it fills in right away.
  if (!status && p.simulated) {
    S.modelStatus[p.id] = { state: 'loading', msg: 'Loading models…' }; // claim it before other cards render
    queueMicrotask(() => void loadModelsFor(p.id));
  }

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
    PROVIDERS.map((pp) => h('option', { value: pp.id, selected: pp.id === p.id }, pp.name)),
  );

  let urlField: HTMLElement | null = null;
  if (p.editableUrl) {
    const urlInput = h('input', {
      type: 'url',
      placeholder: 'https://your-server.example.com/v1',
      value: S.customBaseUrl,
      spellcheck: 'false',
      'data-fid': `url-${i}`,
      // Update state as you type, and never re-render on blur: that would replace the field
      // or button the user is moving to (and swallow the click).
      oninput: () => {
        S.customBaseUrl = urlInput.value.trim();
        saveSettings();
      },
    });
    urlField = h('label', { class: 'field' }, h('span', null, 'Base URL'), urlInput);
  }

  let keyField: HTMLElement | null = null;
  if (!p.noKey) {
    const keyInput = h('input', {
      type: 'password',
      placeholder: `${p.name} API key`,
      value: S.keys[p.id] ?? '',
      autocomplete: 'off',
      spellcheck: 'false',
      'data-fid': `key-${i}`,
      oninput: () => {
        S.keys[p.id] = keyInput.value.trim();
      },
    });
    keyField = h(
      'label',
      { class: 'field' },
      h(
        'span',
        null,
        'API key',
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
              S.keys[p.id] = keyInput.value.trim();
              S.setupError = '';
              void loadModelsFor(p.id);
            },
            'data-fid': `load-${i}`,
          },
          'Load models',
        ),
      ),
    );
  }

  const listId = `models-${i}`;
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
    },
  });

  return h(
    'article',
    { class: 'horse-card', vars: { '--c': lane.color, '--coat': lane.coat, '--mane': lane.mane, '--silk': lane.color } },
    h('div', { class: 'card-head' }, h('div', { class: 'card-horse' }, horseSvg(i)), h('h3', null, `Horse ${i + 1}`)),
    h('label', { class: 'field' }, h('span', null, 'Provider'), providerSel),
    urlField,
    keyField,
    h('label', { class: 'field' }, h('span', null, 'Model'), modelInput),
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

/** Give each horse a random model from its provider's loaded list, avoiding duplicates where possible. */
function assignRandomModels() {
  const taken = new Set<string>();
  const missing: string[] = [];
  for (const [i, hc] of activeHorses().entries()) {
    const all = S.models[hc.providerId] ?? [];
    if (!all.length) {
      missing.push(`Horse ${i + 1} (${providerById(hc.providerId).name})`);
      continue;
    }
    const fresh = all.filter((m) => !taken.has(`${hc.providerId}|${m}`));
    const pool = fresh.length ? fresh : all;
    hc.model = pool[Math.floor(Math.random() * pool.length)];
    taken.add(`${hc.providerId}|${hc.model}`);
  }
  S.setupError = missing.length ? `Load models first for: ${missing.join(', ')}.` : '';
  saveSettings();
  renderSetup();
}

function validateSetup(): string {
  for (const [i, hc] of activeHorses().entries()) {
    const p = providerById(hc.providerId);
    if (p.editableUrl && !/^https?:\/\/\S+$/.test(S.customBaseUrl)) return `Horse ${i + 1}: enter the custom base URL.`;
    if (!p.noKey && !S.keys[p.id]) return `Horse ${i + 1}: enter your ${p.name} API key.`;
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
    onchange: () => {
      S.timeLimitOn = limitBox.checked;
      limitInput.disabled = !S.timeLimitOn;
      document.querySelector('.limit-help')?.classList.toggle('off', !S.timeLimitOn);
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

  $('#setup').replaceChildren(
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
          countToggle,
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
        { class: 'settings-fields' },
        h(
          'label',
          { class: 'field distance' },
          h('span', null, 'Winning distance (correct answers)'),
          distanceInput,
        ),
        h('div', { class: 'field' }, h('span', null, 'Question difficulty'), levelBoxes),
        h(
          'button',
          {
            class: 'btn big start-btn',
            type: 'button',
            onclick: () => {
              S.setupError = validateSetup();
              if (S.setupError) return renderSetup();
              newQuestions();
              void startRace();
            },
          },
          '🏁 Start the race!',
        ),
        h(
          'div',
          { class: 'options' },
          h(
            'label',
            {
              class: `option${S.levels.length < 2 ? ' off' : ''}`,
              title: 'With two or more levels: questions start with the easiest level and get harder as the race goes on',
            },
            risingBox,
            '📈 Rising difficulty (easy → hard)',
          ),
          h(
            'div',
            { class: 'option', title: 'Answers slower than this count as wrong (shown as “too slow”)' },
            h('label', { class: 'option' }, limitBox, '⏱ Time limit'),
            limitInput,
            h('span', null, 'sec per question'),
          ),
          h(
            'p',
            { class: `limit-help${S.timeLimitOn ? '' : ' off'}` },
            '⏱ Time limit guide: ',
            h('strong', null, '~10s'),
            ' rewards speed (fast “flash” models answer in 2–5s) · ',
            h('strong', null, '15–30s'),
            ' balanced · ',
            h('strong', null, '60s+'),
            ' for reasoning / thinking models and Expert questions. Slower answers count as “too slow”.',
          ),
        ),
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
        qInfo,
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
  tbody: HTMLTableSectionElement;
  rows: Map<number, HTMLTableCellElement[]>;
  stopBtn: HTMLButtonElement;
  againBtn: HTMLButtonElement;
  newBtn: HTMLButtonElement;
  setupBtn: HTMLButtonElement;
  clockFrame: number;
}

let UI: RaceUI | null = null;

function buildRaceView(racers: RacerState[], distance: number) {
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
      onclick: () => {
        S.race?.stop();
        renderSetup();
        showView('setup');
      },
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
    const bad = h('span', { class: 'bad-count', title: 'Wrong (incorrect, too slow or error)' }, '✗ 0');
    const meta = h('span', { class: 'lane-meta', title: 'Accuracy · median response time' });
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
            h('div', { class: 'model', title: r.entry.model }, shortModel(r.entry.model)),
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

  $('#race').replaceChildren(
    h(
      'div',
      { class: 'hud panel' },
      h('div', { class: 'hud-item' }, h('div', { class: 'hud-label' }, 'Race time'), timer),
      h('div', { class: 'hud-item' }, h('div', { class: 'hud-label' }, 'Leader on question'), frontier),
      h('div', { class: 'hud-item' }, h('div', { class: 'hud-label' }, 'Finish line'), h('div', { class: 'hud-value' }, `${distance} correct`)),
      h('div', { class: 'hud-controls' }, stopBtn, againBtn, newBtn, setupBtn),
    ),
    lanesWrap,
    results,
    h(
      'div',
      { class: 'panel grid-panel' },
      h('h2', null, 'Question board'),
      h('div', { class: 'grid-wrap' }, table),
    ),
  );

  UI = {
    lanes,
    lanesWrap,
    timer,
    frontier,
    results,
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
        h('span', { class: 'cat' }, q.category),
        ' Answer: ',
        h('strong', null, q.answer),
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

function fillCell(td: HTMLTableCellElement, res: AnswerResult) {
  if (res.timedOut) {
    td.className = 'cell slow';
    td.replaceChildren(
      h('div', { class: 'ans' }, h('span', { class: 'mark' }, '⏱'), h('span', { class: 'txt' }, 'Too slow')),
      h('div', { class: 'lat' }, `no answer within ${fmtSec(res.latencyMs)}`),
    );
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
  if (!res.error) parts.push(h('div', { class: 'lat' }, fmtSec(res.latencyMs)));
  if (res.reasoning || (res.raw && res.raw !== res.answer)) {
    parts.push(
      h(
        'details',
        null,
        h('summary', null, res.reasoning ? 'Reasoning' : 'Full reply'),
        res.reasoning ? h('pre', { class: 'reasoning' }, res.reasoning) : null,
        res.reasoning && res.raw ? h('div', { class: 'detail-label' }, 'Reply') : null,
        res.raw ? h('pre', null, res.raw) : null,
      ),
    );
  }
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
  const med = st.medianLatencyMs == null ? '–' : `${(st.medianLatencyMs / 1000).toFixed(1)}s`;
  ui.meta.textContent = st.answered ? `${fmtPct(st.accuracy)} · med ${med}` : '';
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
  S.race?.stop();
  const seq = ++raceSeq;
  const entries = activeHorses().map((hc, i) => ({ endpoint: endpointFor(hc.providerId), model: hc.model, color: LANES[i].color }));
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
    },
    onRacerDone(r) {
      if (r.status === 'done') setLaneState(r.lane, '🏁 Out of questions', 'ended');
    },
    onEnd(summary) {
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
  race.start();
  runClock();
}

function exportResults(summary: RaceSummary, format: 'json' | 'csv') {
  const race = S.race;
  if (!race) return;
  const data = buildExport(race.racers, race.questions, race.distance, summary, {
    startedAt: S.raceStartedAt,
    difficulty: S.questionsLabel,
    timeLimitMs: race.timeLimitMs,
  });
  const name = exportBaseName(S.raceStartedAt);
  if (format === 'json') download(`${name}.json`, JSON.stringify(data, null, 2), 'application/json');
  // The BOM makes Excel read the file as UTF-8 (accents, symbols).
  else download(`${name}.csv`, '\ufeff' + toCsv(data), 'text/csv;charset=utf-8');
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
        tooSlow: st.timeouts,
        errors: st.errors,
        accuracy: fmtPct(st.accuracy),
        p50: fmtSec(st.medianLatencyMs),
        p90: fmtSec(st.p90LatencyMs),
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

  const statusLabel = (r: RacerState) =>
    r.status === 'finished' ? `Finished in ${fmtSec(r.finishMs)}` : r.status === 'dnf' ? `Withdrawn: ${r.dnfReason}` : r.status === 'done' ? 'Out of questions' : 'Still running at the end';

  const limited = race.timeLimitMs != null;
  const table = h(
    'table',
    { class: 'standings' },
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        ['Place', 'Horse', 'Correct', 'Incorrect', limited ? 'Too slow' : null, 'Errors', 'Accuracy', 'Median (p50)', 'p90', 'Answered', 'Status']
          .filter((t): t is string => !!t)
          .map((t) => h('th', null, t)),
      ),
    ),
    h(
      'tbody',
      null,
      summary.ranking.map((r, i) => {
        const st = statsOf(r);
        return h(
          'tr',
          { vars: { '--c': LANES[r.lane].color } },
          h('td', null, String(i + 1)),
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
          h('td', { class: 'num' }, fmtPct(st.accuracy)),
          h('td', { class: 'num' }, fmtSec(st.medianLatencyMs)),
          h('td', { class: 'num' }, fmtSec(st.p90LatencyMs)),
          h('td', { class: 'num' }, `${st.answered} / ${S.questions.length}`),
          h('td', { class: `status-cell${r.dnfDetail ? ' has-detail' : ''}`, title: r.dnfDetail }, statusLabel(r)),
        );
      }),
    ),
  );

  ui.results.replaceChildren(
    h(
      'div',
      { class: 'panel results-panel' },
      h('h2', { class: 'headline' }, headline),
      h('p', { class: 'muted' }, `Total race time ${fmtClock(summary.durationMs)} · ${S.questions.length} questions (${S.questionsLabel}) · finish at ${race.distance} correct${limited ? ` · ${fmtSec(race.timeLimitMs)} limit per question` : ''}`),
      podium,
      h('div', { class: 'table-wrap' }, table),
      h(
        'div',
        { class: 'results-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => void startRace() }, '🔁 Race again: same questions'),
        h(
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
            title: 'Race settings, standings, and every answer with replies and reasoning',
            onclick: () => exportResults(summary, 'json'),
          },
          '⬇ Full results (JSON)',
        ),
        h(
          'button',
          {
            class: 'btn ghost small',
            type: 'button',
            title: 'One row per question per model, for spreadsheets',
            onclick: () => exportResults(summary, 'csv'),
          },
          '⬇ Answers (CSV)',
        ),
      ),
      h('p', { class: 'muted' }, 'The full question-by-question comparison is on the board below. Exports never include API keys.'),
    ),
  );
  ui.results.hidden = false;
  ui.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

renderSetup();
showView('setup');
