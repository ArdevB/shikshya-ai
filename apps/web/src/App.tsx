import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { ADMIN_ROLES, FINANCE_ROLES, homePathFor } from '@/auth/roles';
import { AppLayout } from '@/components/AppLayout';
import { FullPageSpinner } from '@/components/feedback';
import { ActiveChildProvider } from '@/pages/shared/ChildSwitcher';

/**
 * Each page's code loads when it is first visited, so nobody downloads screens for other roles.
 * Pages are named exports, so this picks the right one out of its file.
 */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M) {
  return lazy(async () => ({ default: (await load())[name] as ComponentType }));
}

const HomePage = page(() => import('@/pages/HomePage'), 'HomePage');
const login = () => import('@/pages/LoginPage');
const LoginPage = page(login, 'LoginPage');
const NotFoundPage = page(() => import('@/pages/NotFoundPage'), 'NotFoundPage');
const ProfilePage = page(() => import('@/pages/ProfilePage'), 'ProfilePage');
const ChangePasswordPage = page(() => import('@/pages/ChangePasswordPage'), 'ChangePasswordPage');

const CoursesPage = page(() => import('@/pages/admin/CoursesPage'), 'CoursesPage');
const DepartmentsPage = page(() => import('@/pages/admin/DepartmentsPage'), 'DepartmentsPage');
const exams = () => import('@/pages/admin/ExamsPage');
const ExamsPage = page(exams, 'ExamsPage');
const ExamDetailPage = page(exams, 'ExamDetailPage');
const InstitutionSettingsPage = page(
  () => import('@/pages/admin/InstitutionSettingsPage'),
  'InstitutionSettingsPage',
);
const OfferingsPage = page(() => import('@/pages/admin/OfferingsPage'), 'OfferingsPage');
const ParentsPage = page(() => import('@/pages/admin/ParentsPage'), 'ParentsPage');
const ProgramsPage = page(() => import('@/pages/admin/ProgramsPage'), 'ProgramsPage');
const RoomsPage = page(() => import('@/pages/admin/RoomsPage'), 'RoomsPage');
const SemestersPage = page(() => import('@/pages/admin/SemestersPage'), 'SemestersPage');
const StudentsPage = page(() => import('@/pages/admin/StudentsPage'), 'StudentsPage');
const TeachersPage = page(() => import('@/pages/admin/TeachersPage'), 'TeachersPage');
const TimetableEditorPage = page(
  () => import('@/pages/admin/TimetableEditorPage'),
  'TimetableEditorPage',
);

const PoliciesPage = page(() => import('@/pages/admin/PoliciesPage'), 'PoliciesPage');
const TimetableGeneratorPage = page(
  () => import('@/pages/admin/TimetableGeneratorPage'),
  'TimetableGeneratorPage',
);
const atRisk = () => import('@/pages/shared/AtRiskPage');
const AdminAtRiskPage = page(atRisk, 'AdminAtRiskPage');
const TeacherAtRiskPage = page(atRisk, 'TeacherAtRiskPage');
const AssistantPage = page(() => import('@/pages/shared/AssistantPage'), 'AssistantPage');
const TeacherQuizzesPage = page(() => import('@/pages/teacher/QuizzesPage'), 'TeacherQuizzesPage');
const QuizReviewPage = page(() => import('@/pages/teacher/QuizReviewPage'), 'QuizReviewPage');
const studentQuizzes = () => import('@/pages/student/StudentQuizzesPage');
const StudentQuizzesPage = page(studentQuizzes, 'StudentQuizzesPage');
const StudentQuizPage = page(studentQuizzes, 'StudentQuizPage');

const FeeSetupPage = page(() => import('@/pages/finance/FeeSetupPage'), 'FeeSetupPage');
const financeDashboard = () => import('@/pages/finance/FinanceDashboardPage');
const FinanceDashboardPage = page(financeDashboard, 'FinanceDashboardPage');
const PaymentsPage = page(financeDashboard, 'PaymentsPage');
const InvoicesPage = page(() => import('@/pages/finance/InvoicesPage'), 'InvoicesPage');

