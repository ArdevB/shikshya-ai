import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { ADMIN_ROLES, FINANCE_ROLES, homePathFor } from '@/auth/roles';
import { AppLayout } from '@/components/AppLayout';
import { FullPageSpinner } from '@/components/feedback';
import { CoursesPage } from '@/pages/admin/CoursesPage';
import { DepartmentsPage } from '@/pages/admin/DepartmentsPage';
import { ExamDetailPage, ExamsPage } from '@/pages/admin/ExamsPage';
import { InstitutionSettingsPage } from '@/pages/admin/InstitutionSettingsPage';
import { OfferingsPage } from '@/pages/admin/OfferingsPage';
import { ParentsPage } from '@/pages/admin/ParentsPage';
import { ProgramsPage } from '@/pages/admin/ProgramsPage';
import { RoomsPage } from '@/pages/admin/RoomsPage';
import { SemestersPage } from '@/pages/admin/SemestersPage';
import { StudentsPage } from '@/pages/admin/StudentsPage';
import { TeachersPage } from '@/pages/admin/TeachersPage';
import { TimetableEditorPage } from '@/pages/admin/TimetableEditorPage';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { FeeSetupPage } from '@/pages/finance/FeeSetupPage';
import { FinanceDashboardPage, PaymentsPage } from '@/pages/finance/FinanceDashboardPage';
import { InvoicesPage } from '@/pages/finance/InvoicesPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ParentAttendancePage } from '@/pages/parent/ParentAttendancePage';
import { ProfilePage } from '@/pages/ProfilePage';
import { ActiveChildProvider } from '@/pages/shared/ChildSwitcher';
import {
  AdminDashboardPage,
  ParentDashboardPage,
  StudentDashboardPage,
  TeacherDashboardPage,
} from '@/pages/shared/Dashboards';
import { EventsPage } from '@/pages/shared/EventsPage';
import { ParentFeesPage, PaymentResultPage, StudentFeesPage } from '@/pages/shared/FeesPage';
import { NotificationPreferencesPage } from '@/pages/shared/NotificationPreferencesPage';
import { VerifyStudentPage } from '@/pages/shared/VerifyStudentPage';
import {
  ParentMaterialsPage,
  StudentMaterialsPage,
  TeacherMaterialsPage,
} from '@/pages/shared/MaterialsPage';
import { NoticesPage } from '@/pages/shared/NoticesPage';
import { ParentResultsPage, StudentResultsPage } from '@/pages/shared/ResultsPage';
import { SectionResultsPage } from '@/pages/shared/SectionResultsPage';
import {
  ParentAssignmentsPage,
  StudentAssignmentsPage,
} from '@/pages/shared/StudentAssignmentsPage';
import {
  ParentTimetablePage,
  StudentTimetablePage,
  TeacherTimetablePage,
} from '@/pages/shared/TimetablePage';
import { MyAttendancePage } from '@/pages/student/MyAttendancePage';
import { SubmissionsPage, TeacherAssignmentsPage } from '@/pages/teacher/AssignmentsPage';
import { MarksPage } from '@/pages/teacher/MarksPage';
import { MyClassesPage } from '@/pages/teacher/MyClassesPage';
import { ReportsPage } from '@/pages/teacher/ReportsPage';
import { TakeAttendancePage } from '@/pages/teacher/TakeAttendancePage';

function RoleHome() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RoleHome />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verify/:id/:token" element={<VerifyStudentPage />} />
      <Route path="/payments/result" element={<PaymentResultPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/profile" element={<ProfilePage />} />
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
  );
}
