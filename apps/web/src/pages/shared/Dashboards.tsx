import {
  ATTENDANCE_THRESHOLD_PERCENT,
  type NoticeView,
  type Paginated,
  type ResultStatus,
  type StudentAttendanceSummary,
  type TimetableEntryView,
} from '@shikshya/shared';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/auth/AuthContext';
import { TrendLineChart } from '@/components/Charts';
import { ErrorState } from '@/components/feedback';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';
import { ChildSwitcher, useActiveChild } from './ChildSwitcher';

/** A card that loads its own endpoint, so a slow or failed card does not hold up the others. */
function DashboardCard<T>({
  title,
  query,
  action,
  children,
}: {
  title: string;
  query: UseQueryResult<T>;
  action?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="flex-1">
        {query.isPending ? (
          <div
            className="h-20 animate-pulse rounded-md bg-muted"
            role="status"
            aria-label="Loading"
          />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          children(query.data)
        )}
      </CardContent>
    </Card>
  );
}

const useCard = <T,>(path: string, enabled = true) =>
  useQuery({
    queryKey: ['dashboard', path],
    queryFn: () => api.get<T>(path),
    enabled,
    staleTime: 60_000,
  });

const Nothing = ({ text, icon: Icon = CheckCircle2 }: { text: string; icon?: LucideIcon }) => (
  <p className="flex items-center gap-2 text-sm text-muted-foreground">
    <Icon className="size-4 shrink-0 text-primary-dark" aria-hidden /> {text}
  </p>
);

const BigNumber = ({ value, label }: { value: ReactNode; label: string }) => (
  <div>
    <p className="font-heading text-4xl font-bold">{value}</p>
    <p className="text-sm text-muted-foreground">{label}</p>
  </div>
);

function ClassList({
  classes,
}: {
  classes: (TimetableEntryView & { attendanceTaken?: boolean })[];
}) {
  if (classes.length === 0) return <Nothing text="No classes today." />;
  return (
    <ul className="divide-y text-sm">
      {classes.map((entry) => (
        <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
          <span className="min-w-0">
            <span className="block font-medium">
              {entry.startTime} {entry.courseCode}
            </span>
            <span className="block truncate text-muted-foreground">
              {entry.courseTitle}, {entry.roomName}
            </span>
          </span>
          {entry.attendanceTaken !== undefined &&
            (entry.attendanceTaken ? (
              <Badge>Taken</Badge>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link to={`/teacher/attendance?offeringId=${entry.courseOfferingId}`}>Take</Link>
              </Button>
            ))}
        </li>
      ))}
    </ul>
  );
}

