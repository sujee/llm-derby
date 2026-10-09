// All sounds are synthesized with Web Audio, so there are no audio files to load.
let ctx: AudioContext | null = null;
let enabled = true;

function ac(): AudioContext | null {
  if (!enabled) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.06, slideTo?: number) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + start;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(start: number, dur: number, freq: number, q: number, vol: number, attack = 0.005) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + start;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(t);
}

const N = { G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5 };

export const sound = {
  get enabled() {
    return enabled;
  },
  set enabled(v: boolean) {
    enabled = v;
    if (!v) void ctx?.suspend();
  },
  /** Bugle "call to the post". */
  bugle() {
    const seq: [number, number][] = [
      [N.G4, 0.16], [N.C5, 0.16], [N.E5, 0.16], [N.G5, 0.32], [N.E5, 0.16], [N.G5, 0.5],
    ];
    let t = 0;
    for (const [f, d] of seq) {
      tone(f, t, d * 0.95, 'sawtooth', 0.05);
      tone(f * 2, t, d * 0.95, 'square', 0.015);
      t += d;
    }
  },
  beep() {
    tone(660, 0, 0.18, 'square', 0.06);
  },
  go() {
    tone(990, 0, 0.45, 'square', 0.07);
    tone(1320, 0, 0.45, 'triangle', 0.04);
  },
  correct() {
    tone(N.E6, 0, 0.12, 'triangle', 0.05);
    tone(N.C6 * 1.5, 0.07, 0.18, 'triangle', 0.04);
    for (let i = 0; i < 3; i++) noise(0.02 + i * 0.09, 0.05, 900, 3, 0.25);
  },
  wrong() {
    tone(220, 0, 0.22, 'triangle', 0.05, 140);
  },
  error() {
    tone(160, 0, 0.3, 'sawtooth', 0.03, 110);
  },
  fanfare() {
    const seq: [number, number][] = [[N.C5, 0.14], [N.E5, 0.14], [N.G5, 0.14], [N.C6, 0.6]];
    let t = 0;
    for (const [f, d] of seq) {
      tone(f, t, d, 'square', 0.06);
      tone(f / 2, t, d, 'triangle', 0.05);
      t += d;
    }
    tone(N.E5, t - 0.6, 0.6, 'triangle', 0.035);
    tone(N.G5, t - 0.6, 0.6, 'triangle', 0.035);
  },
  cheer() {
    noise(0, 2.2, 1400, 0.6, 0.18, 0.4);
    noise(0.1, 2.0, 2600, 0.8, 0.08, 0.5);
  },
};
