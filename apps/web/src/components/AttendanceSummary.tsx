import {
  ATTENDANCE_THRESHOLD_PERCENT,
  type StudentAttendanceSummary,
  type StudentCourseAttendance,
} from '@shikshya/shared';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarCheck } from 'lucide-react';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

function CourseCard({ course }: { course: StudentCourseAttendance }) {
  const percentage = course.percentage;
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground">{course.courseCode}</p>
            <h3 className="font-semibold leading-snug">{course.courseTitle}</h3>
            <p className="text-sm text-muted-foreground">{course.teacherName}</p>
          </div>
          <p
            className={cn(
              'font-heading text-2xl font-bold',
              course.belowThreshold ? 'text-accent-dark' : 'text-primary-dark',
            )}
          >
            {percentage === null ? '–' : `${percentage}%`}
          </p>
        </div>

        <div
          role="progressbar"
          aria-label={`${course.courseTitle} attendance`}
          aria-valuenow={percentage ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          className="relative h-2.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              'h-full rounded-full',
              course.belowThreshold ? 'bg-accent' : 'bg-primary',
            )}
            style={{ width: `${percentage ?? 0}%` }}
          />
          {/* Marks the 75% requirement on the bar. */}
          <div
            className="absolute inset-y-0 w-0.5 bg-foreground/50"
            style={{ left: `${ATTENDANCE_THRESHOLD_PERCENT}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {percentage === null
              ? 'No classes recorded yet'
              : `Attended ${course.attended} of ${course.total} classes`}
            {course.excused > 0 && `, ${course.excused} excused`}
          </span>
          {course.belowThreshold && (
            <Badge variant="warning">
              <AlertTriangle className="size-3" aria-hidden /> Below {ATTENDANCE_THRESHOLD_PERCENT}%
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Per-course attendance for one student. Used by both the student and parent screens. */
export function AttendanceSummary({ studentId }: { studentId: string }) {
  const query = useQuery({
    queryKey: ['attendance-summary', studentId],
    queryFn: () => api.get<StudentAttendanceSummary>(`/students/${studentId}/attendance-summary`),
  });

  if (query.isPending) return <LoadingRows rows={4} />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (query.data.courses.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No courses yet"
        description="Attendance appears here once classes are assigned to this section."
      />
    );
  }

  const below = query.data.courses.filter((c) => c.belowThreshold).length;

  return (
    <div className="space-y-4">
      {below > 0 && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-accent/40 bg-accent-soft p-4 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-accent-dark" aria-hidden />
          <p>
            {below === 1 ? 'One course is' : `${below} courses are`} below the{' '}
            {ATTENDANCE_THRESHOLD_PERCENT}% attendance requirement.
          </p>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {query.data.courses.map((course) => (
          <CourseCard key={course.offeringId} course={course} />
        ))}
      </div>
    </div>
  );
}
