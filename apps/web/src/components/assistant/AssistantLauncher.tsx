import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Maximize2, Plus, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AssistantChat } from './AssistantChat';

/** The floating button, and the panel it opens, available from every page. */
export function AssistantLauncher() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // The full page has the same chat, and the attendance page has its own bar along the bottom.
  if (pathname === '/assistant' || pathname === '/teacher/attendance') return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Open Shikshya Assistant"
          className="fixed bottom-20 right-4 z-30 flex size-12 items-center justify-center rounded-full bg-gradient-brand text-primary-foreground shadow-lifted transition-transform duration-200 ease-spring hover:scale-105 active:scale-95 md:bottom-6 md:right-6 md:size-14"
        >
          <Sparkles className="size-5 md:size-6" aria-hidden />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content className="assistant-panel" aria-describedby={undefined}>
          <div className="flex h-14 shrink-0 items-center gap-1 border-b px-3">
            <DialogPrimitive.Title className="flex-1 font-heading font-semibold">
              Shikshya Assistant
            </DialogPrimitive.Title>
            <Button
              variant="ghost"
              size="icon"
              aria-label="New conversation"
              onClick={() => setConversationId(null)}
            >
              <Plus />
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link to="/assistant" aria-label="Open the full page" onClick={() => setOpen(false)}>
                <Maximize2 />
              </Link>
            </Button>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <AssistantChat
            autoFocus
            conversationId={conversationId}
            onConversationChange={setConversationId}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
