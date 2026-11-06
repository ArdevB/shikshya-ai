import type { Role } from '@shikshya/shared';
import {
  Award,
  Bell,
  BellRing,
  BookOpen,
  BookOpenText,
  Building2,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  Coins,
  DoorOpen,
  FileCheck2,
  Files,
  GraduationCap,
  LayoutDashboard,
  Layers,
  PartyPopper,
  Receipt,
  School,
  Settings,
  Table2,
  User,
  UserCog,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: 'notices';
  /** Other words people might search for this by. */
  keywords?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const FINANCE_ITEMS: NavItem[] = [
  { to: '/finance', label: 'Fees dashboard', icon: Wallet, end: true, keywords: ['collections'] },
  { to: '/finance/invoices', label: 'Invoices', icon: Files, keywords: ['bill', 'dues', 'fine'] },
  { to: '/finance/payments', label: 'Payments', icon: Receipt, keywords: ['receipt', 'esewa'] },
  { to: '/finance/setup', label: 'Fee setup', icon: Coins, keywords: ['structure', 'fine rule'] },
];

const ADMIN_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Academics',
    items: [
      { to: '/admin/departments', label: 'Departments', icon: Building2 },
      { to: '/admin/programs', label: 'Programs', icon: School, keywords: ['degree'] },
      {
        to: '/admin/semesters',
        label: 'Semesters & Sections',
        icon: Layers,
        keywords: ['academic year'],
      },
      { to: '/admin/courses', label: 'Courses', icon: BookOpen, keywords: ['subject'] },
      {
        to: '/admin/offerings',
        label: 'Course assignments',
        icon: CalendarDays,
        keywords: ['offering', 'teacher'],
      },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/admin/teachers', label: 'Teachers', icon: UserCog, keywords: ['staff'] },
      {
        to: '/admin/students',
        label: 'Students',
        icon: GraduationCap,
        keywords: ['csv', 'import'],
      },
      { to: '/admin/parents', label: 'Parents', icon: UsersRound, keywords: ['guardian'] },
    ],
  },
  {
    label: 'Schedule & exams',
    items: [
      { to: '/admin/rooms', label: 'Rooms & Time Slots', icon: DoorOpen },
      { to: '/admin/timetable', label: 'Timetable', icon: Table2, keywords: ['routine'] },
      { to: '/admin/exams', label: 'Exams', icon: FileCheck2, keywords: ['publish', 'marks'] },
      { to: '/admin/results', label: 'Class results', icon: Award, keywords: ['gpa'] },
    ],
  },
  {
    label: 'Communication',
    items: [
      { to: '/admin/notices', label: 'Notices', icon: Bell, badge: 'notices' },
      { to: '/admin/events', label: 'Events', icon: PartyPopper, keywords: ['calendar'] },
    ],
  },
  { label: 'Finance', items: FINANCE_ITEMS },
];

const ACCOUNT_GROUP: NavGroup = {
  label: 'Account',
  items: [
    { to: '/profile', label: 'Profile', icon: User },
    {
      to: '/notifications/preferences',
      label: 'Notification settings',
      icon: BellRing,
      keywords: ['email'],
    },
  ],
};

