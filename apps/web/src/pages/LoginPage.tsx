import { zodResolver } from '@hookform/resolvers/zod';
import { loginBody, type LoginBody } from '@shikshya/shared';
import { CalendarCheck, GraduationCap, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { homePathFor } from '@/auth/roles';
import { FullPageSpinner } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { Logo, LogoMark } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const HIGHLIGHTS = [
  { icon: GraduationCap, text: 'One place for students, teachers and parents' },
  { icon: CalendarCheck, text: 'Attendance taken in seconds, right from a phone' },
  { icon: ShieldCheck, text: 'Everyone sees only what they should' },
];

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginBody>({ resolver: zodResolver(loginBody) });

  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to={homePathFor(user.role)} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const loggedIn = await login(values);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? homePathFor(loggedIn.role), { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not log in');
    }
  });

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="absolute -right-24 -top-24 size-96 rounded-full bg-accent opacity-90"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-16 size-80 rounded-full bg-primary-dark"
        />
        <div className="relative flex items-center gap-3">
          <LogoMark className="size-10 [&_rect]:fill-background [&_path:first-of-type]:fill-primary" />
          <span className="font-heading text-2xl font-bold">Shikshya</span>
        </div>
        <div className="relative max-w-md space-y-8">
          <h2 className="text-4xl font-bold leading-tight">
            Run your college from one calm, clear place.
          </h2>
          <ul className="space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 font-medium">
                <Icon className="size-6 shrink-0" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm font-medium">Built for colleges in Nepal</p>
      </aside>

      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Log in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the account your college gave you.
            </p>
          </div>
          {formError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
            >
              {formError}
            </p>
          )}
          <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" noValidate>
            <FormField label="Email" error={errors.email?.message}>
              <Input
                type="email"
                autoComplete="username"
                placeholder="you@example.com"
                {...register('email')}
              />
            </FormField>
            <FormField label="Password" error={errors.password?.message}>
              <Input type="password" autoComplete="current-password" {...register('password')} />
            </FormField>
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Logging in…' : 'Log in'}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
