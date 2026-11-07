import type { AssistantMessageView, AssistantStatus } from '@shikshya/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, SendHorizonal, Sparkles } from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { ErrorState, LoadingRows } from '@/components/feedback';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { sendAssistantMessage } from '@/lib/assistantStream';
import { cn } from '@/lib/utils';

interface LiveMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  text: string;
  toolsUsed: string[];
}

function ToolChips({ tools }: { tools: string[] }) {
  if (tools.length === 0) return null;
  return (
    <ul className="mb-1.5 flex flex-wrap gap-1.5" aria-label="What the assistant looked at">
      {tools.map((tool) => (
        <li
          key={tool}
          className="inline-flex animate-pop items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-dark"
        >
          <Check className="size-3" aria-hidden />
          {tool}
        </li>
      ))}
    </ul>
  );
}

function Bubble({ message, typing }: { message: LiveMessage; typing: boolean }) {
  if (message.role === 'USER') {
    return (
      <div className="flex animate-rise justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary-strong px-3.5 py-2 text-sm text-primary-foreground">
          <span className="sr-only">You said: </span>
          {message.text}
        </p>
      </div>
    );
  }
  return (
    <div className="flex animate-rise gap-2.5">
      <span
        aria-hidden
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-primary-foreground"
      >
        <Sparkles className="size-3.5" />
      </span>
      <div className="min-w-0 max-w-[85%]">
        <span className="sr-only">The assistant said: </span>
        <ToolChips tools={message.toolsUsed} />
        {message.text ? (
          <div className="rounded-2xl rounded-tl-md border bg-card px-3.5 py-2 text-sm">
            <Markdown>{message.text}</Markdown>
          </div>
        ) : (
          typing && (
            <div
              className="flex h-9 items-center gap-1 rounded-2xl rounded-tl-md border bg-card px-3.5"
              role="status"
              aria-label="The assistant is thinking"
            >
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  aria-hidden
                  className="size-1.5 animate-pulse rounded-full bg-muted-foreground"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

/**
 * The conversation itself. It works in the side panel and on the full page, and only needs to be
 * told which conversation to show.
 */
export function AssistantChat({
  conversationId,
  onConversationChange,
  autoFocus = false,
}: {
  conversationId: string | null;
  onConversationChange: (id: string) => void;
  autoFocus?: boolean;
}) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // A conversation this chat just started already has its messages on screen.
  const startedHere = useRef<string | null>(null);

  const status = useQuery({
    queryKey: ['/assistant/status'],
    queryFn: () => api.get<AssistantStatus>('/assistant/status'),
  });

  const history = useQuery({
    queryKey: ['/assistant/conversations', conversationId, 'messages'],
    enabled: Boolean(conversationId) && startedHere.current !== conversationId,
    queryFn: () =>
      api.get<AssistantMessageView[]>(`/assistant/conversations/${conversationId}/messages`),
  });

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setProblem(null);
      startedHere.current = null;
    }
  }, [conversationId]);

  useEffect(() => {
    if (history.data) setMessages(history.data);
  }, [history.data]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages, sending]);

  // The box only exists once the status has loaded, so focusing any earlier would do nothing.
  const ready = status.data?.configured === true;
  useEffect(() => {
    if (autoFocus && ready) input.current?.focus();
  }, [autoFocus, ready]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;
    setDraft('');
    setProblem(null);
    setSending(true);

    const replyId = `reply-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: `sent-${Date.now()}`, role: 'USER', text: message, toolsUsed: [] },
      { id: replyId, role: 'ASSISTANT', text: '', toolsUsed: [] },
    ]);
    const updateReply = (change: (reply: LiveMessage) => LiveMessage) =>
      setMessages((current) =>
        current.map((item) => (item.id === replyId ? change(item) : item)),
      );

    try {
      await sendAssistantMessage(
        { conversationId: conversationId ?? undefined, message },
        (event) => {
          switch (event.type) {
            case 'conversation':
              startedHere.current = event.id;
              if (event.id !== conversationId) onConversationChange(event.id);
              break;
            case 'tool':
              updateReply((reply) => ({ ...reply, toolsUsed: [...reply.toolsUsed, event.label] }));
              break;
            case 'text':
              updateReply((reply) => ({ ...reply, text: reply.text + event.text }));
              break;
            case 'error':
              setProblem(event.message);
              break;
            case 'done':
              break;
          }
        },
      );
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSending(false);
      // An answer that never started should not leave an empty bubble behind.
      setMessages((current) =>
        current.filter((item) => item.id !== replyId || item.text || item.toolsUsed.length),
      );
      void queryClient.invalidateQueries({ queryKey: ['/assistant/conversations'] });
      input.current?.focus();
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send(draft);
    }
  };

  if (status.isPending) return <LoadingRows rows={3} />;
  if (status.isError) {
    return <ErrorState error={status.error} onRetry={() => void status.refetch()} />;
  }

  if (!status.data.configured) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <Sparkles className="size-8 text-primary" aria-hidden />
        <p className="font-heading font-semibold">The assistant is not set up yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          It needs a Google Gemini key. An administrator can add one to the server settings.
        </p>
      </div>
    );
  }

  const showHistoryLoading = history.isFetching && messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        {showHistoryLoading ? (
          <LoadingRows rows={3} />
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-brand text-primary-foreground">
              <Sparkles className="size-6" aria-hidden />
            </span>
            <div>
              <p className="font-heading font-semibold">How can I help?</p>
              <p className="text-sm text-muted-foreground">
                Ask about your classes, or the college rules.
              </p>
            </div>
            <ul className="stagger-children flex w-full max-w-md flex-col gap-2">
              {status.data.starters.map((starter) => (
                <li key={starter}>
                  <button
                    type="button"
                    onClick={() => void send(starter)}
                    className="card-lift w-full rounded-xl border bg-card px-3.5 py-2.5 text-left text-sm"
                  >
                    {starter}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          messages.map((message, index) => (
            <Bubble
              key={message.id}
              message={message}
              typing={sending && index === messages.length - 1}
            />
          ))
        )}
        {problem && (
          <p
            role="alert"
            className="animate-rise rounded-xl border border-accent/40 bg-accent-soft p-3 text-sm"
          >
            {problem}
          </p>
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={submit} className="border-t bg-card p-3">
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="assistant-message">
            Your message
          </label>
          <textarea
            id="assistant-message"
            ref={input}
            rows={1}
            maxLength={2000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask something…"
            className={cn('field h-auto max-h-32 min-h-11 flex-1 resize-none py-2.5')}
          />
          <Button
            type="submit"
            size="icon"
            className="size-11 shrink-0"
            disabled={sending || !draft.trim()}
            aria-label="Send"
          >
            <SendHorizonal />
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Answers come from Google Gemini and can be wrong, so check anything important.
        </p>
      </form>
    </div>
  );
}
