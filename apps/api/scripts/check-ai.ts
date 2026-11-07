/**
 * Tries every part of the AI features for real and says plainly what works: `pnpm ai:check`.
 * It uses a little Gemini quota, saves nothing, and never prints a key. It only sends made-up text.
 */
import { env } from '../src/config/env.js';
import { callAiService } from '../src/lib/aiService.js';
import { EMBEDDING_DIMENSIONS, getLlm } from '../src/lib/llm.js';

let failures = 0;

const report = (ok: boolean, what: string, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK    ' : 'FAILED'}  ${what}${detail ? `: ${detail}` : ''}`);
};
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

console.log(`Chat model: ${env.LLM_MODEL}`);
console.log(`Embedding model: ${env.EMBEDDING_MODEL}\n`);

const llm = getLlm();
if (!llm) {
  console.log(`No GEMINI_API_KEY in apps/api/.env, so the assistant says it is not set up.

  1. Create a key at https://aistudio.google.com.
  2. Put it in apps/api/.env as GEMINI_API_KEY=... and restart pnpm dev.

The free tier may use what you send to improve Google's products, and its terms forbid personal
data. Use it with the fake demo data only.`);
  process.exit(1);
}

try {
  let streamed = '';
  const first = await llm.turn({
    system: 'You answer questions about rooms. Always use the tool to find out.',
    input: { kind: 'text', text: 'Which room is the Software Engineering class in?' },
    previousId: null,
    tools: [
      {
        name: 'find_room',
        description: 'Finds the room a class is in.',
        parameters: {
          type: 'object',
          properties: { course: { type: 'string', description: 'The name of the course.' } },
          required: ['course'],
        },
      },
    ],
    onText: () => undefined,
  });
  const call = first.toolCalls[0];
  report(
    Boolean(call),
    'Tool calling',
    call ? `asked for ${call.name}` : 'it did not use the tool',
  );

  if (call) {
    const second = await llm.turn({
      system: 'You answer questions about rooms. Always use the tool to find out.',
      input: {
        kind: 'toolResults',
        results: [
          { callId: call.id, name: call.name, result: '{"room":"Room 301"}', isError: false },
        ],
      },
      previousId: first.id,
      tools: [],
      onText: (text) => {
        streamed += text;
      },
    });
    report(second.text.includes('301'), 'Continuing with the tool result', second.text.trim());
    report(streamed === second.text, 'Streaming the answer as it arrives');
    report(
      second.tokensIn !== null,
      'Reading token usage',
      `${second.tokensIn ?? '?'} in, ${second.tokensOut ?? '?'} out`,
    );
  }
} catch (error) {
  report(false, 'Calling Gemini', reason(error));
}

try {
  const [document, query] = await Promise.all([
    llm.embed(['Students must attend 75 percent of classes.'], 'document'),
    llm.embed(['What attendance is required?'], 'query'),
  ]);
  const size = document[0]?.length ?? 0;
  report(size === EMBEDDING_DIMENSIONS, 'Embeddings', `${size} dimensions`);
  report(query[0]?.length === EMBEDDING_DIMENSIONS, 'Embedding a question');
} catch (error) {
  report(false, 'Embeddings', reason(error));
}

try {
  const quiz = await callAiService<{ questions: { question: string }[] }>('/quiz/generate', {
    text: 'A compiler translates source code into machine code that a computer can run directly.',
    numQuestions: 1,
    types: ['MCQ'],
    difficulty: 'EASY',
  });
  report(quiz.questions.length === 1, 'Quiz generation', quiz.questions[0]?.question);
} catch (error) {
  report(false, 'Quiz generation, which needs the AI service running', reason(error));
}

console.log(failures ? `\n${failures} failed.` : '\nEverything works.');
process.exit(failures ? 1 : 0);
