import type {
  Paginated,
  RiskLevel,
  RiskPredictionView,
  RiskSummary,
} from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, HeartHandshake, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable, Pagination } from '@/components/DataTable';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { api, queryString } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

const KEY = ['/risk'];

const LEVEL_LABEL: Record<RiskLevel, string> = {
  HIGH: 'Needs attention now',
  MEDIUM: 'Worth a check-in',
  LOW: 'On track',
};

function LevelBadge({ level }: { level: RiskLevel }) {
  return <Badge variant={level === 'HIGH' ? 'warning' : 'default'}>{LEVEL_LABEL[level]}</Badge>;
}

function ReviewDialog({
  prediction,
  onClose,
}: {
  prediction: RiskPredictionView;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState(prediction.reviewNote ?? '');
  const save = useMutation({
    mutationFn: () => api.post(`/risk/${prediction.id}/review`, { note }),
    onSuccess: async () => {
      toast.success('Saved');
      await queryClient.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>Record what you did</DialogTitle>
          <DialogDescription>
            {prediction.studentName}, {prediction.courseCode}. This stays between staff.
          </DialogDescription>
        </div>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <FormField label="What was done" hint="For example: spoke to them after class.">
            <textarea
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="field h-auto py-2.5"
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || note.trim().length < 2}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PredictionList({ canReview }: { canReview: boolean }) {
  const [page, setPage] = useState(1);
  const [show, setShow] = useState<'open' | 'all'>('open');
  const [reviewing, setReviewing] = useState<RiskPredictionView | null>(null);

  const predictions = useQuery({
    queryKey: [...KEY, 'list', show, page],
    queryFn: () =>
      api.get<Paginated<RiskPredictionView>>(
        `/risk${queryString({ page, pageSize: 20, unreviewedOnly: show === 'open' ? 'true' : undefined })}`,
      ),
  });

  return (
    <div className="space-y-4">
      <SegmentedTabs
        label="Which students to show"
        value={show}
        onChange={(value) => {
          setShow(value);
          setPage(1);
        }}
        tabs={[
          { value: 'open', label: 'Still to review' },
          { value: 'all', label: 'Everyone flagged' },
        ]}
      />
      {predictions.isPending ? (
        <LoadingRows rows={4} />
      ) : predictions.isError ? (
        <ErrorState error={predictions.error} onRetry={() => void predictions.refetch()} />
      ) : predictions.data.data.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={show === 'open' ? 'Nothing to review' : 'Nobody is flagged right now'}
          description="This list updates every night."
        />
      ) : (
        <>
          <ul className="stagger-children grid gap-4 lg:grid-cols-2">
            {predictions.data.data.map((prediction) => (
              <li key={prediction.id}>
                <Card className="h-full">
                  <CardContent className="space-y-3 pt-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="font-semibold leading-snug">{prediction.studentName}</h2>
                        <p className="text-sm text-muted-foreground">
                          {prediction.rollNumber}, {prediction.courseCode} {prediction.courseTitle},
                          section {prediction.sectionName}
                        </p>
                      </div>
                      <LevelBadge level={prediction.level} />
                    </div>
                    {prediction.factors.length > 0 && (
                      <ul className="list-inside list-disc space-y-0.5 text-sm">
                        {prediction.factors.map((factor) => (
                          <li key={factor.feature}>{factor.text}</li>
                        ))}
                      </ul>
                    )}
                    {prediction.reviewedAt ? (
                      <p className="rounded-xl bg-primary-soft p-2.5 text-sm">
                        <CheckCircle2
                          className="mr-1 inline size-4 text-primary-dark"
                          aria-hidden
                        />
                        <span className="font-medium">{prediction.reviewedBy}:</span>{' '}
                        {prediction.reviewNote}
                      </p>
                    ) : (
                      canReview && (
                        <Button variant="outline" size="sm" onClick={() => setReviewing(prediction)}>
                          <HeartHandshake /> Mark as reviewed
                        </Button>
                      )
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          <Pagination
            page={predictions.data.meta.page}
            totalPages={predictions.data.meta.totalPages}
            total={predictions.data.meta.total}
            onPageChange={setPage}
          />
        </>
      )}
      {reviewing && <ReviewDialog prediction={reviewing} onClose={() => setReviewing(null)} />}
    </div>
  );
}

const EXPLANATION =
  'A prompt to check on someone, worked out each night from attendance, marks and assignments. Students never see this, and it can be wrong, so please use your own judgement.';

export function TeacherAtRiskPage() {
  return (
    <>
      <PageHeader title="Students needing attention" description={EXPLANATION} />
      <PredictionList canReview />
    </>
  );
}

export function AdminAtRiskPage() {
  const queryClient = useQueryClient();
  const summary = useQuery({
    queryKey: [...KEY, 'summary'],
    queryFn: () => api.get<RiskSummary>('/risk/summary'),
  });
  const recompute = useMutation({
    mutationFn: () =>
      api.post<{ computed: number; flagged: number }>('/risk/recompute'),
    onSuccess: async ({ computed, flagged }) => {
      toast.success(`Checked ${computed} records. ${flagged} flagged.`);
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader
        title="Students needing attention"
        description={EXPLANATION}
        actions={
          <Button
            variant="outline"
            disabled={recompute.isPending}
            onClick={() => recompute.mutate()}
          >
            <RefreshCw className={recompute.isPending ? 'animate-spin' : undefined} />
            {recompute.isPending ? 'Working it out…' : 'Recalculate now'}
          </Button>
        }
      />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By section</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.isPending ? (
              <LoadingRows rows={2} />
            ) : summary.isError ? (
              <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
            ) : summary.data.sections.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing worked out yet. Use Recalculate now, or wait for tonight&apos;s run.
              </p>
            ) : (
              <>
                <DataTable
                  rows={summary.data.sections}
                  rowKey={(row) => row.sectionId}
                  columns={[
                    {
                      header: 'Section',
                      cell: (row) =>
                        `${row.programCode} Sem ${row.semesterNumber}, section ${row.sectionName}`,
                    },
                    { header: 'Students flagged', cell: (row) => row.studentsFlagged },
                    { header: 'Needs attention now', cell: (row) => row.high },
                    { header: 'Worth a check-in', cell: (row) => row.medium },
                    { header: 'On track', cell: (row) => row.low },
                  ]}
                />
                {summary.data.computedAt && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Counts are per course. Last worked out {formatDateTime(summary.data.computedAt)}.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
        <PredictionList canReview={false} />
      </div>
    </>
  );
}
