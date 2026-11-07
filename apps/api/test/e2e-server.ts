/**
 * The real API for browser tests, with stand-ins for the two outside services: a pretend Gemini and
 * a pretend Khalti. Started by apps/web/e2e/playwright.config.ts. Everything else is the real code,
 * including the Khalti gateway, which talks to the stand-in over HTTP as it would to Khalti.
 */
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { type LlmClient, setLlmForTests } from '../src/lib/llm.js';
import { attachRealtime } from '../src/lib/realtime.js';

const KHALTI_PORT = Number(new URL(env.KHALTI_BASE_URL).port);

/** Only knows one thing: asked about attendance, it uses the tool and reads out what comes back. */
const pretendGemini: LlmClient = {
  model: 'pretend-gemini',
  embeddingModel: 'pretend-embedding',
  async turn(request) {
    const usage = { id: 'pretend-turn', tokensIn: 10, tokensOut: 5 };
    if (request.input.kind === 'text') {
      if (/attendance/i.test(request.input.text)) {
        return {
          ...usage,
          text: '',
          toolCalls: [{ id: 'call-1', name: 'get_my_attendance', arguments: {} }],
        };
      }
      request.onText("I don't know.");
      return { ...usage, text: "I don't know.", toolCalls: [] };
    }

    const result = request.input.results[0]?.result ?? '';
    const data = JSON.parse(result.replace(/^<data>/, '').replace(/<\/data>$/, '')) as {
      courses: { code: string; percentage: number }[];
    };
    const text = data.courses
      .map((course) => `${course.code}: ${course.percentage}%`)
      .join(', ');
    const reply = `Your attendance is ${text}.`;
    request.onText(reply);
    return { ...usage, text: reply, toolCalls: [] };
  },
  embed: (texts) => Promise.resolve(texts.map(() => new Array<number>(768).fill(0.1))),
};

/** Enough of Khalti's API for one payment: start it, approve it at once, then confirm it. */
const started = new Map<string, number>();

const pretendKhalti = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    const url = new URL(req.url ?? '/', `http://localhost:${KHALTI_PORT}`);
    const body = chunks.length
      ? (JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>)
      : {};
    const json = (data: unknown) => {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
    };

    if (url.pathname.endsWith('/epayment/initiate/')) {
      const pidx = `pidx-${started.size + 1}`;
      started.set(pidx, Number(body.amount));
      const back = new URLSearchParams({
        return_url: String(body.return_url),
        purchase_order_id: String(body.purchase_order_id),
        pidx,
      });
      json({ pidx, payment_url: `http://localhost:${KHALTI_PORT}/pay?${back.toString()}` });
    } else if (url.pathname === '/pay') {
      // The real page asks for a wallet and PIN. This one approves at once and goes back.
      const back = new URL(url.searchParams.get('return_url') ?? '');
      back.searchParams.set('purchase_order_id', url.searchParams.get('purchase_order_id') ?? '');
      back.searchParams.set('pidx', url.searchParams.get('pidx') ?? '');
      back.searchParams.set('status', 'Completed');
      res.writeHead(302, { Location: back.toString() }).end();
    } else if (url.pathname.endsWith('/epayment/lookup/')) {
      const pidx = String(body.pidx);
      json({
        pidx,
        status: 'Completed',
        total_amount: started.get(pidx),
        transaction_id: `txn-${pidx}`,
      });
    } else {
      res.writeHead(404).end();
    }
  });
});

setLlmForTests(pretendGemini);
pretendKhalti.listen(KHALTI_PORT, 'localhost');

const server = createServer(createApp());
attachRealtime(server);
server.listen(env.PORT, 'localhost');