function NoticeList({ path }: { path: string }) {
  const query = useCard<Paginated<NoticeView>>('/dashboard/recent-notices');
  return (
    <DashboardCard
      title="Recent notices"
      query={query}
      action={
        <Link to={path} className="text-sm font-medium text-primary-dark hover:underline">
          View all
        </Link>
      }
    >
      {(data) =>
        data.data.length === 0 ? (
          <Nothing text="No notices." />
        ) : (
          <ul className="divide-y text-sm">
            {data.data.map((notice) => (
              <li key={notice.id} className="py-2">
                <p className="font-medium">
                  {notice.title} {!notice.isRead && <Badge variant="warning">New</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">{formatDate(notice.publishAt)}</p>
              </li>
            ))}
          </ul>
        )
      }
    </DashboardCard>
  );
}

interface LowAttendance {
  studentCount: number;
  rows: {
    studentId: string;
    rollNumber: string;
    studentName: string;
    courseCode: string;
    percentage: number;
  }[];
}

function LowAttendanceCard({ path }: { path: string }) {
  const query = useCard<LowAttendance>(path);
  return (
    <DashboardCard title={`Below ${ATTENDANCE_THRESHOLD_PERCENT}% attendance`} query={query}>
      {(data) =>
        data.rows.length === 0 ? (
          <Nothing text={`Everyone is above ${ATTENDANCE_THRESHOLD_PERCENT}%.`} />
        ) : (
          <div className="space-y-3">
            <BigNumber
              value={data.studentCount}
              label={data.studentCount === 1 ? 'student' : 'students'}
            />
            <ul className="divide-y text-sm">
              {data.rows.slice(0, 5).map((row) => (
                <li
                  key={`${row.studentId}-${row.courseCode}`}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0 truncate">
                    {row.studentName}
                    <span className="block text-xs text-muted-foreground">{row.courseCode}</span>
                  </span>
                  <Badge variant="warning">{row.percentage}%</Badge>
                </li>
              ))}
            </ul>
          </div>
        )
      }
    </DashboardCard>
  );
}

// ---------- Admin ----------

export function AdminDashboardPage() {
  const user = useCurrentUser();
  const students = useCard<{
    total: number;
    programs: { programId: string; name: string; count: number }[];
  }>('/dashboard/admin/students-by-program');
  const today = useCard<{ percentage: number | null; attended: number; total: number }>(
    '/dashboard/admin/attendance-today',
  );
  const exams = useCard<
    {
      id: string;
      name: string;
      startDate: string;
      semester: { number: number; program: { code: string } };
    }[]
  >('/dashboard/admin/upcoming-exams');
  const trend = useCard<{ date: string; percentage: number | null }[]>(
    '/dashboard/admin/attendance-trend',
  );

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        description="Your institution at a glance."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DashboardCard title="Students" query={students}>
          {(data) => (
            <div className="space-y-3">
              <BigNumber value={data.total} label="in total" />
              <ul className="divide-y text-sm">
                {data.programs.map((program) => (
                  <li key={program.programId} className="flex justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate">{program.name}</span>
                    <span className="font-semibold">{program.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Attendance today" query={today}>
          {(data) =>
            data.percentage === null ? (
              <Nothing text="No attendance has been taken today yet." />
            ) : (
              <BigNumber
                value={`${data.percentage}%`}
                label={`${data.attended} of ${data.total} attended`}
              />
            )
          }
        </DashboardCard>

        <LowAttendanceCard path="/dashboard/admin/low-attendance" />

        <div className="md:col-span-2">
          <DashboardCard title="Attendance, last 30 days" query={trend}>
            {(data) =>
              data.length === 0 ? (
                <Nothing text="No attendance in the last 30 days." />
              ) : (
                <TrendLineChart
                  ariaLabel="Attendance percentage per day over the last 30 days"
                  xHeader="Date"
                  valueHeader="Attendance"
                  yDomain={[0, 100]}
                  showAttendanceThreshold
                  format={(value) => `${value}%`}
                  data={data.map((d) => ({ name: d.date.slice(5), value: d.percentage }))}
                />
              )
            }
          </DashboardCard>
        </div>

        <DashboardCard
          title="Upcoming exams"
          query={exams}
          action={
            <Link
              to="/admin/exams"
              className="text-sm font-medium text-primary-dark hover:underline"
            >
              View all
            </Link>
          }
        >
          {(data) =>
            data.length === 0 ? (
              <Nothing text="No exams scheduled." />
            ) : (
              <ul className="divide-y text-sm">
                {data.map((exam) => (
                  <li key={exam.id} className="py-2">
                    <p className="font-medium">{exam.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {exam.semester.program.code} Sem {exam.semester.number},{' '}
                      {formatDate(exam.startDate)}
                    </p>
                  </li>
                ))}
              </ul>
            )
          }
        </DashboardCard>

        <NoticeList path="/admin/notices" />
      </div>
    </>
  );
}

// ---------- Teacher ----------

export function TeacherDashboardPage() {
  const user = useCurrentUser();
  const today = useCard<(TimetableEntryView & { attendanceTaken: boolean })[]>(
    '/dashboard/teacher/today-classes',
  );
  const pending = useCard<{
    count: number;
    items: {
      date: string;
      offeringId: string;
      courseCode: string;
      sectionName: string;
      startTime: string;
    }[];
  }>('/dashboard/teacher/pending-attendance');
  const ungraded = useCard<{
    count: number;
    items: {
      assignmentId: string;
      title: string;
      courseCode: string;
      sectionName: string;
      ungraded: number;
    }[];
  }>('/dashboard/teacher/ungraded-submissions');

  return (
    <>
      <PageHeader title={`Welcome, ${user.firstName}`} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DashboardCard title="Today's classes" query={today}>
          {(data) => <ClassList classes={data} />}
        </DashboardCard>

        <DashboardCard title="Attendance to take" query={pending}>
          {(data) =>
            data.count === 0 ? (
              <Nothing text="You are all caught up." />
            ) : (
              <ul className="divide-y text-sm">
                {data.items.map((item) => (
                  <li
                    key={`${item.offeringId}-${item.date}-${item.startTime}`}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {item.courseCode}, Section {item.sectionName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(item.date)}, {item.startTime}
                      </span>
                    </span>
                    <Button asChild size="sm" variant="outline">
                      <Link
                        to={`/teacher/attendance?offeringId=${item.offeringId}&date=${item.date}`}
                      >
                        Take
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )
          }
        </DashboardCard>

        <DashboardCard title="Work to grade" query={ungraded}>
          {(data) =>
            data.count === 0 ? (
              <Nothing text="Nothing to grade." />
            ) : (
              <div className="space-y-3">
                <BigNumber value={data.count} label="ungraded submissions" />
                <ul className="divide-y text-sm">
                  {data.items.map((item) => (
                    <li key={item.assignmentId} className="py-2">
                      <Link
                        to={`/teacher/assignments/${item.assignmentId}`}
                        className="font-medium text-primary-dark hover:underline"
                      >
                        {item.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {item.courseCode}, Section {item.sectionName}: {item.ungraded} to grade
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )
          }
        </DashboardCard>

        <LowAttendanceCard path="/dashboard/teacher/low-attendance" />
        <NoticeList path="/teacher/notices" />
      </div>
    </>
  );
}

// ---------- Student and parent ----------

function StudentCards({ studentId, base }: { studentId: string; base: string }) {
  const today = useCard<TimetableEntryView[]>(`/dashboard/students/${studentId}/today`);
  const attendance = useCard<StudentAttendanceSummary>(`/students/${studentId}/attendance-summary`);
  const deadlines = useCard<
    { kind: 'ASSIGNMENT' | 'EXAM'; id: string; title: string; courseCode: string; at: string }[]
  >(`/dashboard/students/${studentId}/deadlines`);
  const result = useCard<{
    cgpa: number;
    latest: {
      semesterNumber: number;
      gpa: number;
      status: ResultStatus;
      totalCredits: number;
    } | null;
  }>(`/dashboard/students/${studentId}/latest-result`);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <DashboardCard title="Today's classes" query={today}>
        {(data) => <ClassList classes={data} />}
      </DashboardCard>

      <DashboardCard
        title="Attendance by course"
        query={attendance}
        action={
          <Link
            to={`${base}/attendance`}
            className="text-sm font-medium text-primary-dark hover:underline"
          >
            Details
          </Link>
        }
      >
        {(data) => (
          <ul className="divide-y text-sm">
            {data.courses.map((course) => (
              <li
                key={course.offeringId}
                className="flex items-center justify-between gap-3 py-1.5"
              >
                <span className="min-w-0 truncate">{course.courseCode}</span>
                <span className="flex items-center gap-1">
                  {course.belowThreshold && (
                    <AlertTriangle className="size-4 text-accent-dark" aria-label="Below 75%" />
                  )}
                  <Badge variant={course.belowThreshold ? 'warning' : 'default'}>
                    {course.percentage === null ? '–' : `${course.percentage}%`}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </DashboardCard>

      <DashboardCard title="Deadlines, next 14 days" query={deadlines}>
        {(data) =>
          data.length === 0 ? (
            <Nothing text="Nothing due soon." />
          ) : (
            <ul className="divide-y text-sm">
              {data.map((item) => (
                <li key={`${item.kind}-${item.id}`} className="py-2">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {item.title}
                    <Badge variant={item.kind === 'EXAM' ? 'warning' : 'muted'}>
                      {item.kind === 'EXAM' ? 'Exam' : 'Assignment'}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.courseCode},{' '}
                    {item.kind === 'EXAM' ? formatDate(item.at) : formatDateTime(item.at)}
                  </p>
                </li>
              ))}
            </ul>
          )
        }
      </DashboardCard>

      <DashboardCard
        title="Latest result"
        query={result}
        action={
          <Link
            to={`${base}/results`}
            className="text-sm font-medium text-primary-dark hover:underline"
          >
            Details
          </Link>
        }
      >
        {(data) =>
          data.latest ? (
            <div className="flex items-end justify-between gap-4">
              <BigNumber
                value={data.latest.gpa.toFixed(2)}
                label={`GPA, semester ${data.latest.semesterNumber}`}
              />
              <div className="text-right">
                <p className="font-heading text-xl font-bold">{data.cgpa.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">CGPA</p>
              </div>
            </div>
          ) : (
            <Nothing text="No results published yet." />
          )
        }
      </DashboardCard>
    </div>
  );
}

export function StudentDashboardPage() {
  const user = useCurrentUser();
  return (
    <>
      <PageHeader title={`Welcome, ${user.firstName}`} />
      <div className="space-y-4">
        {user.studentId && <StudentCards studentId={user.studentId} base="/student" />}
        <NoticeList path="/student/notices" />
      </div>
    </>
  );
}

export function ParentDashboardPage() {
  const user = useCurrentUser();
  const { activeId, active, children, status } = useActiveChild();
  return (
    <>
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        description={
          active
            ? `${active.student.user.firstName} ${active.student.user.lastName}, ${active.student.program.code} Semester ${active.student.currentSection.semester.number}, Section ${active.student.currentSection.name}`
            : undefined
        }
      />
      <ChildSwitcher status={status}>{children}</ChildSwitcher>
      <div className="space-y-4">
        {activeId && <StudentCards studentId={activeId} base="/parent" />}
        <NoticeList path="/parent/notices" />
      </div>
    </>
  );
}
