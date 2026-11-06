import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  KeyRound,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  User,
  X,
} from 'lucide-react';
import { LayoutGroup, motion } from 'motion/react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useCurrentUser } from '@/auth/AuthContext';
import { roleLabel } from '@/auth/roles';
import { CommandPalette, useCommandPaletteShortcut } from '@/components/CommandPalette';
import { PageSkeleton } from '@/components/feedback';
import { Logo, LogoMark } from '@/components/Logo';
import { TopProgressBar } from '@/components/motion';
import { findNavTrail, navGroups, primaryNav, type NavItem } from '@/components/navigation';
import { NotificationBell } from '@/components/NotificationBell';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { PAGE_ENTER, SLIDE } from '@/lib/motion';
import { cn } from '@/lib/utils';

const COLLAPSED_KEY = 'shikshya.sidebar-collapsed';

function useUnreadNotices() {
  const { data } = useQuery({
    queryKey: ['notices', 'unread-count'],
    queryFn: () => api.get<{ count: number }>('/notices/unread-count'),
    refetchInterval: 60_000,
  });
  return data?.count ?? 0;
}

function NavRow({
  item,
  collapsed,
  unread,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  unread: number;
  onNavigate?: () => void;
}) {
  const showBadge = item.badge === 'notices' && unread > 0;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-200',
          isActive
            ? 'text-primary-dark'
            : 'text-foreground/80 hover:bg-primary-soft/60 hover:text-foreground',
          collapsed && 'justify-center px-0',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              transition={SLIDE}
              className="absolute inset-0 rounded-xl bg-primary-soft"
            >
              <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-accent" />
            </motion.span>
          )}
          <item.icon
            className="relative size-5 shrink-0 transition-transform duration-200 ease-spring group-hover:scale-110"
            aria-hidden
          />
          {!collapsed && <span className="relative flex-1 truncate">{item.label}</span>}
          {showBadge && (
            <span
              key={unread}
              aria-label={`${unread} unread`}
              className={cn(
                'animate-pop rounded-full bg-accent-strong text-xs font-semibold text-accent-foreground',
                collapsed
                  ? 'absolute right-1.5 top-1 flex size-4 items-center justify-center text-[10px]'
                  : 'relative px-2 py-0.5',
              )}
            >
              {unread}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function SidebarNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const user = useCurrentUser();
  const unread = useUnreadNotices();
  return (
    <LayoutGroup id={onNavigate ? 'drawer' : 'sidebar'}>
      <nav aria-label="Main" className="flex flex-col gap-4 p-3">
        {navGroups(user.role).map((group) => (
          <div key={group.label}>
            {collapsed ? (
              <div className="mx-3 mb-2 border-t" aria-hidden />
            ) : (
              <p className="mb-1 px-3 text-xs font-semibold text-muted-foreground">{group.label}</p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavRow
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  unread={unread}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </LayoutGroup>
  );
}

/** The phone's way around: the four most-used places in reach of a thumb, and everything else. */
function BottomBar({ onOpenMore }: { onOpenMore: () => void }) {
  const user = useCurrentUser();
  const unread = useUnreadNotices();
  const itemClass = (active: boolean) =>
    cn(
      'relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-200',
      active ? 'text-primary-dark' : 'text-muted-foreground',
    );
  return (
    <LayoutGroup id="bottom-bar">
      <nav
        aria-label="Quick links"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <ul className="grid grid-cols-5">
          {primaryNav(user.role).map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) => itemClass(isActive)}
              >
                {({ isActive }) => (
                  <>
                    <span className="relative flex h-8 w-14 items-center justify-center">
                      {isActive && (
                        <motion.span
                          layoutId="bottom-active"
                          transition={SLIDE}
                          className="absolute inset-0 rounded-full bg-primary-soft"
                        />
                      )}
                      <item.icon className="relative size-5" aria-hidden />
                      {item.badge === 'notices' && unread > 0 && (
                        <span
                          aria-label={`${unread} unread`}
                          className="absolute right-2 top-0.5 size-2.5 animate-pop rounded-full bg-accent-strong ring-2 ring-background"
                        />
                      )}
                    </span>
                    <span className="max-w-full truncate px-1">
                      {item.label.replace('My ', '').replace('Take ', '')}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" onClick={onOpenMore} className={cn(itemClass(false), 'w-full')}>
              <span className="flex h-8 w-14 items-center justify-center">
                <Menu className="size-5" aria-hidden />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>
    </LayoutGroup>
  );
}

function Breadcrumb() {
  const user = useCurrentUser();
  const { pathname } = useLocation();
  const trail = findNavTrail(user.role, pathname);
  if (!trail) return null;
  return (
    <nav aria-label="You are here" className="hidden items-center gap-1.5 text-sm md:flex">
      <span className="text-muted-foreground">{trail.group.label}</span>
      <ChevronRight className="size-4 text-muted-foreground/70" aria-hidden />
      <span key={trail.item.to} aria-current="page" className="animate-rise font-medium">
        {trail.item.label}
      </span>
    </nav>
  );
}

function UserMenu() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const itemClass =
    'flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm outline-none transition-colors data-[highlighted]:bg-primary-soft';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" className="gap-2 px-1.5 sm:px-2" aria-label="Account menu">
          <span className="flex size-9 items-center justify-center rounded-full bg-gradient-brand text-xs font-bold text-primary-foreground shadow-sm">
            {initials}
          </span>
          <span className="hidden text-left lg:block">
            <span className="block text-sm leading-tight">
              {user.firstName} {user.lastName}
            </span>
            <span className="block text-xs font-normal leading-tight text-muted-foreground">
              {roleLabel(user.role)}
            </span>
          </span>
          <ChevronDown className="hidden text-muted-foreground sm:block" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="menu-content min-w-56 p-1.5">
          <div className="border-b px-2 pb-2 pt-1 lg:hidden">
            <p className="text-sm font-medium">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-muted-foreground">{roleLabel(user.role)}</p>
          </div>
          <DropdownMenu.Item asChild className={itemClass}>
            <Link to="/profile">
              <User className="size-4" aria-hidden /> Profile
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={itemClass}>
            <Link to="/notifications/preferences">
              <Bell className="size-4" aria-hidden /> Notification settings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={itemClass}>
            <Link to="/change-password">
              <KeyRound className="size-4" aria-hidden /> Change password
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item className={itemClass} onSelect={() => void handleLogout()}>
            <LogOut className="size-4" aria-hidden /> Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function AppLayout() {
  const user = useCurrentUser();
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1');
  const main = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const [announcement, setAnnouncement] = useState('');

  useCommandPaletteShortcut(setPaletteOpen);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    document.documentElement.style.setProperty('--sidebar-width', collapsed ? '5.25rem' : '17rem');
  }, [collapsed]);

  // After moving to another page: close the phone menu, start at the top, and tell keyboard and
  // screen reader users where they are. A click on a link would otherwise leave them nowhere.
  useEffect(() => {
    setDrawerOpen(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    main.current?.focus({ preventScroll: true });
    setAnnouncement(findNavTrail(user.role, pathname)?.item.label ?? '');
  }, [pathname, user.role]);

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="fixed left-3 top-3 z-[70] -translate-y-20 rounded-xl bg-primary-strong px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lifted transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <TopProgressBar />
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] flex-col border-r bg-card/70 backdrop-blur-xl transition-[width] duration-300 ease-spring md:flex">
        <div
          className={cn(
            'flex h-16 shrink-0 items-center border-b px-5',
            collapsed && 'justify-center px-0',
          )}
        >
          {collapsed ? <LogoMark /> : <Logo />}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <SidebarNav collapsed={collapsed} />
        </div>
        <div className="shrink-0 border-t p-3">
          <Button
            variant="ghost"
            className={cn('w-full justify-start gap-3 font-medium', collapsed && 'justify-center')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed && 'Collapse'}
          </Button>
        </div>
      </aside>

      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="dialog-overlay" />
          <DialogPrimitive.Content className="drawer-content" aria-describedby={undefined}>
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <div className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-xl">
              <Logo />
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close menu">
                  <X />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-h-dvh min-w-0 flex-col transition-[padding] duration-300 ease-spring md:pl-[var(--sidebar-width)]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border/70 bg-background/75 px-4 backdrop-blur-xl md:px-8">
          <div className="md:hidden">
            <LogoMark />
          </div>
          <Breadcrumb />
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search pages"
            aria-keyshortcuts="Control+K Meta+K"
            className="flex size-10 items-center justify-center gap-2 rounded-xl text-sm text-muted-foreground transition-colors hover:bg-primary-soft hover:text-foreground lg:h-10 lg:w-56 lg:justify-start lg:border lg:bg-card lg:px-3 lg:shadow-sm"
          >
            <Search className="size-[18px] shrink-0" aria-hidden />
            <span className="hidden flex-1 text-left lg:block">Search…</span>
            <kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium lg:block">
              Ctrl K
            </kbd>
          </button>
          <NotificationBell />
          <UserMenu />
        </header>

        <main
          ref={main}
          id="main"
          tabIndex={-1}
          className="flex-1 p-4 pb-24 focus-visible:ring-0 focus-visible:ring-offset-0 md:p-8"
        >
          {/* The boundary sits outside the keyed page, so moving between pages keeps the old one
              on screen until the new one is ready, rather than flashing a loading state. */}
          <Suspense fallback={<PageSkeleton />}>
            <motion.div key={pathname} {...PAGE_ENTER} className="mx-auto max-w-6xl">
              <Outlet />
            </motion.div>
          </Suspense>
        </main>
      </div>

      <BottomBar onOpenMore={() => setDrawerOpen(true)} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
