import type { CallPart, Priority } from './commentary';
import { h } from './dom';

/** Dark text on light lane colors (e.g. gold), white on dark ones. Expects #rrggbb. */
function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#2b1a10' : '#fff';
}

const HOLD_MS = 2500; // how long each call stays up
const BUSY_HOLD_MS = 1600; // shorter when calls are queuing up
const MAX_QUEUE = 3;

interface Call {
  parts: CallPart[];
  priority: Priority;
}

/**
 * Shows announcer calls one at a time, at a readable pace. When calls arrive faster
 * than they can be shown, big moments go first and minor ones are dropped.
 */
export class Announcer {
  private queue: Call[] = [];
  private timer = 0;
  private busy = false;

  constructor(private readonly el: HTMLElement) {}

  say(parts: CallPart[], priority: Priority) {
    this.queue.push({ parts, priority });
    // Highest priority first; keeps arrival order within a priority (sort is stable).
    this.queue.sort((a, b) => b.priority - a.priority);
    while (this.queue.length > MAX_QUEUE && this.queue[this.queue.length - 1].priority < 3) this.queue.pop();
    if (!this.busy) this.next();
  }

  /** Show a final call right away and keep it up. */
  final(parts: CallPart[]) {
    this.stop();
    this.show(parts);
  }

  stop() {
    clearTimeout(this.timer);
    this.queue = [];
    this.busy = false;
  }

  private next() {
    const call = this.queue.shift();
    if (!call || !this.el.isConnected) {
      this.busy = false;
      return;
    }
    this.busy = true;
    this.show(call.parts);
    this.timer = window.setTimeout(() => this.next(), this.queue.length ? BUSY_HOLD_MS : HOLD_MS);
  }

  private show(parts: CallPart[]) {
    const text = h(
      'span',
      { class: 'call' },
      parts.map((p) =>
        typeof p === 'string'
          ? p
          : h('strong', { class: 'call-name', vars: { '--c': p.color, '--ink': inkOn(p.color) } }, p.name),
      ),
    );
    this.el.replaceChildren(h('span', { class: 'mic', 'aria-hidden': 'true' }, '📣'), text);
    this.el.classList.remove('pop');
    void this.el.offsetWidth; // restart the animation
    this.el.classList.add('pop');
  }
}
