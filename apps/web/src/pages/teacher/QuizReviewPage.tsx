import type {
  QuizAttemptAnswerView,
  QuizAttemptView,
  QuizDetailView,
  QuizDifficulty,
  QuizQuestionType,
  QuizQuestionView,
} from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ErrorState, LoadingRows } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { QUESTION_TYPE_LABEL } from './QuizzesPage';

const DIFFICULTY_LABEL: Record<QuizDifficulty, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
};

const firstProblem = (error: unknown) => {
  if (error instanceof ApiError && Array.isArray(error.details)) {
    const first = error.details[0] as { message?: string } | undefined;
    if (first?.message) return first.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong';
};

function EditDialog({
  quizId,
  question,
  onClose,
}: {
  quizId: string;
  question: QuizQuestionView;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(question.question);
  const [options, setOptions] = useState(question.options ?? ['', '', '', '']);
  const [answer, setAnswer] = useState(question.correctAnswer);
  const [explanation, setExplanation] = useState(question.explanation);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>(question.difficulty);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/quizzes/${quizId}/questions/${question.id}`, {
        type: question.type,
        question: text,
        options: question.type === 'MCQ' ? options : null,
        correctAnswer: answer,
        explanation,
        difficulty,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/quizzes', quizId] });
      onClose();
    },
    onError: (error) => toast.error(firstProblem(error)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>Edit question</DialogTitle>
          <DialogDescription>{QUESTION_TYPE_LABEL[question.type]}</DialogDescription>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Question">
            <textarea
              rows={3}
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="field h-auto py-2.5"
            />
          </FormField>

          {question.type === 'MCQ' && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                Options. Choose the one that is correct.
              </legend>
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct"
                    aria-label={`Option ${index + 1} is correct`}
                    className="size-4 shrink-0 accent-primary"
                    checked={option !== '' && option === answer}
                    onChange={() => setAnswer(option)}
                  />
                  <Input
                    aria-label={`Option ${index + 1}`}
                    value={option}
                    onChange={(event) => {
                      const value = event.target.value;
                      setOptions((current) => current.map((o, i) => (i === index ? value : o)));
                      if (option === answer) setAnswer(value);
                    }}
                  />
                </div>
              ))}
            </fieldset>
          )}
          {question.type === 'TRUE_FALSE' && (
            <FormField label="Correct answer">
              <Select value={answer} onChange={(event) => setAnswer(event.target.value)}>
                <option value="True">True</option>
                <option value="False">False</option>
              </Select>
            </FormField>
          )}
          {question.type === 'SHORT_ANSWER' && (
            <FormField label="Model answer" hint="You mark these yourself. This is your guide.">
              <Input value={answer} onChange={(event) => setAnswer(event.target.value)} />
            </FormField>
          )}

          <FormField label="Explanation" hint="Students see this after the quiz closes.">
            <textarea
              rows={2}
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              className="field h-auto py-2.5"
            />
          </FormField>
          <FormField label="Difficulty">
            <Select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as QuizDifficulty)}
            >
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </Select>
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuestionCard({
  quizId,
  question,
  number,
  editable,
}: {
  quizId: string;
  question: QuizQuestionView;
  number: number;
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const base = `/quizzes/${quizId}/questions/${question.id}`;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['/quizzes', quizId] });
  const onError = (error: Error) => toast.error(firstProblem(error));

  const approve = useMutation({
    mutationFn: () => api.post(`${base}/${question.approved ? 'unapprove' : 'approve'}`),
    onSuccess: refresh,
    onError,
  });
  const regenerate = useMutation({
    mutationFn: () => api.post(`${base}/regenerate`),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: () => api.delete(base),
    onSuccess: refresh,
    onError,
  });

  return (
    <li>
      <Card className={cn(question.approved && 'border-primary/50')}>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading font-semibold">Question {number}</span>
            <Badge variant="muted">{QUESTION_TYPE_LABEL[question.type as QuizQuestionType]}</Badge>
            <Badge variant="muted">{DIFFICULTY_LABEL[question.difficulty]}</Badge>
            {question.approved && (
              <Badge>
                <Check className="size-3" aria-hidden /> Approved
              </Badge>
            )}
          </div>
          <p className="font-medium">{question.question}</p>

          {question.options ? (
            <ul className="space-y-1 text-sm">
              {question.options.map((option) => {
                const correct = option === question.correctAnswer;
                return (
                  <li
                    key={option}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2.5 py-1.5',
                      correct ? 'bg-primary-soft font-medium' : 'bg-muted/50',
                    )}
                  >
                    {correct && <Check className="size-4 text-primary-dark" aria-hidden />}
                    {option}
                    {correct && <span className="sr-only"> (correct answer)</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-lg bg-primary-soft px-2.5 py-1.5 text-sm">
              <span className="font-medium">Model answer:</span> {question.correctAnswer}
            </p>
          )}

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Why:</span> {question.explanation}
            </p>
            <p>
              <span className="font-medium text-foreground">From your notes:</span> “
              {question.sourceSnippet}”
            </p>
          </div>

          {editable && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={question.approved ? 'outline' : 'default'}
                disabled={approve.isPending}
                onClick={() => approve.mutate()}
              >
                {question.approved ? (
                  <>
                    <X /> Unapprove
                  </>
                ) : (
                  <>
                    <Check /> Approve
                  </>
                )}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={regenerate.isPending}
                onClick={() => regenerate.mutate()}
              >
                <RefreshCw className={regenerate.isPending ? 'animate-spin' : undefined} />
                {regenerate.isPending ? 'Writing…' : 'Regenerate'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                <Trash2 className="text-destructive" /> Delete
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      {editing && (
        <EditDialog quizId={quizId} question={question} onClose={() => setEditing(false)} />
      )}
    </li>
  );
}

/** datetime-local has no time zone, so this reads it in the browser's own. */
const toIso = (local: string) => new Date(local).toISOString();
const localInput = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function PublishDialog({ quiz, onClose }: { quiz: QuizDetailView; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [opensAt, setOpensAt] = useState(() => localInput(new Date()));
  const [closesAt, setClosesAt] = useState(() =>
    localInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  );
  const publish = useMutation({
    mutationFn: () =>
      api.post(`/quizzes/${quiz.id}/publish`, {
        opensAt: toIso(opensAt),
        closesAt: toIso(closesAt),
      }),
    onSuccess: async () => {
      toast.success('Published. Students have been told.');
      await queryClient.invalidateQueries({ queryKey: ['/quizzes'] });
      onClose();
    },
    onError: (error) => toast.error(firstProblem(error)),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>Publish to section {quiz.sectionName}</DialogTitle>
          <DialogDescription>
            Students in {quiz.courseCode} will be told. The questions cannot change after this.
          </DialogDescription>
        </div>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            publish.mutate();
          }}
        >
          <FormField label="Opens">
            <Input
              type="datetime-local"
              value={opensAt}
              onChange={(event) => setOpensAt(event.target.value)}
            />
          </FormField>
          <FormField label="Closes">
            <Input
              type="datetime-local"
              value={closesAt}
              onChange={(event) => setClosesAt(event.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={publish.isPending || !opensAt || !closesAt}>
              <Send /> {publish.isPending ? 'Publishing…' : 'Publish'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShortAnswerMarking({ quizId, answer }: { quizId: string; answer: QuizAttemptAnswerView }) {
  const queryClient = useQueryClient();
  const grade = useMutation({
    mutationFn: (isCorrect: boolean) =>
      api.post(`/quizzes/answers/${answer.id}/grade`, { isCorrect }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/quizzes', quizId, 'attempts'] }),
    onError: (error) => toast.error(firstProblem(error)),
  });
  return (
    <div className="rounded-xl border p-3 text-sm">
      <p className="font-medium">{answer.question}</p>
      <p className="mt-1">
        <span className="text-muted-foreground">Their answer:</span> {answer.answer || '(blank)'}
      </p>
      <p className="text-muted-foreground">Model answer: {answer.correctAnswer}</p>
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          variant={answer.isCorrect === true ? 'default' : 'outline'}
          disabled={grade.isPending}
          aria-pressed={answer.isCorrect === true}
          onClick={() => grade.mutate(true)}
        >
          <Check /> Correct
        </Button>
        <Button
          size="sm"
          variant={answer.isCorrect === false ? 'default' : 'outline'}
          disabled={grade.isPending}
          aria-pressed={answer.isCorrect === false}
          onClick={() => grade.mutate(false)}
        >
          <X /> Incorrect
        </Button>
      </div>
    </div>
  );
}

function Results({ quizId, canMark }: { quizId: string; canMark: boolean }) {
  const attempts = useQuery({
    queryKey: ['/quizzes', quizId, 'attempts'],
    queryFn: () => api.get<QuizAttemptView[]>(`/quizzes/${quizId}/attempts`),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {attempts.isPending ? (
          <LoadingRows rows={2} />
        ) : attempts.isError ? (
          <ErrorState error={attempts.error} onRetry={() => void attempts.refetch()} />
        ) : attempts.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody has answered yet.</p>
        ) : (
          attempts.data.map((attempt) => {
            const toMark = attempt.answers.filter((answer) => answer.type === 'SHORT_ANSWER');
            return (
              <details key={attempt.id} className="rounded-xl border p-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{attempt.studentName}</span>
                  <span className="text-sm text-muted-foreground">{attempt.rollNumber}</span>
                  <span className="ml-auto text-sm font-semibold">
                    {attempt.score} of {attempt.total}
                  </span>
                  {attempt.awaitingMarks > 0 && (
                    <Badge variant="warning">{attempt.awaitingMarks} to mark</Badge>
                  )}
                </summary>
                <div className="mt-3 space-y-2">
                  {attempt.submittedAt && (
                    <p className="text-xs text-muted-foreground">
                      Submitted {formatDateTime(attempt.submittedAt)}
                    </p>
                  )}
                  {canMark &&
                    toMark.map((answer) => (
                      <ShortAnswerMarking key={answer.id} quizId={quizId} answer={answer} />
                    ))}
                </div>
              </details>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function QuizReviewPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [publishing, setPublishing] = useState(false);

  const quiz = useQuery({
    queryKey: ['/quizzes', id],
    queryFn: () => api.get<QuizDetailView>(`/quizzes/${id}`),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/quizzes/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/quizzes'] });
      navigate('/teacher/quizzes');
    },
    onError: (error) => toast.error(firstProblem(error)),
  });

  const approveAll = useMutation({
    mutationFn: async () => {
      const waiting = quiz.data?.questions.filter((question) => !question.approved) ?? [];
      await Promise.all(
        waiting.map((question) =>
          api.post(`/quizzes/${id}/questions/${question.id}/approve`),
        ),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/quizzes', id] }),
    onError: (error) => toast.error(firstProblem(error)),
  });

  if (quiz.isPending) return <LoadingRows rows={5} />;
  if (quiz.isError) return <ErrorState error={quiz.error} onRetry={() => void quiz.refetch()} />;

  const data = quiz.data;
  const draft = data.status === 'DRAFT';
  const allApproved = data.questionCount > 0 && data.approvedCount === data.questionCount;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link to="/teacher/quizzes" className="text-primary-dark hover:underline">
          Back to quizzes
        </Link>
      </p>
      <PageHeader
        title={data.title}
        description={
          draft
            ? `${data.courseCode}, section ${data.sectionName}. ${data.approvedCount} of ${data.questionCount} questions approved. AI can get things wrong, so please check each one.`
            : `${data.courseCode}, section ${data.sectionName}. Open from ${formatDateTime(data.opensAt as string)} to ${formatDateTime(data.closesAt as string)}.`
        }
        actions={
          draft ? (
            <>
              <Button variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate()}>
                <Trash2 className="text-destructive" /> Delete draft
              </Button>
              {!allApproved && (
                <Button
                  variant="outline"
                  disabled={approveAll.isPending}
                  onClick={() => approveAll.mutate()}
                >
                  <Check /> Approve all
                </Button>
              )}
              <Button disabled={!allApproved} onClick={() => setPublishing(true)}>
                <Send /> Publish
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="space-y-6">
        {!draft && <Results quizId={data.id} canMark />}
        <ol className="space-y-4">
          {data.questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              quizId={data.id}
              question={question}
              number={index + 1}
              editable={draft}
            />
          ))}
        </ol>
      </div>
      {publishing && <PublishDialog quiz={data} onClose={() => setPublishing(false)} />}
    </>
  );
}
