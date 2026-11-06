import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <main className="flex min-h-dvh animate-rise flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="mb-2 flex size-20 animate-float items-center justify-center rounded-3xl bg-gradient-soft">
        <Compass className="size-10 text-accent-dark" aria-hidden />
      </div>
      <p className="bg-gradient-brand bg-clip-text font-heading text-6xl font-bold text-transparent">
        404
      </p>
      <h1 className="text-2xl font-bold">We could not find that page</h1>
      <p className="text-muted-foreground">It may have moved, or the link may be wrong.</p>
      <Button asChild className="mt-2">
        <Link to="/">Go to my home page</Link>
      </Button>
    </main>
  );
}
