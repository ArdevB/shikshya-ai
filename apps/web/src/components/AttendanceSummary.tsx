import {
  ATTENDANCE_THRESHOLD_PERCENT,
  type StudentAttendanceSummary,
  type StudentCourseAttendance,
} from '@shikshya/shared';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarCheck } from 'lucide-react';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { AnimatedValue, ProgressRing } from '@/components/motion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

function CourseCard({ course }: { course: StudentCourseAttendance }) {
  const percentage = course.percentage;
  return (
    <Card className="card-lift">
      <CardContent className="flex items-center gap-4 pt-5">
        <ProgressRing
          percent={percentage}
          label={`${course.courseTitle} attendance, ${ATTENDANCE_THRESHOLD_PERCENT}% required`}
          tone={course.belowThreshold ? 'accent' : 'primary'}
          markAt={ATTENDANCE_THRESHOLD_PERCENT}
        >
          <span
            className={cn(
              'font-heading text-sm font-bold',
              course.belowThreshold ? 'text-accent-dark' : 'text-primary-dark',
            )}
          >
            {percentage === null ? '–' : <AnimatedValue value={`${Math.round(percentage)}%`} />}
          </span>
        </ProgressRing>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">{course.courseCode}</p>
          <h3 className="font-semibold leading-snug">{course.courseTitle}</h3>
          <p className="text-sm text-muted-foreground">{course.teacherName}</p>
          <p className="text-sm text-muted-foreground">
            {percentage === null
              ? 'No classes recorded yet'
              : `Attended ${course.attended} of ${course.total} classes (${percentage}%)`}
            {course.excused > 0 && `, ${course.excused} excused`}
          </p>
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
          className="flex animate-rise items-start gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-4 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-accent-dark" aria-hidden />
          <p>
            {below === 1 ? 'One course is' : `${below} courses are`} below the{' '}
            {ATTENDANCE_THRESHOLD_PERCENT}% attendance requirement.
          </p>
        </div>
      )}
      <div className="stagger-children grid gap-4 md:grid-cols-2">
        {query.data.courses.map((course) => (
          <CourseCard key={course.offeringId} course={course} />
        ))}
      </div>
    </div>
  );
}
