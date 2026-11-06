import type { MarkRow, MarkSheet } from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileCheck2, Lock, Loader2, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import type { ExamSubject } from '@/pages/admin/ExamsPage';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function MarkRowEditor({
  row,
  sheet,
  index,
  inputRefs,
}: {
  row: MarkRow;
  sheet: MarkSheet;
  index: number;
  inputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
}) {
  const [value, setValue] = useState(row.marksObtained === null ? '' : String(row.marksObtained));
  const [absent, setAbsent] = useState(row.isAbsent);
  const [state, setState] = useState<SaveState>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const lastSaved = useRef({ value, absent });

  const save = useMutation({
    mutationFn: (body: { marksObtained: number | null; isAbsent: boolean }) =>
      api.put(`/exam-subjects/${sheet.examSubjectId}/marks/${row.studentId}`, body),
    onMutate: () => setState('saving'),
    onSuccess: () => {
      setState('saved');
      setProblem(null);
    },
    onError: (error) => {
      setState('error');
      setProblem(error.message);
    },
  });

  const commit = (nextValue: string, nextAbsent: boolean) => {
    if (lastSaved.current.value === nextValue && lastSaved.current.absent === nextAbsent) return;

    if (nextAbsent) {
      lastSaved.current = { value: nextValue, absent: nextAbsent };
      save.mutate({ marksObtained: null, isAbsent: true });
      return;
    }
    // An empty box means nothing has been entered yet, so there is nothing to save.
    if (nextValue.trim() === '') return;

    const marks = Number(nextValue);
    if (Number.isNaN(marks) || marks < 0 || marks > sheet.fullMarks) {
      setState('error');
      setProblem(`Enter a number from 0 to ${sheet.fullMarks}`);
      return;
    }
    lastSaved.current = { value: nextValue, absent: nextAbsent };
    save.mutate({ marksObtained: marks, isAbsent: false });
  };

  /** Enter and the up/down arrows move between students, like a spreadsheet. */
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const moves: Record<string, number> = { Enter: 1, ArrowDown: 1, ArrowUp: -1 };
    const step = moves[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = inputRefs.current[index + step];
    if (next) {
      next.focus();
      next.select();
    } else {
      event.currentTarget.blur();
    }
  };

  const locked = sheet.isPublished;

  return (
    <li className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-2 rounded-2xl border bg-card p-3 shadow-soft sm:grid-cols-[1fr_5.5rem_auto]">
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <p className="font-medium">{row.studentName}</p>
        <p className="text-sm text-muted-foreground">{row.rollNumber}</p>
      </div>
      <Input
        ref={(element) => {
          inputRefs.current[index] = element;
        }}
        inputMode="decimal"
        aria-label={`Marks for ${row.studentName}, out of ${sheet.fullMarks}`}
        aria-invalid={state === 'error' || undefined}
        className="text-center"
        disabled={absent || locked}
        placeholder={absent ? 'Abs' : '–'}
        value={absent ? '' : value}
        onChange={(event) => {
          setValue(event.target.value);
          if (state !== 'idle') setState('idle');
          setProblem(null);
        }}
        onBlur={() => commit(value, absent)}
        onKeyDown={onKeyDown}
      />
      <div className="flex items-center gap-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-accent"
            checked={absent}
            disabled={locked}
            onChange={(event) => {
              setAbsent(event.target.checked);
              commit(value, event.target.checked);
            }}
          />
          Absent
        </label>
        <span className="flex size-5 items-center justify-center" aria-live="polite">
          {state === 'saving' && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" />
          )}
          {state === 'saved' && (
            <Check className="size-4 animate-pop text-primary-dark" aria-label="Saved" />
          )}
          {state === 'error' && (
            <TriangleAlert className="size-4 text-destructive" aria-label="Not saved" />
          )}
        </span>
      </div>
      {problem && (
        <p role="alert" className="col-span-2 text-sm text-destructive sm:col-span-3">
          {problem}
        </p>
      )}
    </li>
  );
}

function MarkGrid({ subjectId }: { subjectId: string }) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['mark-sheet', subjectId],
    queryFn: () => api.get<MarkSheet>(`/exam-subjects/${subjectId}/marks`),
    // Each row holds its own edits, so a background refetch must not overwrite them.
    refetchOnMount: 'always',
    staleTime: Infinity,
  });

  useEffect(
    () => () => {
      void queryClient.invalidateQueries({ queryKey: ['/exam-subjects'] });
    },
    [queryClient],
  );

  if (query.isPending) return <LoadingRows rows={8} />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  const sheet = query.data;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Full marks {sheet.fullMarks}, pass marks {sheet.passMarks}.{' '}
        {sheet.isPublished
          ? ''
          : 'Saved automatically when you leave a box. Press Enter to move to the next student.'}
      </p>
      {sheet.isPublished && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-primary-soft p-3 text-sm">
          <Lock className="size-4 shrink-0 text-primary-dark" aria-hidden />
          This exam is published, so marks are read-only. An admin can unlock it.
        </p>
      )}
      <ul className="stagger-children space-y-2">
        {sheet.rows.map((row, index) => (
          <MarkRowEditor
            key={row.studentId}
            row={row}
            sheet={sheet}
            index={index}
            inputRefs={inputRefs}
          />
        ))}
      </ul>
    </div>
  );
}

export function MarksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const subjectId = searchParams.get('subjectId') ?? '';
  const subjects = useQuery({
    queryKey: ['/exam-subjects', 'mine'],
    queryFn: () => api.get<ExamSubject[]>('/exam-subjects/mine'),
  });

  return (
    <>
      <PageHeader title="Enter marks" description="Choose a paper to enter its marks." />
      <div className="mb-4 md:max-w-lg">
        <FormField label="Paper">
          <Select
            value={subjectId}
            onChange={(event) =>
              setSearchParams(event.target.value ? { subjectId: event.target.value } : {})
            }
          >
            <option value="">Choose a paper…</option>
            {subjects.data?.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.exam.name}: {subject.courseOffering.course.code}, Section{' '}
                {subject.courseOffering.section.name}
                {subject.exam.isPublished ? ' (published)' : ''}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      {subjectId ? (
        // The key resets every row when the paper changes.
        <MarkGrid key={subjectId} subjectId={subjectId} />
      ) : (
        <EmptyState icon={FileCheck2} title="Choose a paper to begin" />
      )}
    </>
  );
}
