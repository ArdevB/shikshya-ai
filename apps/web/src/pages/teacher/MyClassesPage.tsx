import { ChartColumn, ClipboardCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMyOfferings } from './useMyOfferings';

export function MyClassesPage() {
  const query = useMyOfferings();

  return (
    <>
      <PageHeader title="My classes" description="The courses you teach this semester." />
      {query.isPending ? (
        <LoadingRows rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No classes assigned yet"
          description="An admin assigns your courses. They will appear here once that is done."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {query.data.data.map((offering) => (
            <Card key={offering.id}>
              <CardContent className="flex h-full flex-col gap-4 pt-5">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {offering.course.code}
                  </p>
                  <h2 className="font-semibold leading-snug">{offering.course.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {offering.section.semester.program.code} Semester{' '}
                    {offering.section.semester.number}, Section {offering.section.name}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild size="sm">
                    <Link to={`/teacher/attendance?offeringId=${offering.id}`}>
                      <ClipboardCheck /> Attendance
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/teacher/reports?offeringId=${offering.id}`}>
                      <ChartColumn /> Report
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
