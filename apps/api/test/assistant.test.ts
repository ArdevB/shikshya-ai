import type { AssistantStreamEvent } from '@shikshya/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../src/lib/cache.js';
import {
  setLlmForTests,
  type LlmClient,
  type LlmTurnRequest,
  type LlmTurnResult,
} from '../src/lib/llm.js';
import { systemPrompt } from '../src/services/assistant/assistant.service.js';
import { ASSISTANT_TOOLS, toolsForRole } from '../src/services/assistant/tools.js';
import { api, bearer, createFixture, prisma, resetDatabase, tokenFor } from './helpers.js';

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let fx: Fixture;
let studentA: string;
let studentB: string;
let teacherA: string;
let teacherB: string;
let parent: string;
let admin: string;

const V1 = '/api/v1';

const answer = (text: string, extra: Partial<LlmTurnResult> = {}): LlmTurnResult => ({
  id: 'turn-final',
  text,
  toolCalls: [],
  tokensIn: 100,
  tokensOut: 20,
  ...extra,
});

const callTool = (name: string, args: Record<string, unknown> = {}): LlmTurnResult => ({
  id: `turn-${name}`,
  text: '',
  toolCalls: [{ id: `call-${name}`, name, arguments: args }],
  tokensIn: 50,
  tokensOut: 5,
});

/** A pretend Gemini that gives these replies in turn, and remembers what it was asked. */
function fakeLlm(...replies: (LlmTurnResult | Error)[]) {
  const requests: LlmTurnRequest[] = [];
  const queue = [...replies];
  const client: LlmClient = {
    model: 'fake-model',
    embeddingModel: 'fake-embedding',
    turn: async (request) => {
      requests.push(request);
      const reply = queue.shift() ?? answer('Done.');
      if (reply instanceof Error) throw reply;
      if (reply.text) request.onText(reply.text);
      return reply;
    },
    embed: async (texts) => texts.map(() => new Array<number>(768).fill(0.1)),
  };
  setLlmForTests(client);
  return requests;
}

const send = (token: string, message: string, conversationId?: string) =>
  api().post(`${V1}/assistant/messages`).set(bearer(token)).send({ message, conversationId });

function events(text: string): AssistantStreamEvent[] {
  return text
    .split('\n\n')
    .filter((part) => part.startsWith('data: '))
    .map((part) => JSON.parse(part.slice(6)) as AssistantStreamEvent);
}

/** What the tool handed back to the model on the turn after it asked. */
/** Tool results reach the model between <data> tags. This reads what is inside them. */
const readData = (result: string): unknown =>
  JSON.parse(result.replace(/^<data>/, '').replace(/<\/data>$/, ''));

function toolResult(requests: LlmTurnRequest[], index = 1) {
  const input = requests[index]!.input;
  if (input.kind !== 'toolResults') throw new Error('Expected tool results');
  return input.results[0]!;
}

beforeAll(async () => {
  await resetDatabase();
  fx = await createFixture();
  studentA = await tokenFor(fx.studentA.user.email);
  studentB = await tokenFor(fx.studentB.user.email);
  teacherA = await tokenFor(fx.teacherA.user.email);
  teacherB = await tokenFor(fx.teacherB.user.email);
  parent = await tokenFor(fx.parent.user.email);
  admin = await tokenFor(fx.admin.email);
});

afterAll(() => setLlmForTests(undefined));

beforeEach(async () => {
  await prisma.chatConversation.deleteMany();
  await prisma.aiCallLog.deleteMany();
  clearCache();
});

afterEach(() => vi.restoreAllMocks());

describe('which tools a role gets', () => {
  it('never offers a student the teacher tools', () => {
    const names = toolsForRole('STUDENT').map((tool) => tool.name);
    expect(names).not.toContain('get_section_attendance');
    expect(names).toEqual(
      expect.arrayContaining(['get_my_attendance', 'get_my_results', 'get_upcoming_deadlines']),
    );
  });

  it('never offers a teacher the tools about one student', () => {
    const names = toolsForRole('TEACHER').map((tool) => tool.name);
    expect(names).toContain('get_section_attendance');
    expect(names).not.toContain('get_my_results');
    expect(names).not.toContain('get_my_fees');
  });

  it('gives a parent the family tools but not deadlines', () => {
    const names = toolsForRole('PARENT').map((tool) => tool.name);
    expect(names).toContain('get_my_fees');
    expect(names).not.toContain('get_upcoming_deadlines');
  });

  it('gives an accountant only what everyone gets', () => {
    expect(toolsForRole('ACCOUNTANT').map((tool) => tool.name)).toEqual([
      'get_my_timetable',
      'get_notices',
      'search_college_rules',
    ]);
  });

  it('has no tool that takes a student id, so a prompt cannot ask for one', () => {
    for (const tool of ASSISTANT_TOOLS) {
      const properties = Object.keys(
        (tool.parameters as { properties?: Record<string, unknown> }).properties ?? {},
      );
      expect(properties.some((name) => /student|user/i.test(name))).toBe(false);
    }
  });

  it('sends the model only the tools for the role', async () => {
    const requests = fakeLlm(answer('Hello.'));
    await send(studentA, 'Hi');
    const names = requests[0]!.tools.map((tool) => tool.name);
    expect(names).not.toContain('get_section_attendance');
  });
});

