import {
  ATTENDANCE_THRESHOLD_PERCENT,
  type OfferingAttendanceReport,
  type Paginated,
} from '@shikshya/shared';
import { useQuery } from '@tanstack/react-query';
import { ChartColumn, Pencil } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { api, queryString } from '@/lib/api';
import { offeringLabel, type AttendanceSession } from '@/lib/types';
import { formatDate, toDateInput } from '@/lib/utils';
import { useMyOfferings } from './useMyOfferings';
import { AnimatedValue } from '@/components/motion';

function Report({ offeringId }: { offeringId: string }) {
  const report = useQuery({
    queryKey: ['attendance-report', offeringId],
    queryFn: () => api.get<OfferingAttendanceReport>(`/offerings/${offeringId}/attendance-report`),
  });
  const sessions = useQuery({
    queryKey: ['attendance-sessions', offeringId, 'recent'],
    queryFn: () =>
      api.get<Paginated<AttendanceSession>>(
        `/attendance/sessions${queryString({ offeringId, pageSize: 10 })}`,
      ),
  });

  if (report.isPending) return <LoadingRows rows={8} />;
  if (report.isError) {
    return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  }

  const below = report.data.students.filter((s) => s.belowThreshold).length;

  return (
    <div className="space-y-6">
      <div className="stagger-children grid grid-cols-3 gap-3">
        {[
          ['Classes held', report.data.sessionCount],
          ['Students', report.data.students.length],
          [`Below ${ATTENDANCE_THRESHOLD_PERCENT}%`, below],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="font-heading text-2xl font-bold">
                <AnimatedValue value={value ?? 0} />
              </p>
              <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        rows={report.data.students}
        rowKey={(row) => row.studentId}
        columns={[
          { header: 'Roll no.', cell: (row) => row.rollNumber },
          { header: 'Name', cell: (row) => row.studentName },
          { header: 'Attended', cell: (row) => `${row.attended} of ${row.total}` },
          { header: 'Excused', cell: (row) => row.excused },
          {
            header: 'Attendance',
            cell: (row) =>
              row.percentage === null ? (
                <Badge variant="muted">No classes</Badge>
              ) : row.belowThreshold ? (
                <Badge variant="warning">{row.percentage}%</Badge>
              ) : (
                <Badge>{row.percentage}%</Badge>
              ),
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent classes</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.data?.data.length ? (
            <ul className="divide-y text-sm">
              {sessions.data.data.map((session) => {
                const params = new URLSearchParams({
                  offeringId,
                  date: toDateInput(session.date),
                });
                if (session.period) params.set('period', String(session.period));
                return (
                  <li key={session.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      {formatDate(session.date)}
                      {session.period > 0 && (
                        <span className="text-muted-foreground"> · Period {session.period}</span>
                      )}
                    </span>
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/teacher/attendance?${params.toString()}`}>
                        <Pencil /> Edit
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No classes recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const offerings = useMyOfferings();
  const offeringId = searchParams.get('offeringId') ?? '';

  return (
    <>
      <PageHeader
        title="Attendance reports"
        description={`Students below ${ATTENDANCE_THRESHOLD_PERCENT}% are highlighted.`}
      />
      <div className="mb-4 md:max-w-md">
        <FormField label="Class">
          <Select
            value={offeringId}
            onChange={(event) =>
              setSearchParams(event.target.value ? { offeringId: event.target.value } : {})
            }
          >
            <option value="">Choose a class…</option>
            {offerings.data?.data.map((offering) => (
              <option key={offering.id} value={offering.id}>
                {offeringLabel(offering)}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      {offeringId ? (
        <Report offeringId={offeringId} />
      ) : (
        <EmptyState icon={ChartColumn} title="Choose a class to see its report" />
      )}
    </>
  );
}
