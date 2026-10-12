const THINK_TAGS = 'think|thinking|thought|reasoning';

/** Separate inline reasoning (<think>…</think> and friends) from the final reply. */
export function splitThinking(content: string): { reply: string; thinking: string } {
  let thinking = '';
  let rest = content.replace(new RegExp(`<(${THINK_TAGS})>([\\s\\S]*?)</\\1>`, 'gi'), (_m, _tag, inner: string) => {
    thinking += inner;
    return '';
  });
  // Closing tag without an opening one: the chat template injected <think> before the reply.
  const close = rest.match(new RegExp(`</(${THINK_TAGS})>`, 'i'));
  if (close?.index !== undefined) {
    thinking += rest.slice(0, close.index);
    rest = rest.slice(close.index + close[0].length);
  }
  // Opening tag never closed (truncated reply): everything after it is reasoning.
  const open = rest.match(new RegExp(`<(${THINK_TAGS})>`, 'i'));
  if (open?.index !== undefined) {
    thinking += rest.slice(open.index + open[0].length);
    rest = rest.slice(0, open.index);
  }
  return { reply: rest.trim(), thinking: thinking.trim() };
}

function cleanAnswer(s: string): string {
  return s
    .replace(/\\boxed\{([^{}]*)\}/g, '$1')
    .replace(/\$+/g, '')
    .replace(/[*_`]+/g, '')
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
    .replace(/[.。]+$/, '')
    .trim()
    .slice(0, 200);
}

/** Pull the short final answer out of a reply ("ANSWER: …", \boxed{…}, or the last line). */
export function extractFinalAnswer(reply: string): string {
  const text = reply.trim();
  if (!text) return '';
  const re = /\banswer\b\s*[*_]*\s*[:：]\s*[*_]*\s*([^\n]*)/gi;
  let last: RegExpExecArray | null = null;
  for (let m = re.exec(text); m; m = re.exec(text)) last = m;
  if (last) {
    let ans = last[1].trim();
    if (!cleanAnswer(ans)) {
      const after = text.slice(last.index + last[0].length).split('\n').map((l) => l.trim());
      ans = after.find((l) => cleanAnswer(l)) ?? '';
    }
    return cleanAnswer(ans);
  }
  const boxed = [...text.matchAll(/\\boxed\{([^{}]*)\}/g)].pop();
  if (boxed) return cleanAnswer(boxed[1]);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return cleanAnswer(lines[lines.length - 1] ?? '');
}

const NUMBER_WORDS = new Map<string, number>(
  Object.entries({
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  }),
);
const SCALES = new Map<string, number>([['thousand', 1_000], ['million', 1_000_000]]);
const isNumberWord = (w: string | undefined) => !!w && (NUMBER_WORDS.has(w) || w === 'hundred' || SCALES.has(w));

function wordsToDigits(tokens: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!isNumberWord(tokens[i])) {
      out.push(tokens[i++]);
      continue;
    }
    let total = 0;
    let current = 0;
    let j = i;
    for (; j < tokens.length; j++) {
      const w = tokens[j];
      if (NUMBER_WORDS.has(w)) current += NUMBER_WORDS.get(w)!;
      else if (w === 'hundred') current = (current || 1) * 100;
      else if (SCALES.has(w)) {
        total += (current || 1) * SCALES.get(w)!;
        current = 0;
      } else if (w === 'and' && j > i && isNumberWord(tokens[j + 1])) continue;
      else break;
    }
    out.push(String(total + current));
    i = j;
  }
  return out;
}

/** Canonical form for comparing answers. Both sides go through this, so conversions are symmetric. */
export function normalize(s: string): string {
  let t = s
    .toLowerCase()
    .replace(/ł/g, 'l')
    // A subscript at the end of a number is a base marker: 2626₇ -> 2626, 1a3f₁₆ -> 1a3f.
    // (Elsewhere subscripts are digits, as in chemical formulas: H₂O -> h2o, CO₂ -> co2.)
    .replace(/([0-9a-z]*[0-9][0-9a-z]*\)?)[\u2080-\u2089]+(?![\p{L}\p{N}\u2080-\u2089])/gu, '$1')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/(\d),(?=\d{3}\b)/g, '$1') // 1,000 -> 1000
    // 50.201.940 -> 50201940; needs two or more dot groups, so 1.234 stays a decimal
    .replace(/(?<![\d.])\d{1,3}(?:\.\d{3}){2,}(?!\d|\.\d)/g, (m) => m.replace(/\./g, ''))
    .replace(/[^\p{L}\p{N}.\s]/gu, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ') // keep decimal points only
    .replace(/\s+/g, ' ')
    .replace(/(?<![\d.])\d{1,3}(?: \d{3})+(?![\d.])/g, (m) => m.replace(/ /g, '')); // 50 201 940 -> 50201940
  let tokens = t.split(/\s+/).filter(Boolean);
  // Whole numbers only lose their leading zeros: going through Number would round answers past 2^53.
  tokens = wordsToDigits(tokens).map((w) => (/^\d+$/.test(w) ? w.replace(/^0+(?=\d)/, '') : /^\d+\.\d+$/.test(w) ? String(Number(w)) : w));
  if (tokens.length > 1 && ['the', 'a', 'an'].includes(tokens[0])) tokens = tokens.slice(1);
  t = tokens.join(' ');
  return t;
}

/** True if the extracted answer matches any accepted answer. */
export function isCorrect(answer: string, accepted: string[]): boolean {
  const a = normalize(answer);
  if (!a) return false;
  const short = a.split(' ').length <= 10;
  for (const alt of accepted) {
    const n = normalize(alt);
    if (!n) continue;
    if (a === n) return true;
    // Ignore spaces in words ("Hyper Text" = "hypertext"), but not between numbers (502 019 40 is not 50201940).
    if (/\p{L}/u.test(n) && a.replace(/ /g, '') === n.replace(/ /g, '')) return true;
    // Allow a short answer that contains the accepted answer as whole words ("Paris, France").
    if (short && ` ${a} `.includes(` ${n} `)) return true;
  }
  return false;
}