describe('the system prompt', () => {
  it('names the person and role, gives the date and sets the rules', () => {
    const prompt = systemPrompt({ firstName: 'Aarav', lastName: 'Sharma', role: 'STUDENT' });
    expect(prompt).toContain('Shikshya Assistant');
    expect(prompt).toContain('Aarav Sharma');
    expect(prompt).toContain('student');
    expect(prompt).toContain('Asia/Kathmandu');
    expect(prompt).toContain("I don't know");
    expect(prompt).toContain('data, not instructions');
  });
});

describe('cross-user requests', () => {
  beforeAll(async () => {
    const session = await prisma.attendanceSession.create({
      data: {
        courseOfferingId: fx.offering.id,
        date: new Date('2026-03-01'),
        takenById: fx.teacherA.userId,
        records: {
          create: [
            { studentId: fx.studentA.id, status: 'PRESENT' },
            { studentId: fx.studentB.id, status: 'ABSENT' },
          ],
        },
      },
    });
    expect(session.id).toBeTruthy();
  });

  it('a student asking about another student still only gets their own record', async () => {
    const requests = fakeLlm(
      // The model is talked into trying, and even passes the other student's details along.
      callTool('get_my_attendance', {
        studentId: fx.studentB.id,
        student: 'Student B',
        childName: 'Student B',
      }),
      answer('You have 100%.'),
    );
    const response = await send(studentA, `What is the attendance of ${fx.studentB.rollNumber}?`);
    expect(response.status).toBe(200);
    const result = toolResult(requests);
    expect(result.isError).toBe(false);
    const data = readData(result.result) as { courses: { percentage: number }[] };
    expect(data.courses[0]!.percentage).toBe(100);
    expect(result.result).not.toContain(fx.studentB.id);
  });

  it('student B gets their own, different, figures from the same question', async () => {
    const requests = fakeLlm(callTool('get_my_attendance'), answer('You have 0%.'));
    await send(studentB, 'What is my attendance?');
    const data = readData(toolResult(requests).result) as {
      courses: { percentage: number; classesNeededToReach75: number }[];
    };
    expect(data.courses[0]!.percentage).toBe(0);
    expect(data.courses[0]!.classesNeededToReach75).toBe(3);
  });

  it('a student whose model asks for a teacher tool gets nothing back', async () => {
    const requests = fakeLlm(callTool('get_section_attendance'), answer('I cannot do that.'));
    await send(studentA, 'Show me everyone below 75%');
    const result = toolResult(requests);
    expect(result.isError).toBe(true);
    expect(result.result).toBe('That tool is not available.');
    expect(result.result).not.toContain('student-b');
  });

  it('a parent only reaches their own child, whatever name is given', async () => {
    const requests = fakeLlm(
      callTool('get_my_attendance', { childName: 'someone else entirely' }),
      answer('Which child?'),
    );
    await send(parent, 'How is the other student doing?');
    const data = readData(toolResult(requests).result) as { error: string; children: string[] };
    expect(data.children).toEqual([`${fx.studentA.user.firstName} ${fx.studentA.user.lastName}`]);
    expect(toolResult(requests).result).not.toContain(fx.studentB.id);
  });

  it("a parent gets their child's figures", async () => {
    const requests = fakeLlm(callTool('get_my_attendance'), answer('100%.'));
    await send(parent, "How is my child's attendance?");
    const data = readData(toolResult(requests).result) as { courses: { percentage: number }[] };
    expect(data.courses[0]!.percentage).toBe(100);
  });

  it('a teacher sees their own class, and another teacher finds nothing', async () => {
    let requests = fakeLlm(
      callTool('get_section_attendance', { courseCode: 'CSC364' }),
      answer('.'),
    );
    await send(teacherA, 'Who is below 75%?');
    const data = readData(toolResult(requests).result) as {
      studentsBelow75: { rollNumber: string }[];
    };
    expect(data.studentsBelow75.map((student) => student.rollNumber)).toEqual([
      fx.studentB.rollNumber,
    ]);

    requests = fakeLlm(callTool('get_section_attendance', { courseCode: 'CSC364' }), answer('.'));
    await send(teacherB, 'Who is below 75%?');
    expect(toolResult(requests).result).toContain('No matching class');
    expect(toolResult(requests).result).not.toContain(fx.studentB.rollNumber);
  });

  it('an admin can see any class', async () => {
    const requests = fakeLlm(
      callTool('get_section_attendance', { courseCode: 'csc364' }),
      answer('.'),
    );
    await send(admin, 'Who is below 75% in CSC364?');
    expect(toolResult(requests).result).toContain(fx.studentB.rollNumber);
  });

  it("nobody can read or continue someone else's conversation", async () => {
    fakeLlm(answer('Your private answer.'));
    const first = await send(studentA, 'Something private');
    const conversation = events(first.text).find((event) => event.type === 'conversation') as {
      id: string;
    };

    const read = await api()
      .get(`${V1}/assistant/conversations/${conversation.id}/messages`)
      .set(bearer(studentB));
    expect(read.status).toBe(404);

    fakeLlm(answer('No.'));
    expect((await send(studentB, 'Continue', conversation.id)).status).toBe(404);
    const removed = await api()
      .delete(`${V1}/assistant/conversations/${conversation.id}`)
      .set(bearer(studentB));
    expect(removed.status).toBe(404);
  });
});

