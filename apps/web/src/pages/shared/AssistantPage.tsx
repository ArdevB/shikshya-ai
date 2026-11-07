import type { AssistantConversationView, Paginated } from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AssistantChat } from '@/components/assistant/AssistantChat';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';

export function AssistantPage() {
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);

  const conversations = useQuery({
    queryKey: ['/assistant/conversations'],
    queryFn: () =>
      api.get<Paginated<AssistantConversationView>>('/assistant/conversations?pageSize=50'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/assistant/conversations/${id}`),
    onSuccess: async (_result, id) => {
      if (id === conversationId) setConversationId(null);
      await queryClient.invalidateQueries({ queryKey: ['/assistant/conversations'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const list = conversations.data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Assistant"
        description="Ask about your classes, results, fees and the college rules."
        actions={
          <Button variant="outline" onClick={() => setConversationId(null)}>
            <Plus /> New conversation
          </Button>
        }
      />

      {/* On phones the history is a simple list to pick from, to leave room for the chat. */}
      {list.length > 0 && (
        <div className="mb-3 md:hidden">
          <label className="sr-only" htmlFor="assistant-history">
            Past conversations
          </label>
          <Select
            id="assistant-history"
            value={conversationId ?? ''}
            onChange={(event) => setConversationId(event.target.value || null)}
          >
            <option value="">New conversation</option>
            {list.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.title}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Past conversations" className="hidden md:block">
          {list.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              Your past conversations will appear here.
            </p>
          ) : (
            <ul className="space-y-1">
              {list.map((conversation) => (
                <li key={conversation.id} className="group relative">
                  <button
                    type="button"
                    aria-current={conversation.id === conversationId ? 'true' : undefined}
                    onClick={() => setConversationId(conversation.id)}
                    className={cn(
                      'w-full rounded-xl px-3 py-2 pr-9 text-left text-sm transition-colors duration-200 hover:bg-primary-soft',
                      conversation.id === conversationId && 'bg-primary-soft text-primary-dark',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <MessageSquare className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate font-medium">{conversation.title}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatDateTime(conversation.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete conversation: ${conversation.title}`}
                    onClick={() => remove.mutate(conversation.id)}
                    className="absolute right-1.5 top-2 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <div className="flex h-[calc(100dvh-16rem)] min-h-96 flex-col overflow-hidden rounded-2xl border bg-background shadow-soft">
          <AssistantChat
            autoFocus
            conversationId={conversationId}
            onConversationChange={setConversationId}
          />
        </div>
      </div>
    </>
  );
}