const dashboards = () => import('@/pages/shared/Dashboards');
const AdminDashboardPage = page(dashboards, 'AdminDashboardPage');
const ParentDashboardPage = page(dashboards, 'ParentDashboardPage');
const StudentDashboardPage = page(dashboards, 'StudentDashboardPage');
const TeacherDashboardPage = page(dashboards, 'TeacherDashboardPage');

const EventsPage = page(() => import('@/pages/shared/EventsPage'), 'EventsPage');
const fees = () => import('@/pages/shared/FeesPage');
const ParentFeesPage = page(fees, 'ParentFeesPage');
const PaymentResultPage = page(fees, 'PaymentResultPage');
const StudentFeesPage = page(fees, 'StudentFeesPage');
const materials = () => import('@/pages/shared/MaterialsPage');
const ParentMaterialsPage = page(materials, 'ParentMaterialsPage');
const StudentMaterialsPage = page(materials, 'StudentMaterialsPage');
const TeacherMaterialsPage = page(materials, 'TeacherMaterialsPage');
const NoticesPage = page(() => import('@/pages/shared/NoticesPage'), 'NoticesPage');
const NotificationPreferencesPage = page(
  () => import('@/pages/shared/NotificationPreferencesPage'),
  'NotificationPreferencesPage',
);
const results = () => import('@/pages/shared/ResultsPage');
const ParentResultsPage = page(results, 'ParentResultsPage');
const StudentResultsPage = page(results, 'StudentResultsPage');
const SectionResultsPage = page(
  () => import('@/pages/shared/SectionResultsPage'),
  'SectionResultsPage',
);
const studentAssignments = () => import('@/pages/shared/StudentAssignmentsPage');
const ParentAssignmentsPage = page(studentAssignments, 'ParentAssignmentsPage');
const StudentAssignmentsPage = page(studentAssignments, 'StudentAssignmentsPage');
const timetable = () => import('@/pages/shared/TimetablePage');
const ParentTimetablePage = page(timetable, 'ParentTimetablePage');
const StudentTimetablePage = page(timetable, 'StudentTimetablePage');
const TeacherTimetablePage = page(timetable, 'TeacherTimetablePage');
const VerifyStudentPage = page(
  () => import('@/pages/shared/VerifyStudentPage'),
  'VerifyStudentPage',
);

const ParentAttendancePage = page(
  () => import('@/pages/parent/ParentAttendancePage'),
  'ParentAttendancePage',
);
const MyAttendancePage = page(() => import('@/pages/student/MyAttendancePage'), 'MyAttendancePage');
const teacherAssignments = () => import('@/pages/teacher/AssignmentsPage');
const SubmissionsPage = page(teacherAssignments, 'SubmissionsPage');
const TeacherAssignmentsPage = page(teacherAssignments, 'TeacherAssignmentsPage');
const MarksPage = page(() => import('@/pages/teacher/MarksPage'), 'MarksPage');
const MyClassesPage = page(() => import('@/pages/teacher/MyClassesPage'), 'MyClassesPage');
const ReportsPage = page(() => import('@/pages/teacher/ReportsPage'), 'ReportsPage');
const TakeAttendancePage = page(
  () => import('@/pages/teacher/TakeAttendancePage'),
  'TakeAttendancePage',
);

function RoleHome() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  // Visitors get the public homepage. Anyone already logged in goes straight to their dashboard.
  return user ? <Navigate to={homePathFor(user.role)} replace /> : <HomePage />;
}

