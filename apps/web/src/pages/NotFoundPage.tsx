import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-heading text-6xl font-bold text-accent">404</p>
      <h1 className="text-2xl font-bold">We could not find that page</h1>
      <p className="text-muted-foreground">It may have moved, or the link may be wrong.</p>
      <Button asChild className="mt-2">
        <Link to="/">Go to my home page</Link>
      </Button>
    </main>
  );
}
