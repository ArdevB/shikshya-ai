import { zodResolver } from '@hookform/resolvers/zod';
import {
  MAX_PAGE_SIZE,
  MAX_QUIZ_QUESTIONS,
  QUIZ_QUESTION_TYPES,
  type MaterialView,
  type Paginated,
  type QuizDetailView,
  type QuizDifficulty,
  type QuizQuestionType,
  type QuizSummaryView,
} from '@shikshya/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileQuestion, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { api, queryString } from '@/lib/api';
import { offeringLabel } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';
import { useMyOfferings } from './useMyOfferings';

export const QUESTION_TYPE_LABEL: Record<QuizQuestionType, string> = {
  MCQ: 'Multiple choice',
  TRUE_FALSE: 'True or false',
  SHORT_ANSWER: 'Short answer',
};

const formSchema = z.object({
  courseOfferingId: z.string().min(1, 'Please choose a class'),
  title: z.string().trim().min(2, 'Please give it a title').max(160),
  numQuestions: z.coerce.number().int().min(1).max(MAX_QUIZ_QUESTIONS),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  materialId: z.string().optional(),
  text: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;
type Source = 'file' | 'material' | 'text';

function GenerateDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const offerings = useMyOfferings();
  const [source, setSource] = useState<Source>('file');
  const [file, setFile] = useState<File | null>(null);
  const [types, setTypes] = useState<QuizQuestionType[]>(['MCQ', 'TRUE_FALSE']);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      courseOfferingId: '',
      title: '',
      numQuestions: 5,
      difficulty: 'MEDIUM',
      materialId: '',
      text: '',
    },
  });
  const offeringId = watch('courseOfferingId');

  const materials = useQuery({
    queryKey: ['/materials', 'quiz-source', offeringId],
    enabled: source === 'material' && Boolean(offeringId),
    queryFn: () =>
      api.get<Paginated<MaterialView>>(
        `/materials${queryString({ offeringId, pageSize: MAX_PAGE_SIZE })}`,
      ),
  });

  const toggleType = (type: QuizQuestionType) =>
    setTypes((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type],
    );

  const submit = handleSubmit(async (values) => {
    if (types.length === 0) {
      toast.error('Please choose at least one question type');
      return;
    }
    const form = new FormData();
    form.append('courseOfferingId', values.courseOfferingId);
    form.append('title', values.title);
    form.append('numQuestions', String(values.numQuestions));
    form.append('difficulty', values.difficulty as QuizDifficulty);
    form.append('types', types.join(','));
    if (source === 'file') {
      if (!file) {
        toast.error('Please choose a file');
        return;
      }
      form.append('files', file);
    } else if (source === 'material') {
      if (!values.materialId) {
        toast.error('Please choose a material');
        return;
      }
      form.append('materialId', values.materialId);
    } else {
      form.append('text', values.text ?? '');
    }
    try {
      const quiz = await api.post<QuizDetailView>('/quizzes/generate', form);
      await queryClient.invalidateQueries({ queryKey: ['/quizzes'] });
      toast.success('Draft ready. Please review each question.');
      navigate(`/teacher/quizzes/${quiz.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not write the questions');
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>Write a quiz with AI</DialogTitle>
          <DialogDescription>
            You will review every question before any student sees it.
          </DialogDescription>
        </div>
        <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
          <FormField label="Class" error={errors.courseOfferingId?.message}>
            <Select {...register('courseOfferingId')}>
              <option value="">Choose a class…</option>
              {offerings.data?.data.map((offering) => (
                <option key={offering.id} value={offering.id}>
                  {offeringLabel(offering)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Title" error={errors.title?.message}>
            <Input {...register('title')} placeholder="Chapter 3 revision" />
          </FormField>

          <div className="space-y-2">
            <SegmentedTabs
              label="Where the questions come from"
              stretch
              value={source}
              onChange={setSource}
              tabs={[
                { value: 'file', label: 'Upload' },
                { value: 'material', label: 'Material' },
                { value: 'text', label: 'Paste' },
              ]}
            />
            {source === 'file' && (
              <FormField label="Your notes" hint="PDF, DOCX or TXT, up to 10 MB">
                <Input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="pt-2"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </FormField>
            )}
            {source === 'material' && (
              <FormField label="Material" hint={offeringId ? undefined : 'Choose a class first'}>
                <Select {...register('materialId')} disabled={!offeringId}>
                  <option value="">Choose a material…</option>
                  {materials.data?.data.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.title}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
            {source === 'text' && (
              <FormField label="Your notes">
                <textarea {...register('text')} rows={5} className="field h-auto py-2.5" />
              </FormField>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Questions" error={errors.numQuestions?.message}>
              <Input type="number" min={1} max={MAX_QUIZ_QUESTIONS} {...register('numQuestions')} />
            </FormField>
            <FormField label="Difficulty">
              <Select {...register('difficulty')}>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </Select>
            </FormField>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Question types</legend>
            {QUIZ_QUESTION_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={types.includes(type)}
                  onChange={() => toggleType(type)}
                />
                {QUESTION_TYPE_LABEL[type]}
              </label>
            ))}
          </fieldset>

          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={isSubmitting} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Sparkles /> {isSubmitting ? 'Writing the questions…' : 'Write questions'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TeacherQuizzesPage() {
  const [creating, setCreating] = useState(false);
  const quizzes = useQuery({
    queryKey: ['/quizzes'],
    queryFn: () => api.get<Paginated<QuizSummaryView>>('/quizzes?pageSize=50'),
  });

  return (
    <>
      <PageHeader
        title="Quizzes"
        description="Turn your notes into questions, review them, then publish to a class."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Sparkles /> Write a quiz with AI
          </Button>
        }
      />
      {quizzes.isPending ? (
        <LoadingRows rows={3} />
      ) : quizzes.isError ? (
        <ErrorState error={quizzes.error} onRetry={() => void quizzes.refetch()} />
      ) : quizzes.data.data.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title="No quizzes yet"
          description="Upload some notes and AI will draft questions for you to check."
        />
      ) : (
        <ul className="stagger-children grid gap-4 md:grid-cols-2">
          {quizzes.data.data.map((quiz) => (
            <li key={quiz.id}>
              <Link to={`/teacher/quizzes/${quiz.id}`} className="block h-full rounded-2xl">
                <Card className="card-lift h-full">
                  <CardContent className="space-y-1.5 pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-muted-foreground">
                        {quiz.courseCode}, section {quiz.sectionName}
                      </p>
                      <Badge variant={quiz.status === 'PUBLISHED' ? 'default' : 'muted'}>
                        {quiz.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                      </Badge>
                    </div>
                    <h2 className="font-semibold leading-snug">{quiz.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {quiz.status === 'PUBLISHED'
                        ? `${quiz.attemptCount} ${quiz.attemptCount === 1 ? 'student has' : 'students have'} answered. Closes ${formatDateTime(quiz.closesAt as string)}.`
                        : `${quiz.approvedCount} of ${quiz.questionCount} questions approved.`}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <GenerateDialog onClose={() => setCreating(false)} />}
    </>
  );
}
