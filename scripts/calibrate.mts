// Question calibration: run the question bank against a few models and flag questions
// that look too easy, too hard, mislabeled, or likely to have a wrong / incomplete answer key.
//
//   npm run calibrate -- --models a,b,c [--base-url URL] [--key-env NAME] [--expert N] [--limit N] [--concurrency N]
//                        [--file questions.json] [--out DIR]
//
// Keys come from the environment (see .env.example); load them with `set -a; . ./.env; set +a`.
// Defaults: Nebius Token Factory, NEBIUS_API_KEY. Writes calibration/report.md and calibration/results.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { SYSTEM_PROMPT } from '../src/prompt.ts';
import { extractFinalAnswer, isCorrect, normalize, splitThinking } from '../src/grading.ts';
import { generateExpert } from '../src/generated.ts';
import type { Question } from '../src/types.ts';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1]?.startsWith('--') ? 'true' : (process.argv[++i] ?? 'true'));
}
const baseUrl = (args.get('base-url') ?? 'https://api.tokenfactory.nebius.com/v1').replace(/\/+$/, '');
const keyEnv = args.get('key-env') ?? 'NEBIUS_API_KEY';
const apiKey = process.env[keyEnv] ?? '';
const models = (args.get('models') ?? '').split(',').map((m) => m.trim()).filter(Boolean);
const expertCount = Number(args.get('expert') ?? 24);
const limit = Number(args.get('limit') ?? Infinity);
const concurrency = Number(args.get('concurrency') ?? 8);
const TIMEOUT_MS = 90_000;

if (!models.length) {
  console.error('Usage: npm run calibrate -- --models model-a,model-b [--base-url URL] [--key-env NAME]');
  process.exit(1);
}
if (!apiKey) {
  console.error(`${keyEnv} is not set. Load your keys first: set -a; . ./.env; set +a`);
  process.exit(1);
}

const file = args.get('file');
const outDir = args.get('out') ?? 'calibration';
const bank = JSON.parse(readFileSync(file ?? new URL('../src/questions.json', import.meta.url), 'utf8')) as Question[];
const questions: Question[] = [...bank.slice(0, limit), ...generateExpert(expertCount)];

interface Attempt {
  model: string;
  answer: string;
  correct: boolean;
  error?: string;
  ms: number;
}

async function ask(model: string, q: Question): Promise<Attempt> {
  const t0 = performance.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: q.question },
          ],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const j = await res.json();
      const content: string = j.choices?.[0]?.message?.content ?? '';
      const { reply } = splitThinking(content);
      const answer = extractFinalAnswer(reply);
      return { model, answer, correct: isCorrect(answer, [q.answer, ...q.aliases]), ms: performance.now() - t0 };
    } catch (e) {
      if (attempt < 2 && (e as Error).name !== 'TimeoutError') continue;
      return { model, answer: '', correct: false, error: (e as Error).message, ms: performance.now() - t0 };
    }
  }
}

// Run every (question, model) pair with a small worker pool per model.
const results = new Map<number, Attempt[]>(questions.map((_, i) => [i, []]));
let done = 0;
const total = questions.length * models.length;
await Promise.all(
  models.map(async (model) => {
    let next = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (next < questions.length) {
          const i = next++;
          results.get(i)!.push(await ask(model, questions[i]));
          done++;
          if (done % 25 === 0 || done === total) process.stderr.write(`\r${done}/${total} answers`);
        }
      }),
    );
  }),
);
process.stderr.write('\n');

// ---- Analysis ----
const LEVELS = ['easy', 'medium', 'hard', 'expert'] as const;
const rows = questions.map((q, i) => {
  const atts = models.map((m) => results.get(i)!.find((a) => a.model === m)!);
  const graded = atts.filter((a) => !a.error);
  const right = graded.filter((a) => a.correct).length;
  // The most common wrong answer, if several models agree on it.
  const wrong = graded.filter((a) => !a.correct && a.answer).map((a) => normalize(a.answer));
  const counts = new Map<string, number>();
  for (const w of wrong) counts.set(w, (counts.get(w) ?? 0) + 1);
  const [consensus, consensusN] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  return { q, atts, graded: graded.length, right, rate: graded.length ? right / graded.length : null, consensus, consensusN };
});

