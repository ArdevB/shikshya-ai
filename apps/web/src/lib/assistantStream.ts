import type { AssistantMessageBody, AssistantStreamEvent } from '@shikshya/shared';
import { openStream } from './api';

/**
 * Pulls the complete events out of what has arrived so far. A network chunk can stop anywhere,
 * even halfway through an event, so whatever is incomplete comes back to be joined to the next one.
 */
export function parseEvents(buffer: string): { events: AssistantStreamEvent[]; rest: string } {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  const events: AssistantStreamEvent[] = [];
  for (const part of parts) {
    if (part.startsWith('data: ')) {
      events.push(JSON.parse(part.slice('data: '.length)) as AssistantStreamEvent);
    }
  }
  return { events, rest };
}

/** Sends a message and calls back with each event as it arrives. */
export async function sendAssistantMessage(
  body: AssistantMessageBody,
  onEvent: (event: AssistantStreamEvent) => void,
) {
  const response = await openStream('/assistant/messages', body);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The browser could not read the reply.');

  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseEvents(buffer);
    buffer = rest;
    events.forEach(onEvent);
  }
}
