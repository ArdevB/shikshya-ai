import { AttendanceSummary } from '@/components/AttendanceSummary';
import { PageHeader } from '@/components/PageHeader';
import { personName } from '@/lib/types';
import { ChildSwitcher, useActiveChild } from '@/pages/shared/ChildSwitcher';

export function ParentAttendancePage() {
  const { activeId, active, children, status } = useActiveChild();
  return (
    <>
      <PageHeader
        title="Attendance"
        description={
          active
            ? `${personName(active.student.user)}, ${active.student.program.code} Semester ${active.student.currentSection.semester.number}, Section ${active.student.currentSection.name}`
            : undefined
        }
      />
      <ChildSwitcher status={status}>{children}</ChildSwitcher>
      {activeId && <AttendanceSummary studentId={activeId} />}
    </>
  );
}
