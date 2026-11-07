import type {
  StudentQuizState,
  StudentQuizSummaryView,
  StudentQuizView,
} from '@shikshya/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileQuestion, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';

const STATE_LABEL: Record<StudentQuizState, string> = {
  UPCOMING: 'Not open yet',
  OPEN: 'Open now',
  SUBMITTED: 'Submitted',
  MISSED: 'Closed',
};

const whenText = (quiz: StudentQuizSummaryView) => {
  switch (quiz.state) {
    case 'UPCOMING':
      return `Opens ${formatDateTime(quiz.opensAt)}`;
    case 'OPEN':
      return `Closes ${formatDateTime(quiz.closesAt)}`;
    case 'MISSED':
      return `Closed ${formatDateTime(quiz.closesAt)}`;
    case 'SUBMITTED':
      return `${quiz.score} of ${quiz.questionCount} so far`;
  }
};

export function StudentQuizzesPage() {
  const quizzes = useQuery({
    queryKey: ['/quizzes/mine'],
    queryFn: () => api.get<StudentQuizSummaryView[]>('/quizzes/mine'),
  });
  return (
    <>
      <PageHeader title="Quizzes" description="Quizzes your teachers have set for your classes." />
      {quizzes.isPending ? (
        <LoadingRows rows={3} />
      ) : quizzes.isError ? (
        <ErrorState error={quizzes.error} onRetry={() => void quizzes.refetch()} />
      ) : quizzes.data.length === 0 ? (
        <EmptyState icon={FileQuestion} title="No quizzes yet" />
      ) : (
        <ul className="stagger-children grid gap-4 md:grid-cols-2">
          {quizzes.data.map((quiz) => (
            <li key={quiz.id}>
              <Link to={`/student/quizzes/${quiz.id}`} className="block h-full rounded-2xl">
                <Card className="card-lift h-full">
                  <CardContent className="space-y-1.5 pt-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-muted-foreground">
                        {quiz.courseCode}, {quiz.questionCount} questions
                      </p>
                      <Badge variant={quiz.state === 'OPEN' ? 'warning' : 'muted'}>
                        {STATE_LABEL[quiz.state]}
                      </Badge>
                    </div>
                    <h2 className="font-semibold leading-snug">{quiz.title}</h2>
                    <p className="text-sm text-muted-foreground">{whenText(quiz)}</p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function TakeQuiz({ quiz }: { quiz: StudentQuizView }) {
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/quizzes/mine/${quiz.id}/submit`, {
        answers: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })),
      }),
    onSuccess: async () => {
      toast.success('Submitted');
      await queryClient.invalidateQueries({ queryKey: ['/quizzes/mine'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const unanswered = quiz.questions.filter((question) => !answers[question.id]?.trim()).length;
  const set = (id: string, value: string) => setAnswers((current) => ({ ...current, [id]: value }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <ol className="space-y-4">
        {quiz.questions.map((question, index) => (
          <li key={question.id}>
            <Card>
              <CardContent className="pt-5">
                {question.options ? (
                  <fieldset className="space-y-2">
                    <legend className="mb-1 font-medium">
                      {index + 1}. {question.question}
                    </legend>
                    {question.options.map((option) => (
                      <label
                        key={option}
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors duration-200 hover:border-primary/50',
                          answers[question.id] === option && 'border-primary bg-primary-soft',
                        )}
                      >
                        <input
                          type="radio"
                          name={question.id}
                          value={option}
                          className="size-4 accent-primary"
                          checked={answers[question.id] === option}
                          onChange={() => set(question.id, option)}
                        />
                        {option}
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <div className="space-y-2">
                    <label htmlFor={question.id} className="block font-medium">
                      {index + 1}. {question.question}
                    </label>
                    <textarea
                      id={question.id}
                      rows={3}
                      maxLength={5000}
                      value={answers[question.id] ?? ''}
                      onChange={(event) => set(question.id, event.target.value)}
                      className="field h-auto py-2.5"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {unanswered > 0 && (
          <p className="text-sm text-muted-foreground">
            {unanswered} {unanswered === 1 ? 'question' : 'questions'} left unanswered
          </p>
        )}
        <Button type="submit" disabled={submit.isPending}>
          {submit.isPending ? 'Submitting…' : 'Submit answers'}
        </Button>
      </div>
      <p className="text-right text-xs text-muted-foreground">
        You can only submit once. Closes {formatDateTime(quiz.closesAt)}.
      </p>
    </form>
  );
}

function ResultReview({ quiz }: { quiz: StudentQuizView }) {
  return (
    <ol className="stagger-children space-y-4">
      {quiz.result?.map((question, index) => (
        <li key={question.id}>
          <Card>
            <CardContent className="space-y-2 pt-5">
              <p className="font-medium">
                {index + 1}. {question.question}
              </p>
              <p className="flex items-center gap-1.5 text-sm">
                {question.isCorrect === true ? (
                  <Check className="size-4 text-primary-dark" aria-hidden />
                ) : question.isCorrect === false ? (
                  <X className="size-4 text-destructive" aria-hidden />
                ) : null}
                <span>
                  Your answer: {question.yourAnswer || '(blank)'}
                  <span className="sr-only">
                    {question.isCorrect === true
                      ? ', correct'
                      : question.isCorrect === false
                        ? ', incorrect'
                        : ', waiting for your teacher to mark'}
                  </span>
                </span>
              </p>
              {question.isCorrect === null && (
                <Badge variant="muted">Waiting for your teacher to mark</Badge>
              )}
              {question.isCorrect !== true && (
                <p className="text-sm">
                  <span className="font-medium">Answer:</span> {question.correctAnswer}
                </p>
              )}
              <p className="text-sm text-muted-foreground">{question.explanation}</p>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}

export function StudentQuizPage() {
  const { id = '' } = useParams();
  const quiz = useQuery({
    queryKey: ['/quizzes/mine', id],
    queryFn: () => api.get<StudentQuizView>(`/quizzes/mine/${id}`),
  });

  if (quiz.isPending) return <LoadingRows rows={4} />;
  if (quiz.isError) return <ErrorState error={quiz.error} onRetry={() => void quiz.refetch()} />;
  const data = quiz.data;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link to="/student/quizzes" className="text-primary-dark hover:underline">
          Back to quizzes
        </Link>
      </p>
      <PageHeader title={data.title} description={`${data.courseCode} ${data.courseTitle}`} />

      {data.state === 'OPEN' && <TakeQuiz quiz={data} />}

      {data.state === 'UPCOMING' && (
        <EmptyState
          icon={FileQuestion}
          title="This quiz is not open yet"
          description={`It opens ${formatDateTime(data.opensAt)}.`}
        />
      )}

      {data.state === 'MISSED' && (
        <EmptyState
          icon={FileQuestion}
          title="This quiz has closed"
          description="You did not submit it before it closed."
        />
      )}

      {data.state === 'SUBMITTED' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5">
              <p className="font-heading text-2xl font-bold">
                {data.score} of {data.questionCount}
              </p>
              <p className="text-sm text-muted-foreground">
                {data.awaitingMarks > 0
                  ? `${data.awaitingMarks} short ${data.awaitingMarks === 1 ? 'answer is' : 'answers are'} still waiting for your teacher to mark.`
                  : 'All marked.'}
                {!data.result && ` You can see the answers after ${formatDateTime(data.closesAt)}.`}
              </p>
            </CardContent>
          </Card>
          {data.result && <ResultReview quiz={data} />}
        </div>
      )}
    </>
  );
}
