import {
  ArrowRight,
  Banknote,
  BookOpenCheck,
  Bot,
  CalendarClock,
  ClipboardCheck,
  FileQuestion,
  GraduationCap,
  type LucideIcon,
  ShieldCheck,
  Smartphone,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { HeroScene } from '@/components/HeroScene';
import { LogoMark } from '@/components/Logo';
import { DriftingBlobs } from '@/components/motion';
import { usePageTitle } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { riseChild, staggerParent } from '@/lib/motion';

const HEADLINE = 'Run your college from one calm, clear place.';

const NEPAL = [
  {
    icon: GraduationCap,
    title: 'TU-style grading',
    text: 'GPA and CGPA worked out on the Tribhuvan University scale, with marksheets and transcripts ready to print.',
  },
  {
    icon: Banknote,
    title: 'eSewa and Khalti',
    text: 'Students and parents pay fees online. Every payment is checked with the gateway before a receipt is issued.',
  },
  {
    icon: Smartphone,
    title: 'Made for phones',
    text: 'Attendance taken in seconds, one-handed, from the front of a classroom.',
  },
];

const ROLES: { icon: LucideIcon; who: string; does: string[] }[] = [
  {
    icon: ClipboardCheck,
    who: 'Teachers',
    does: ['Take attendance and enter marks', 'Set and grade assignments', 'Share class materials'],
  },
  {
    icon: BookOpenCheck,
    who: 'Students',
    does: ['See timetable, attendance and results', 'Hand in work and take quizzes', 'Pay fees online'],
  },
  {
    icon: UsersRound,
    who: 'Parents',
    does: ["Follow each child's progress", 'See notices and deadlines', 'Pay fees for any of their children'],
  },
  {
    icon: WalletCards,
    who: 'Accounts office',
    does: ['Generate invoices and apply fines', 'Record cash and bank payments', 'See what is outstanding'],
  },
  {
    icon: CalendarClock,
    who: 'Administrators',
    does: ['Set up programs, courses and sections', 'Build the timetable', 'Publish exam results'],
  },
];

const AI = [
  {
    icon: Bot,
    title: 'An assistant that knows its limits',
    text: 'Ask about your attendance, deadlines, fees or the college rules. It answers from college records, and only ever yours.',
  },
  {
    icon: ShieldCheck,
    title: 'Early help for struggling students',
    text: 'Teachers see who may need a check-in, and why. Students never see a label, only an offer of support.',
  },
  {
    icon: FileQuestion,
    title: 'Quizzes from your own notes',
    text: 'A first draft in seconds, with each question showing where it came from. Nothing reaches students until a teacher approves it.',
  },
  {
    icon: CalendarClock,
    title: 'Timetables without clashes',
    text: 'A solver places every class around teachers and rooms, then you can adjust it. A move that would clash is flagged at once.',
  },
];

const LogInButton = ({ size }: { size?: 'lg' }) => (
  <Button asChild size={size}>
    <Link to="/login">
      Log in <ArrowRight aria-hidden />
    </Link>
  </Button>
);

const Heading = ({ title, intro }: { title: string; intro: string }) => (
  <div className="mb-8 max-w-2xl">
    <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
    <p className="mt-2 text-muted-foreground">{intro}</p>
  </div>
);

/** The public front door. Anyone already logged in is sent to their dashboard before this. */
export function HomePage() {
  usePageTitle('College management for Nepal');

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 rounded-lg">
            <LogoMark className="size-9" />
            <span className="font-heading text-xl font-bold">Shikshya</span>
          </Link>
          <LogInButton />
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-gradient-to-br from-primary-dark to-primary-strong text-primary-foreground">
          <DriftingBlobs />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-20">
            <motion.div variants={staggerParent(0.1, 0.05)} initial="hidden" animate="show">
              <motion.h1
                variants={riseChild}
                className="font-heading text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl"
              >
                {HEADLINE}
              </motion.h1>
              <motion.p variants={riseChild} className="mt-5 max-w-xl text-lg">
                Shikshya brings attendance, exams, fees and notices together for colleges in Nepal,
                so students, teachers and parents all work from the same information.
              </motion.p>
              <motion.div variants={riseChild} className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  size="lg"
                  className="bg-background text-primary-dark hover:bg-background/90"
                >
                  <Link to="/login">
                    Log in <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <a
                  href="#for-everyone"
                  className="rounded-lg px-2 py-1 font-medium underline-offset-4 hover:underline"
                >
                  See what it does
                </a>
              </motion.div>
            </motion.div>
            <div className="hidden lg:block">
              <HeroScene />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <Heading
            title="Built for how colleges here work"
            intro="Grading, payments and everyday habits that fit Nepal, rather than being adapted to it."
          />
          <ul className="stagger-children grid gap-4 md:grid-cols-3">
            {NEPAL.map(({ icon: Icon, title, text }) => (
              <li key={title} className="card-lift rounded-2xl border bg-card p-6 shadow-soft">
                <Icon className="size-7 text-primary-dark" aria-hidden />
                <h3 className="mt-3 text-lg font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="for-everyone" className="scroll-mt-20 bg-muted/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <Heading
              title="One place for everyone at the college"
              intro="Each person sees what they need and nothing they should not: a student only their own records, a parent only their children, a teacher only their classes."
            />
            <ul className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ROLES.map(({ icon: Icon, who, does }) => (
                <li key={who} className="rounded-2xl border bg-card p-6">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-dark">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="text-lg font-semibold">{who}</h3>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                    {does.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <Heading
            title="AI that keeps people in charge"
            intro="It saves time on the slow parts. Decisions stay with the teachers and staff who know the students."
          />
          <ul className="stagger-children grid gap-4 md:grid-cols-2">
            {AI.map(({ icon: Icon, title, text }) => (
              <li key={title} className="card-lift flex gap-4 rounded-2xl border bg-card p-6 shadow-soft">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-dark">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-dark to-primary-strong px-6 py-12 text-center text-primary-foreground sm:px-12">
            <DriftingBlobs />
            <div className="relative">
              <h2 className="text-3xl font-bold tracking-tight">Already have an account?</h2>
              <p className="mx-auto mt-2 max-w-md">
                Your college gives you one. Log in to see your own dashboard.
              </p>
              <div className="mt-6 flex justify-center">
                <Button
                  asChild
                  size="lg"
                  className="bg-background text-primary-dark hover:bg-background/90"
                >
                  <Link to="/login">
                    Log in <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span>Shikshya, a BSc. CSIT academic project.</span>
          <span>The demo institution and everyone in it are made up.</span>
        </div>
      </footer>
    </div>
  );
}
