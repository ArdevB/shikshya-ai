import { zodResolver } from '@hookform/resolvers/zod';
import { loginBody, type LoginBody } from '@shikshya/shared';
import { CalendarCheck, Eye, EyeOff, GraduationCap, Loader2, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { homePathFor } from '@/auth/roles';
import { FullPageSpinner } from '@/components/feedback';
import { FormField } from '@/components/FormField';
import { HeroScene } from '@/components/HeroScene';
import { LogoMark } from '@/components/Logo';
import { DriftingBlobs } from '@/components/motion';
import { usePageTitle } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { riseChild, staggerParent } from '@/lib/motion';

const HEADLINE = 'Run your college from one calm, clear place.';

const HIGHLIGHTS = [
  { icon: GraduationCap, text: 'One place for students, teachers and parents' },
  { icon: CalendarCheck, text: 'Attendance taken in seconds, right from a phone' },
  { icon: ShieldCheck, text: 'Everyone sees only what they should' },
];

const WhiteLogoMark = ({ className }: { className?: string }) => (
  <LogoMark
    className={`${className} [&_path:first-of-type]:fill-primary [&_rect]:fill-background`}
  />
);

export function LoginPage() {
  usePageTitle('Log in');
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-primary-dark to-primary-strong p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between xl:p-12">
        <DriftingBlobs />
        <div className="relative flex items-center gap-3">
          <WhiteLogoMark className="size-10" />
          <span className="font-heading text-2xl font-bold">Shikshya</span>
        </div>

        <div className="relative">
          <HeroScene />
        </div>

        <div className="relative max-w-lg space-y-5">
          <motion.p
            className="font-heading text-3xl font-bold leading-tight tracking-tight xl:text-4xl"
            variants={staggerParent(0.05, 0.2)}
            initial="hidden"
            animate="show"
          >
            <span className="sr-only">{HEADLINE}</span>
            {HEADLINE.split(' ').map((word, index) => (
              <motion.span
                key={`${word}-${index}`}
                aria-hidden
                variants={riseChild}
                className="mr-[0.25em] inline-block"
              >
                {word}
              </motion.span>
            ))}
          </motion.p>
          <motion.ul
            className="space-y-2.5"
            variants={staggerParent(0.1, 0.7)}
            initial="hidden"
            animate="show"
          >
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <motion.li
                key={text}
                variants={riseChild}
                className="flex items-center gap-3 font-medium"
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                {text}
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </aside>

      <main className="flex min-h-dvh flex-col lg:min-h-0">
        {/* On phones the brand gets a short band of its own, so the form stays in reach. */}
        <div className="relative overflow-hidden bg-gradient-to-br from-primary-dark to-primary-strong px-6 pb-12 pt-8 text-primary-foreground lg:hidden">
          <DriftingBlobs />
          <div className="relative flex items-center gap-3">
            <WhiteLogoMark className="size-9" />
            <span className="font-heading text-xl font-bold">Shikshya</span>
          </div>
          <p className="relative mt-3 max-w-xs text-sm font-medium">{HEADLINE}</p>
        </div>

        <div className="relative -mt-6 flex flex-1 items-start justify-center rounded-t-3xl bg-background p-6 sm:items-center lg:mt-0 lg:rounded-none">
          <motion.div
            className="w-full max-w-sm space-y-6"
            variants={staggerParent(0.08, 0.05)}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={riseChild}>
              <h1 className="text-3xl font-bold">Log in</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Use the account your college gave you.
              </p>
            </motion.div>

            {formError && (
              <p
                role="alert"
                key={formError}
                className="animate-shake rounded-xl border border-destructive/40 bg-card p-3 text-sm text-destructive"
              >
                {formError}
              </p>
            )}

            <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" noValidate>
              <motion.div variants={riseChild}>
                <FormField label="Email" error={errors.email?.message}>
                  <Input
                    type="email"
                    autoComplete="username"
                    placeholder="you@example.com"
                    {...register('email')}
                  />
                </FormField>
              </motion.div>
              <motion.div variants={riseChild}>
                <FormField label="Password" error={errors.password?.message}>
                  <PasswordInput
                    visible={showPassword}
                    onToggle={() => setShowPassword((value) => !value)}
                    {...register('password')}
                  />
                </FormField>
              </motion.div>
              <motion.div variants={riseChild}>
                <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
                  {isSubmitting ? 'Logging in…' : 'Log in'}
                </Button>
              </motion.div>
            </form>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

/** Lets someone check what they typed, which matters most on a phone keyboard. */
const PasswordInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { visible: boolean; onToggle: () => void }
>(({ visible, onToggle, className, ...props }, ref) => (
  <div className="relative">
    <Input
      ref={ref}
      type={visible ? 'text' : 'password'}
      autoComplete="current-password"
      className={`pr-12 ${className ?? ''}`}
      {...props}
    />
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={visible}
      aria-label="Show password"
      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:text-foreground"
    >
      {visible ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
    </button>
  </div>
));
PasswordInput.displayName = 'PasswordInput';