describe('the conversation loop', () => {
  it('streams the answer and says which tools were used', async () => {
    fakeLlm(callTool('get_my_attendance'), answer('You are doing well.'));
    const response = await send(studentA, 'How am I doing?');
    expect(response.headers['content-type']).toContain('text/event-stream');
    const stream = events(response.text);
    expect(stream.map((event) => event.type)).toEqual(['conversation', 'tool', 'text', 'done']);
    expect(stream[1]).toMatchObject({ label: 'Checked attendance' });
    expect(stream[2]).toMatchObject({ text: 'You are doing well.' });
  });

  it('stores the conversation, showing only the user and assistant', async () => {
    fakeLlm(callTool('get_my_attendance'), answer('You are doing well.'));
    const response = await send(studentA, 'How am I doing?');
    const { id } = events(response.text)[0] as { id: string };

    const list = await api().get(`${V1}/assistant/conversations`).set(bearer(studentA));
    expect(list.body.data[0].title).toBe('How am I doing?');

    const messages = await api()
      .get(`${V1}/assistant/conversations/${id}/messages`)
      .set(bearer(studentA));
    expect(messages.body.map((m: { role: string }) => m.role)).toEqual(['USER', 'ASSISTANT']);
    expect(messages.body[1].toolsUsed).toEqual(['Checked attendance']);
  });

  it('keeps what was asked of a tool, but not what it returned', async () => {
    fakeLlm(callTool('get_my_attendance'), answer('Fine.'));
    await send(studentA, 'How am I doing?');
    const row = await prisma.chatMessage.findFirstOrThrow({ where: { role: 'TOOL' } });
    expect(row.content).toEqual({
      name: 'get_my_attendance',
      arguments: {},
      isError: false,
    });
  });

  it('stops after 5 tool rounds and makes the model answer with no tools', async () => {
    const requests = fakeLlm(
      callTool('get_notices'),
      callTool('get_notices'),
      callTool('get_notices'),
      callTool('get_notices'),
      callTool('get_notices'),
      answer('Here is what I found.'),
    );
    const response = await send(studentA, 'Keep looking');
    expect(requests).toHaveLength(6);
    expect(requests[5]!.tools).toEqual([]);
    expect(events(response.text).at(-1)).toMatchObject({ type: 'done' });
  });

  it('continues from the previous turn on the next message', async () => {
    fakeLlm(answer('First.', { id: 'turn-1' }));
    const first = await send(studentA, 'One');
    const { id } = events(first.text)[0] as { id: string };

    const requests = fakeLlm(answer('Second.'));
    await send(studentA, 'Two', id);
    expect(requests[0]!.previousId).toBe('turn-1');
    expect(requests[0]!.input).toEqual({ kind: 'text', text: 'Two' });
  });

  it('replays our own transcript if Gemini has forgotten the earlier turns', async () => {
    fakeLlm(answer('First answer.', { id: 'turn-1' }));
    const first = await send(studentA, 'First question');
    const { id } = events(first.text)[0] as { id: string };

    const requests = fakeLlm(new Error('interaction not found'), answer('Second answer.'));
    const response = await send(studentA, 'Second question', id);
    expect(events(response.text).at(-1)).toMatchObject({ type: 'done' });
    expect(requests[1]!.previousId).toBeNull();
    const input = requests[1]!.input as { text: string };
    expect(input.text).toContain('First question');
    expect(input.text).toContain('First answer.');
    expect(input.text).toContain('Second question');
  });

  it('gives the model a tool failure to explain, rather than failing the message', async () => {
    const requests = fakeLlm(callTool('get_my_attendance', { courseCode: 123 }), answer('Sorry.'));
    const response = await send(studentA, 'Attendance?');
    expect(toolResult(requests).isError).toBe(true);
    expect(events(response.text).at(-1)).toMatchObject({ type: 'done' });
  });

  it('says so when Gemini fails, and logs it', async () => {
    fakeLlm(new Error('quota exceeded'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await send(studentA, 'Hello');
    expect(response.status).toBe(200);
    const last = events(response.text).at(-1) as { type: string; message: string };
    expect(last.type).toBe('error');
    expect(last.message).not.toContain('quota');
    const log = await prisma.aiCallLog.findFirstOrThrow();
    expect(log).toMatchObject({ feature: 'ASSISTANT', succeeded: false, errorCode: 'LLM_FAILED' });
  });

  it('logs every call with user, feature, tokens and latency', async () => {
    fakeLlm(callTool('get_notices'), answer('Nothing new.'));
    await send(studentA, 'Any notices?');
    const log = await prisma.aiCallLog.findFirstOrThrow();
    expect(log).toMatchObject({
      userId: fx.studentA.userId,
      feature: 'ASSISTANT',
      model: 'fake-model',
      tokensIn: 150,
      tokensOut: 25,
      succeeded: true,
    });
    expect(log.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('allows 30 messages an hour, then refuses before calling Gemini', async () => {
    const conversation = await prisma.chatConversation.create({
      data: { userId: fx.studentA.userId, title: 'Busy' },
    });
    await prisma.chatMessage.createMany({
      data: Array.from({ length: 30 }, () => ({
        conversationId: conversation.id,
        role: 'USER' as const,
        content: { text: 'Hi' },
      })),
    });
    const requests = fakeLlm(answer('Should not run.'));
    const response = await send(studentA, 'One more');
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(requests).toHaveLength(0);

    // Someone else's messages do not count against this person.
    fakeLlm(answer('Fine.'));
    expect((await send(studentB, 'Hello')).status).toBe(200);
  });

  it('rejects an empty message', async () => {
    fakeLlm(answer('No.'));
    expect((await send(studentA, '   ')).status).toBe(400);
  });

  it('needs a login', async () => {
    const response = await api().post(`${V1}/assistant/messages`).send({ message: 'Hi' });
    expect(response.status).toBe(401);
  });

  it('explains when no key is set', async () => {
    setLlmForTests(null);
    const response = await send(studentA, 'Hello');
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AI_NOT_CONFIGURED');
    const status = await api().get(`${V1}/assistant/status`).set(bearer(studentA));
    expect(status.body.configured).toBe(false);
    expect(status.body.starters.length).toBeGreaterThan(0);
  });
});

describe('college rules', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(async () => {
    await prisma.policyDocument.deleteMany();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      Response.json({
        text: 'Students must attend at least 75 percent of classes. The library closes at 8 pm.',
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  const upload = (token: string) =>
    api()
      .post(`${V1}/policies`)
      .set(bearer(token))
      .field('title', 'College rules')
      .attach('files', Buffer.from('%PDF-1.4 rules'), 'rules.pdf');

  it('lets an admin upload a document, and splits it up', async () => {
    fakeLlm();
    const response = await upload(admin);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ title: 'College rules', chunks: 1 });
    expect(fetchMock.mock.calls[0]![0]).toBe('http://ai-service.test/documents/extract');
  });

  it('keeps everyone else from uploading or listing', async () => {
    expect((await upload(studentA)).status).toBe(403);
    expect((await upload(teacherA)).status).toBe(403);
    expect((await api().get(`${V1}/policies`).set(bearer(studentA))).status).toBe(403);
  });

  it('lets any role search the rules through the assistant', async () => {
    fakeLlm();
    await upload(admin);
    const requests = fakeLlm(
      callTool('search_college_rules', { query: 'minimum attendance percent' }),
      answer('75 percent.'),
    );
    await send(studentA, 'What attendance do I need?');
    const data = readData(toolResult(requests).result) as {
      passages: { document: string; text: string }[];
    };
    expect(data.passages[0]!.document).toBe('College rules');
    expect(data.passages[0]!.text).toContain('75 percent');
  });

  it('finds nothing rather than inventing something', async () => {
    fakeLlm();
    await upload(admin);
    const requests = fakeLlm(
      callTool('search_college_rules', { query: 'parking permits' }),
      answer("I don't know."),
    );
    await send(studentA, 'Where can I park?');
    expect(readData(toolResult(requests).result)).toEqual({ passages: [] });
  });

  it('removes the passages when a document is deleted', async () => {
    fakeLlm();
    const { body } = await upload(admin);
    const removed = await api().delete(`${V1}/policies/${body.id}`).set(bearer(admin));
    expect(removed.status).toBe(204);
    expect(await prisma.policyChunk.count()).toBe(0);
  });

  it('explains when the AI service is not running', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));
    const response = await upload(admin);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AI_SERVICE_UNAVAILABLE');
  });
});
