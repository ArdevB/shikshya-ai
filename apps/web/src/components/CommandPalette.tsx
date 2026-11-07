import { Command } from 'cmdk';
import { KeyRound, LogOut, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useCurrentUser } from '@/auth/AuthContext';
import { navGroups } from '@/components/navigation';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const itemClass =
  'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm transition-colors data-[selected=true]:bg-primary-soft data-[selected=true]:text-primary-dark';
const groupClass =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground';

/** Ctrl+K (or Cmd+K) from anywhere: type a few letters and press Enter to go there. */
export function useCommandPaletteShortcut(setOpen: (update: (open: boolean) => boolean) => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setOpen]);
}

export function CommandPalette({
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  // Reopening during the closing animation would otherwise keep the last search.
  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        onCloseAutoFocus={onCloseAutoFocus}
        className="dialog-palette gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Go to a page</DialogTitle>
        <DialogDescription className="sr-only">
          Type to search the pages you have access to, then press Enter.
        </DialogDescription>
        <Command label="Go to a page" className="flex min-h-0 flex-col">
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <Command.Input
              autoFocus
              value={search}
              onValueChange={setSearch}
              placeholder="Where do you want to go?"
              className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <Command.List className="max-h-[60dvh] overflow-y-auto p-2 sm:max-h-96">
            <Command.Empty className="py-10 text-center text-sm text-muted-foreground">
              Nothing matches that.
            </Command.Empty>
            {navGroups(user.role).map((group) => (
              <Command.Group key={group.label} heading={group.label} className={groupClass}>
                {group.items.map((item) => (
                  <Command.Item
                    key={item.to}
                    value={item.label}
                    keywords={[group.label, ...(item.keywords ?? [])]}
                    className={itemClass}
                    onSelect={() => go(item.to)}
                  >
                    <item.icon className="size-5 shrink-0" aria-hidden />
                    {item.label}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
            <Command.Group heading="Actions" className={groupClass}>
              <Command.Item className={itemClass} onSelect={() => go('/change-password')}>
                <KeyRound className="size-5 shrink-0" aria-hidden />
                Change password
              </Command.Item>
              <Command.Item
                className={itemClass}
                onSelect={() => {
                  onOpenChange(false);
                  void logout().then(() => navigate('/login'));
                }}
              >
                <LogOut className="size-5 shrink-0" aria-hidden />
                Log out
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
