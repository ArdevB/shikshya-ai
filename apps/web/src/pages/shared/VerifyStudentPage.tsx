import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, CircleX } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';

interface Verification {
  name: string;
  rollNumber: string;
  programName: string;
  institutionName: string;
  isActive: boolean;
}

/** The public page a QR code on an ID card opens. Shows only what is on the card itself. */
export function VerifyStudentPage() {
  const { id = '', token = '' } = useParams();
  const query = useQuery({
    queryKey: ['verify-student', id, token],
    queryFn: () => api.get<Verification>(`/public/verify-student/${id}/${token}`),
    retry: false,
  });

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <Logo />
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-3 pt-6 text-center">
          {query.isPending ? (
            <p className="text-muted-foreground">Checking this card…</p>
          ) : query.isError ? (
            <>
              <CircleX className="mx-auto size-12 text-destructive" aria-hidden />
              <h1 className="text-xl font-bold">This card could not be verified</h1>
              <p className="text-sm text-muted-foreground">The link is not valid.</p>
            </>
          ) : (
            <>
              {query.data.isActive ? (
                <BadgeCheck className="mx-auto size-12 text-primary" aria-hidden />
              ) : (
                <CircleX className="mx-auto size-12 text-accent-dark" aria-hidden />
              )}
              <h1 className="text-xl font-bold">
                {query.data.isActive ? 'Valid student' : 'No longer active'}
              </h1>
              <dl className="space-y-1 text-sm">
                <div>
                  <dt className="sr-only">Name</dt>
                  <dd className="text-base font-semibold">{query.data.name}</dd>
                </div>
                <div>
                  <dt className="sr-only">Roll number</dt>
                  <dd>{query.data.rollNumber}</dd>
                </div>
                <div>
                  <dt className="sr-only">Program</dt>
                  <dd>{query.data.programName}</dd>
                </div>
                <div>
                  <dt className="sr-only">Institution</dt>
                  <dd className="text-muted-foreground">{query.data.institutionName}</dd>
                </div>
              </dl>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