export function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/" element={<RoleHome />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify/:id/:token" element={<VerifyStudentPage />} />
        <Route path="/payments/result" element={<PaymentResultPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="/notifications/preferences" element={<NotificationPreferencesPage />} />

            <Route path="/finance" element={<ProtectedRoute roles={FINANCE_ROLES} />}>
              <Route index element={<FinanceDashboardPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="setup" element={<FeeSetupPage />} />
              <Route path="notices" element={<NoticesPage />} />
              <Route path="events" element={<EventsPage />} />
            </Route>

            <Route path="/admin/settings" element={<ProtectedRoute roles={['SUPER_ADMIN']} />}>
              <Route index element={<InstitutionSettingsPage />} />
            </Route>

            <Route path="/admin" element={<ProtectedRoute roles={ADMIN_ROLES} />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="departments" element={<DepartmentsPage />} />
              <Route path="programs" element={<ProgramsPage />} />
              <Route path="semesters" element={<SemestersPage />} />
              <Route path="courses" element={<CoursesPage />} />
              <Route path="offerings" element={<OfferingsPage />} />
              <Route path="teachers" element={<TeachersPage />} />
              <Route path="students" element={<StudentsPage />} />
              <Route path="parents" element={<ParentsPage />} />
              <Route path="rooms" element={<RoomsPage />} />
              <Route path="timetable" element={<TimetableEditorPage />} />
              <Route path="timetable-generator" element={<TimetableGeneratorPage />} />
              <Route path="at-risk" element={<AdminAtRiskPage />} />
              <Route path="policies" element={<PoliciesPage />} />
              <Route path="exams" element={<ExamsPage />} />
              <Route path="exams/:id" element={<ExamDetailPage />} />
              <Route path="results" element={<SectionResultsPage />} />
              <Route path="notices" element={<NoticesPage />} />
              <Route path="events" element={<EventsPage />} />
            </Route>

            <Route path="/teacher" element={<ProtectedRoute roles={['TEACHER']} />}>
              <Route index element={<TeacherDashboardPage />} />
              <Route path="classes" element={<MyClassesPage />} />
              <Route path="timetable" element={<TeacherTimetablePage />} />
              <Route path="attendance" element={<TakeAttendancePage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="marks" element={<MarksPage />} />
              <Route path="results" element={<SectionResultsPage />} />
              <Route path="assignments" element={<TeacherAssignmentsPage />} />
              <Route path="assignments/:id" element={<SubmissionsPage />} />
              <Route path="materials" element={<TeacherMaterialsPage />} />
              <Route path="quizzes" element={<TeacherQuizzesPage />} />
              <Route path="quizzes/:id" element={<QuizReviewPage />} />
              <Route path="at-risk" element={<TeacherAtRiskPage />} />
              <Route path="notices" element={<NoticesPage />} />
              <Route path="events" element={<EventsPage />} />
            </Route>

            <Route path="/student" element={<ProtectedRoute roles={['STUDENT']} />}>
              <Route index element={<StudentDashboardPage />} />
              <Route path="timetable" element={<StudentTimetablePage />} />
              <Route path="attendance" element={<MyAttendancePage />} />
              <Route path="results" element={<StudentResultsPage />} />
              <Route path="assignments" element={<StudentAssignmentsPage />} />
              <Route path="materials" element={<StudentMaterialsPage />} />
              <Route path="quizzes" element={<StudentQuizzesPage />} />
              <Route path="quizzes/:id" element={<StudentQuizPage />} />
              <Route path="fees" element={<StudentFeesPage />} />
              <Route path="notices" element={<NoticesPage />} />
              <Route path="events" element={<EventsPage />} />
            </Route>

            <Route
              path="/parent"
              element={
                <ActiveChildProvider>
                  <ProtectedRoute roles={['PARENT']} />
                </ActiveChildProvider>
              }
            >
              <Route index element={<ParentDashboardPage />} />
              <Route path="timetable" element={<ParentTimetablePage />} />
              <Route path="attendance" element={<ParentAttendancePage />} />
              <Route path="results" element={<ParentResultsPage />} />
              <Route path="assignments" element={<ParentAssignmentsPage />} />
              <Route path="materials" element={<ParentMaterialsPage />} />
              <Route path="fees" element={<ParentFeesPage />} />
              <Route path="notices" element={<NoticesPage />} />
              <Route path="events" element={<EventsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
