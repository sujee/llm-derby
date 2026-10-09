/** The instructions every model gets (also used by scripts/calibrate.mts). */
export const SYSTEM_PROMPT = [
  'You are a contestant in a fast-paced trivia race.',
  'Answer the question correctly and concisely.',
  'End your reply with a final line in exactly this format:',
  'ANSWER: <short answer only>',
].join('\n');