const GROUPS_BY_ROLE: Partial<Record<Role, NavGroup[]>> = {
  SUPER_ADMIN: [
    ...ADMIN_GROUPS,
    {
      label: 'System',
      items: [
        {
          to: '/admin/settings',
          label: 'Institution settings',
          icon: Settings,
          keywords: ['logo', 'principal'],
        },
      ],
    },
  ],
  ADMIN: ADMIN_GROUPS,
  ACCOUNTANT: [
    { label: 'Finance', items: FINANCE_ITEMS },
    {
      label: 'Communication',
      items: [
        { to: '/finance/notices', label: 'Notices', icon: Bell, badge: 'notices' },
        { to: '/finance/events', label: 'Events', icon: PartyPopper, keywords: ['calendar'] },
      ],
    },
  ],
  TEACHER: [
    {
      label: 'Overview',
      items: [
        { to: '/teacher', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/teacher/classes', label: 'My classes', icon: Users },
        { to: '/teacher/timetable', label: 'My timetable', icon: Table2, keywords: ['routine'] },
      ],
    },
    {
      label: 'Attendance',
      items: [
        { to: '/teacher/attendance', label: 'Take attendance', icon: ClipboardCheck },
        { to: '/teacher/reports', label: 'Attendance reports', icon: ChartColumn },
      ],
    },
    {
      label: 'Teaching',
      items: [
        { to: '/teacher/marks', label: 'Enter marks', icon: FileCheck2, keywords: ['exam'] },
        { to: '/teacher/results', label: 'Class results', icon: Award, keywords: ['gpa'] },
        { to: '/teacher/assignments', label: 'Assignments', icon: ClipboardList },
        { to: '/teacher/materials', label: 'Materials', icon: BookOpenText, keywords: ['notes'] },
      ],
    },
    {
      label: 'Communication',
      items: [
        { to: '/teacher/notices', label: 'Notices', icon: Bell, badge: 'notices' },
        { to: '/teacher/events', label: 'Events', icon: PartyPopper, keywords: ['calendar'] },
      ],
    },
  ],
};

/** Students and parents see the same things, each under their own address. */
const familyGroups = (base: string, own: boolean): NavGroup[] => [
  {
    label: 'Overview',
    items: [
      { to: base, label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: `${base}/timetable`, label: 'Timetable', icon: Table2, keywords: ['routine'] },
    ],
  },
  {
    label: 'Studies',
    items: [
      {
        to: `${base}/attendance`,
        label: own ? 'My attendance' : 'Attendance',
        icon: CalendarCheck,
      },
      {
        to: `${base}/results`,
        label: own ? 'My results' : 'Results',
        icon: Award,
        keywords: ['gpa'],
      },
      { to: `${base}/assignments`, label: 'Assignments', icon: ClipboardList },
      { to: `${base}/materials`, label: 'Materials', icon: BookOpenText, keywords: ['notes'] },
    ],
  },
  {
    label: 'Payments',
    items: [
      { to: `${base}/fees`, label: 'Fees', icon: Wallet, keywords: ['pay', 'invoice', 'esewa'] },
    ],
  },
  {
    label: 'Communication',
    items: [
      { to: `${base}/notices`, label: 'Notices', icon: Bell, badge: 'notices' },
      { to: `${base}/events`, label: 'Events', icon: PartyPopper, keywords: ['calendar'] },
    ],
  },
];

export function navGroups(role: Role): NavGroup[] {
  const groups =
    role === 'STUDENT'
      ? familyGroups('/student', true)
      : role === 'PARENT'
        ? familyGroups('/parent', false)
        : (GROUPS_BY_ROLE[role] ?? []);
  return [...groups, ACCOUNT_GROUP];
}

/** The four places each role goes most, for the phone's bottom bar. */
const PRIMARY_PATHS: Partial<Record<Role, string[]>> = {
  SUPER_ADMIN: ['/admin', '/admin/students', '/admin/timetable', '/admin/notices'],
  ADMIN: ['/admin', '/admin/students', '/admin/timetable', '/admin/notices'],
  ACCOUNTANT: ['/finance', '/finance/invoices', '/finance/payments', '/finance/notices'],
  TEACHER: ['/teacher', '/teacher/attendance', '/teacher/marks', '/teacher/notices'],
  STUDENT: ['/student', '/student/timetable', '/student/attendance', '/student/fees'],
  PARENT: ['/parent', '/parent/attendance', '/parent/results', '/parent/fees'],
};

export function primaryNav(role: Role): NavItem[] {
  const all = navGroups(role).flatMap((group) => group.items);
  return (PRIMARY_PATHS[role] ?? [])
    .map((path) => all.find((item) => item.to === path))
    .filter((item): item is NavItem => item !== undefined);
}

/** Where a page sits in the navigation, for the breadcrumb. The longest match wins. */
export function findNavTrail(role: Role, pathname: string) {
  let best: { group: NavGroup; item: NavItem } | null = null;
  for (const group of navGroups(role)) {
    for (const item of group.items) {
      const matches = pathname === item.to || pathname.startsWith(`${item.to}/`);
      if (matches && (!best || item.to.length > best.item.to.length)) best = { group, item };
    }
  }
  return best;
}