const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const n = models.length;
const majority = Math.ceil(n / 2);

const byModel = models.map((m) => {
  const per = LEVELS.map((l) => {
    const xs = rows.filter((r) => r.q.difficulty === l).map((r) => r.atts.find((a) => a.model === m)!).filter((a) => !a.error);
    return xs.length ? xs.filter((a) => a.correct).length / xs.length : null;
  });
  const all = rows.map((r) => r.atts.find((a) => a.model === m)!);
  const errors = all.filter((a) => a.error).length;
  const ok = all.filter((a) => !a.error);
  const medMs = ok.map((a) => a.ms).sort((a, b) => a - b)[Math.floor(ok.length / 2)] ?? 0;
  return { m, per, overall: ok.length ? ok.filter((a) => a.correct).length / ok.length : null, errors, medMs };
});

const flagged = {
  // Several models agree on the same "wrong" answer: often a missing alias or a wrong key.
  consensus: rows.filter((r) => r.consensusN >= majority && r.consensusN >= 2),
  allWrong: rows.filter((r) => r.graded === n && r.right === 0),
  easyTooHard: rows.filter((r) => r.q.difficulty === 'easy' && r.rate != null && r.rate < 0.5),
  hardTooEasy: rows.filter((r) => (r.q.difficulty === 'hard' || r.q.difficulty === 'expert') && r.graded === n && r.right === n),
};

const answersCell = (r: (typeof rows)[number]) =>
  r.atts.map((a) => `${a.correct ? '✓' : '✗'} ${esc(a.error ? `(${a.error})` : a.answer || '(no answer)')}`).join('<br>');
const table = (rs: typeof rows) =>
  rs.length
    ? [
        '| # | Level | Question | Key (aliases) | Answers (' + models.map((m) => m.split('/').pop()).join(', ') + ') |',
        '| --- | --- | --- | --- | --- |',
        ...rs.map((r) => `| ${r.q.id ?? '–'} | ${r.q.difficulty} | ${esc(r.q.question)} | ${esc(r.q.answer)}${r.q.aliases.length ? ` (${esc(r.q.aliases.join(', '))})` : ''} | ${answersCell(r)} |`),
      ].join('\n')
    : '_None._';

const md = `# Question calibration

${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · ${baseUrl} · ${questions.length} questions (${bank.slice(0, limit).length} from the bank + ${expertCount} generated Expert) · ${n} models

## Accuracy by level

| Model | Easy | Medium | Hard | Expert | Overall | Errors | Median time |
| --- | --- | --- | --- | --- | --- | --- | --- |
${byModel.map((b) => `| ${b.m} | ${b.per.map(pct).join(' | ')} | ${pct(b.overall)} | ${b.errors} | ${(b.medMs / 1000).toFixed(1)}s |`).join('\n')}

## Likely answer-key problems: models agree on a different answer (${flagged.consensus.length})

${table(flagged.consensus)}

## Every model wrong (${flagged.allWrong.length})

${table(flagged.allWrong)}

## Labeled Easy, but most models miss it (${flagged.easyTooHard.length})

${table(flagged.easyTooHard)}

## Labeled Hard / Expert, but every model gets it (${flagged.hardTooEasy.length})

${table(flagged.hardTooEasy)}
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/report.md`, md);
writeFileSync(
  `${outDir}/results.json`,
  JSON.stringify({ baseUrl, models, byModel, questions: rows.map((r) => ({ ...r.q, rate: r.rate, attempts: r.atts })) }, null, 2),
);
console.log(md.split('## Likely')[0]);
console.log(
  `Flagged: ${flagged.consensus.length} possible key problems · ${flagged.allWrong.length} all wrong · ${flagged.easyTooHard.length} easy-but-missed · ${flagged.hardTooEasy.length} hard-but-easy`,
);
console.log(`Full report: ${outDir}/report.md`);
