import { ATTENDANCE_THRESHOLD_PERCENT } from '@shikshya/shared';
import { useCurrentUser } from '@/auth/AuthContext';
import { AttendanceSummary } from '@/components/AttendanceSummary';
import { PageHeader } from '@/components/PageHeader';

export function MyAttendancePage() {
  const { studentId } = useCurrentUser();
  return (
    <>
      <PageHeader
        title="My attendance"
        description={`You need at least ${ATTENDANCE_THRESHOLD_PERCENT}% in every course. Late counts as present, and excused classes are not counted.`}
      />
      {studentId && <AttendanceSummary studentId={studentId} />}
    </>
  );
}
