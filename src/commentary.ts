import type { RacerState } from './race';
import type { AnswerResult, Question } from './types';

/** A horse mentioned in a call, shown in its lane color. */
export interface Mention {
  lane: number;
  name: string;
  color: string;
}

export type CallPart = string | Mention;

/** 3 = big moment (shown first, never dropped), 2 = notable, 1 = color commentary. */
export type Priority = 1 | 2 | 3;

export type Say = (parts: CallPart[], priority: Priority) => void;

const STREAKS = new Set([3, 5, 7, 10]);

/**
 * Turns race events into announcer calls. Pure logic: it decides what to say,
 * and the caller decides how to show it.
 */
export class Commentator {
  private leader: number | null = null;
  private tiedAtTop = false;
  private firstCorrect = false;
  private halfway = false;
  private finalStretch = false;
  private streaks = new Map<number, number>();

  constructor(
    private readonly racers: RacerState[],
    private readonly distance: number,
    private readonly questionCount: number,
    private readonly mention: (r: RacerState) => Mention,
    private readonly say: Say,
    /** For the closing call: shown immediately, skipping anything still queued. */
    private readonly final: (parts: CallPart[]) => void,
  ) {}

  start() {
    const n = this.racers.length;
    this.say([`And they're off! ${n} horses, ${this.questionCount} questions, first to ${this.distance} wins.`], 3);
  }

  answer(r: RacerState, res: AnswerResult, q: Question, qNo: number) {
    const m = this.mention(r);
    if (r.status === 'dnf') {
      this.say([m, ' is out of the race!'], 3);
      return;
    }
    if (res.correct) {
      const streak = (this.streaks.get(r.lane) ?? 0) + 1;
      this.streaks.set(r.lane, streak);
      if (!this.firstCorrect) {
        this.firstCorrect = true;
        this.say([m, ' gets the first one right!'], 2);
      }
      this.checkLead();
      if (STREAKS.has(streak)) this.say([m, ` is on fire: ${streak} in a row!`], 2);
      this.checkMilestones();
      return;
    }
    this.streaks.set(r.lane, 0);
    if (res.timedOut) this.say(['⏱ ', m, ` times out on Q${qNo}!`], 1);
    else if (!res.error && (q.difficulty === 'hard' || q.difficulty === 'expert')) {
      this.say([m, ` stumbles on Q${qNo} (${q.difficulty === 'hard' ? 'Hard' : 'Expert'})`], 1);
    }
  }

  finish(winner: RacerState) {
    const second = [...this.racers]
      .filter((r) => r !== winner)
      .sort((a, b) => b.correct - a.correct)[0];
    const w = this.mention(winner);
    if (second && winner.correct - second.correct <= 1) {
      this.final(['📸 Photo finish! ', w, ' edges out ', this.mention(second), '!']);
    } else {
      this.final(['🏆 ', w, ' wins the derby!']);
    }
  }

  /** Race ended without a finisher: stopped by the user, or out of questions. */
  end(reason: 'stopped' | 'exhausted', leader: RacerState | undefined) {
    if (reason === 'stopped') this.final(['⏹ Race stopped', ...(leader ? [' with ', this.mention(leader), ' in front.'] : ['.'])]);
    else if (leader) this.final(['🏁 Out of questions! ', this.mention(leader), ' wins on points!']);
  }

  private topRacers(): RacerState[] {
    const best = Math.max(...this.racers.map((r) => r.correct));
    return this.racers.filter((r) => r.correct === best);
  }

  private checkLead() {
    const top = this.topRacers();
    if (top.length === 1) {
      const lane = top[0].lane;
      if (lane !== this.leader && top[0].correct >= 2) this.say([this.mention(top[0]), ' takes the lead!'], 3);
      this.leader = lane;
      this.tiedAtTop = false;
    } else if (!this.tiedAtTop && top[0].correct >= 2) {
      this.tiedAtTop = true;
      const names = top.slice(0, 3).map((r) => this.mention(r));
      const parts: CallPart[] = [];
      names.forEach((n, i) => parts.push(...(i ? [i === names.length - 1 ? ' and ' : ', '] : []), n));
      this.say([...parts, top.length === 2 ? ' are neck and neck!' : ' are tied at the top!'], 2);
    }
  }

  private checkMilestones() {
    const top = this.topRacers();
    const lead = top[0];
    if (!this.halfway && this.distance >= 6 && lead.correct >= Math.ceil(this.distance / 2)) {
      this.halfway = true;
      this.say(['Halfway there! ', this.mention(lead), ` leads with ${lead.correct}.`], 2);
    }
    const left = this.distance - lead.correct;
    if (!this.finalStretch && this.distance >= 5 && left > 0 && left <= 2) {
      this.finalStretch = true;
      this.say(['Final stretch! ', this.mention(lead), ` needs just ${left} more!`], 3);
    }
  }
}

/** Display names that stay unique when two horses run the same model on different providers. */
export function displayNames(racers: { lane: number; model: string; provider: string }[]): Map<number, string> {
  const short = (id: string) => id.split('/').pop() || id;
  const out = new Map<number, string>();
  for (const r of racers) {
    const sameModel = racers.filter((x) => short(x.model) === short(r.model));
    // Name the provider only when it tells same-model horses apart; otherwise use the lane number.
    const needProvider = new Set(sameModel.map((x) => x.provider)).size > 1;
    const needLane = sameModel.filter((x) => x.provider === r.provider).length > 1;
    out.set(r.lane, `${short(r.model)}${needProvider ? ` @ ${r.provider}` : ''}${needLane ? ` #${r.lane + 1}` : ''}`);
  }
  return out;
}
