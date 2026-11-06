import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { Role } from '@shikshya/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  Bell,
  BookOpen,
  BookOpenText,
  Building2,
  CalendarDays,
  CalendarCheck,
  ChartColumn,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  FileCheck2,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  PartyPopper,
  School,
  Table2,
  User,
  UserCog,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCurrentUser, useAuth } from '@/auth/AuthContext';
import { roleLabel } from '@/auth/roles';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: 'notices';
}

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/departments', label: 'Departments', icon: Building2 },
  { to: '/admin/programs', label: 'Programs', icon: School },
  { to: '/admin/semesters', label: 'Semesters & Sections', icon: Layers },
  { to: '/admin/courses', label: 'Courses', icon: BookOpen },
  { to: '/admin/offerings', label: 'Course assignments', icon: CalendarDays },
  { to: '/admin/teachers', label: 'Teachers', icon: UserCog },
  { to: '/admin/students', label: 'Students', icon: GraduationCap },
  { to: '/admin/parents', label: 'Parents', icon: UsersRound },
  { to: '/admin/rooms', label: 'Rooms & Time Slots', icon: DoorOpen },
  { to: '/admin/timetable', label: 'Timetable', icon: Table2 },
  { to: '/admin/exams', label: 'Exams', icon: FileCheck2 },
  { to: '/admin/results', label: 'Class results', icon: Award },
  { to: '/admin/notices', label: 'Notices', icon: Bell, badge: 'notices' },
  { to: '/admin/events', label: 'Events', icon: PartyPopper },
];

const NAV_BY_ROLE: Partial<Record<Role, NavItem[]>> = {
  SUPER_ADMIN: ADMIN_NAV,
  ADMIN: ADMIN_NAV,
  TEACHER: [
    { to: '/teacher', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/teacher/classes', label: 'My classes', icon: Users },
    { to: '/teacher/timetable', label: 'My timetable', icon: Table2 },
    { to: '/teacher/attendance', label: 'Take attendance', icon: ClipboardCheck },
    { to: '/teacher/reports', label: 'Attendance reports', icon: ChartColumn },
    { to: '/teacher/marks', label: 'Enter marks', icon: FileCheck2 },
    { to: '/teacher/results', label: 'Class results', icon: Award },
    { to: '/teacher/assignments', label: 'Assignments', icon: ClipboardList },
    { to: '/teacher/materials', label: 'Materials', icon: BookOpenText },
    { to: '/teacher/notices', label: 'Notices', icon: Bell, badge: 'notices' },
    { to: '/teacher/events', label: 'Events', icon: PartyPopper },
  ],
  STUDENT: [
    { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/student/timetable', label: 'Timetable', icon: Table2 },
    { to: '/student/attendance', label: 'My attendance', icon: CalendarCheck },
    { to: '/student/results', label: 'My results', icon: Award },
    { to: '/student/assignments', label: 'Assignments', icon: ClipboardList },
    { to: '/student/materials', label: 'Materials', icon: BookOpenText },
    { to: '/student/notices', label: 'Notices', icon: Bell, badge: 'notices' },
    { to: '/student/events', label: 'Events', icon: PartyPopper },
  ],
  PARENT: [
    { to: '/parent', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/parent/timetable', label: 'Timetable', icon: Table2 },
    { to: '/parent/attendance', label: 'Attendance', icon: CalendarCheck },
    { to: '/parent/results', label: 'Results', icon: Award },
    { to: '/parent/assignments', label: 'Assignments', icon: ClipboardList },
    { to: '/parent/materials', label: 'Materials', icon: BookOpenText },
    { to: '/parent/notices', label: 'Notices', icon: Bell, badge: 'notices' },
    { to: '/parent/events', label: 'Events', icon: PartyPopper },
  ],
};

const SHARED_NAV: NavItem[] = [{ to: '/profile', label: 'Profile', icon: User }];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const user = useCurrentUser();
  const items = [...(NAV_BY_ROLE[user.role] ?? []), ...SHARED_NAV];
  const unread = useQuery({
    queryKey: ['notices', 'unread-count'],
    queryFn: () => api.get<{ count: number }>('/notices/unread-count'),
    refetchInterval: 60_000,
  });
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex min-h-11 items-center gap-3 rounded-md border-l-4 border-transparent px-3 text-sm font-medium transition-colors hover:bg-primary-soft',
              isActive && 'border-accent bg-primary-soft text-primary-dark',
            )
          }
        >
          <item.icon className="size-5 shrink-0" aria-hidden />
          <span className="flex-1">{item.label}</span>
          {item.badge === 'notices' && Boolean(unread.data?.count) && (
            <span
              className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground"
              aria-label={`${unread.data?.count} unread`}
            >
              {unread.data?.count}
            </span>
          )}
        </NavLink>
      ))}
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
    'flex min-h-10 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm outline-none data-[highlighted]:bg-primary-soft';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label="Account menu">
          <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
            {initials}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm leading-tight">
              {user.firstName} {user.lastName}
            </span>
            <span className="block text-xs font-normal leading-tight text-muted-foreground">
              {roleLabel(user.role)}
            </span>
          </span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-48 rounded-md border bg-card p-1 shadow-md"
        >
          <DropdownMenu.Item asChild className={itemClass}>
            <Link to="/profile">
              <User className="size-4" aria-hidden /> Profile
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close the mobile menu after moving to another page.
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-r md:block">
        <div className="flex h-16 items-center border-b px-5">
          <Logo />
        </div>
        <SidebarNav />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-foreground/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] overflow-y-auto bg-background shadow-lg">
            <div className="flex h-16 items-center justify-between border-b px-4">
              <Logo />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
              >
                <X />
              </Button>
            </div>
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b bg-background px-4 md:justify-end md:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="[&]:size-6" />
          </Button>
          <UserMenu />
        </header>
        <main className="flex-1 p-4 md:p-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
