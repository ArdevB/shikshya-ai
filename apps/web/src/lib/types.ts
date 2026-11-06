/** The shapes the API returns for lists. Requests are typed by the shared Zod schemas. */

export interface Department {
  id: string;
  name: string;
  code: string;
}

export interface Program {
  id: string;
  departmentId: string;
  name: string;
  code: string;
  durationSemesters: number;
  gradingScheme: string;
  department: { id: string; name: string; code: string };
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface Semester {
  id: string;
  programId: string;
  academicYearId: string;
  number: number;
  startDate: string;
  endDate: string;
  program: { id: string; name: string; code: string };
  academicYear: { id: string; name: string };
}

export interface Section {
  id: string;
  semesterId: string;
  name: string;
  semester: {
    id: string;
    number: number;
    program: { id: string; name: string; code: string };
    academicYear: { id: string; name: string };
  };
}

export interface Course {
  id: string;
  programId: string;
  code: string;
  title: string;
  creditHours: number;
  semesterNumber: number;
  hasPractical: boolean;
  program: { id: string; name: string; code: string };
}

export interface CourseOffering {
  id: string;
  courseId: string;
  sectionId: string;
  teacherId: string;
  course: { id: string; code: string; title: string; creditHours: number; programId: string };
  section: Section;
  teacher: {
    id: string;
    employeeCode: string;
    user: { firstName: string; lastName: string };
  };
}

interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
}

export interface Teacher {
  id: string;
  employeeCode: string;
  departmentId: string;
  designation: string;
  user: UserSummary;
  department: { id: string; name: string; code: string };
}

export interface Student {
  id: string;
  rollNumber: string;
  registrationNumber: string | null;
  programId: string;
  currentSectionId: string;
  admissionDate: string;
  dateOfBirth: string | null;
  address: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  user: UserSummary;
  program: { id: string; name: string; code: string };
  currentSection: { id: string; name: string; semester: { id: string; number: number } };
}

export interface Parent {
  id: string;
  user: UserSummary;
  children: {
    relation: string;
    student: {
      id: string;
      rollNumber: string;
      user: { firstName: string; lastName: string };
    };
  }[];
}

export interface OwnChild {
  relation: string;
  student: {
    id: string;
    rollNumber: string;
    user: { firstName: string; lastName: string };
    currentSection: { name: string; semester: { number: number } };
    program: { code: string };
  };
}

export interface RosterEntry {
  studentId: string;
  rollNumber: string;
  studentName: string;
}

export interface AttendanceSession {
  id: string;
  courseOfferingId: string;
  date: string;
  period: number;
  createdAt: string;
  records: { studentId: string; status: string; remark: string | null }[];
  courseOffering?: {
    id: string;
    course: { code: string; title: string };
    section: { name: string };
  };
}

export interface OverviewStats {
  departments: number;
  programs: number;
  courses: number;
  sections: number;
  teachers: number;
  students: number;
  parents: number;
}

export const sectionLabel = (section: Section) =>
  `${section.semester.program.code} Sem ${section.semester.number} ${section.name} (${section.semester.academicYear.name})`;

export const offeringLabel = (offering: CourseOffering) =>
  `${offering.course.code} ${offering.course.title}, Section ${offering.section.name}`;

export const personName = (person: { firstName: string; lastName: string }) =>
  `${person.firstName} ${person.lastName}`;
