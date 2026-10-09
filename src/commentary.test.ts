import { describe, expect, it } from 'vitest';
import { Commentator, displayNames, type CallPart } from './commentary';
import type { RacerState } from './race';
import type { AnswerResult, Question } from './types';

const q = (difficulty: Question['difficulty'] = 'easy'): Question => ({
  id: 1, difficulty, category: 'T', question: 'Q?', answer: 'A', aliases: [],
});
const ok: AnswerResult = { questionIndex: 0, raw: '', answer: 'A', reasoning: '', correct: true, latencyMs: 1000 };
const bad: AnswerResult = { ...ok, answer: 'B', correct: false };

function racer(lane: number): RacerState {
  return {
    lane,
    entry: { endpoint: { provider: { id: 'p', name: 'P', baseUrl: '' }, baseUrl: '', apiKey: '' }, model: `m${lane}` },
    results: [], correct: 0, answered: 0, errors: 0, currentQ: 0, status: 'running',
  };
}

function setup(distance = 10) {
  const racers = [racer(0), racer(1)];
  const calls: string[] = [];
  const text = (parts: CallPart[]) => parts.map((p) => (typeof p === 'string' ? p : `<${p.name}>`)).join('');
  const c = new Commentator(
    racers, distance, 15,
    (r) => ({ lane: r.lane, name: `H${r.lane + 1}`, color: '#000' }),
    (parts) => calls.push(text(parts)),
    (parts) => calls.push(`FINAL ${text(parts)}`),
  );
  const score = (r: RacerState, res: AnswerResult, question = q()) => {
    if (res.correct) r.correct++;
    c.answer(r, res, question, 1);
  };
  return { racers, calls, c, score };
}

describe('Commentator', () => {
  it('calls the start, first correct, lead changes and ties', () => {
    const { racers: [a, b], calls, c, score } = setup();
    c.start();
    score(a, ok); // first correct (already the leader, so no separate "takes the lead")
    score(a, ok);
    score(b, ok);
    score(b, ok); // tie at 2
    score(b, ok); // b takes the lead, 3 in a row
    expect(calls).toEqual([
      "And they're off! 2 horses, 15 questions, first to 10 wins.",
      '<H1> gets the first one right!',
      '<H1> and <H2> are neck and neck!',
      '<H2> takes the lead!',
      '<H2> is on fire: 3 in a row!',
    ]);
  });
  it('calls streaks, halfway and the final stretch', () => {
    const { racers: [a], calls, score } = setup(6);
    for (let i = 0; i < 4; i++) score(a, ok);
    expect(calls).toContain('<H1> is on fire: 3 in a row!');
    expect(calls).toContain('Halfway there! <H1> leads with 3.');
    expect(calls).toContain('Final stretch! <H1> needs just 2 more!');
  });
  it('calls stumbles on hard questions and timeouts, but not easy misses', () => {
    const { racers: [a], calls, score } = setup();
    score(a, bad, q('easy'));
    score(a, bad, q('hard'));
    score(a, { ...bad, timedOut: true });
    expect(calls).toEqual(['<H1> stumbles on Q1 (Hard)', '⏱ <H1> times out on Q1!']);
  });
  it('calls a photo finish when the runner-up is one behind', () => {
    const { racers: [a, b], calls, c } = setup();
    a.correct = 10;
    b.correct = 9;
    c.finish(a);
    b.correct = 4;
    c.finish(a);
    expect(calls).toEqual(['FINAL 📸 Photo finish! <H1> edges out <H2>!', 'FINAL 🏆 <H1> wins the derby!']);
  });
});

describe('displayNames', () => {
  it('adds the provider only when two horses share a model name', () => {
    const names = displayNames([
      { lane: 0, model: 'deepseek-ai/DeepSeek-V4', provider: 'Nebius' },
      { lane: 1, model: 'deepseek-ai/DeepSeek-V4', provider: 'GMI Cloud' },
      { lane: 2, model: 'zai-org/GLM-5', provider: 'GMI Cloud' },
      { lane: 3, model: 'sim/steady', provider: 'Sim' },
    ]);
    expect([...names.values()]).toEqual(['DeepSeek-V4 @ Nebius', 'DeepSeek-V4 @ GMI Cloud', 'GLM-5', 'steady']);
  });
  it('uses the lane number when the same model runs twice on the same provider', () => {
    const names = displayNames([
      { lane: 1, model: 'sim/steady', provider: 'Sim' },
      { lane: 3, model: 'sim/steady', provider: 'Sim' },
    ]);
    expect([...names.values()]).toEqual(['steady #2', 'steady #4']);
  });
});
