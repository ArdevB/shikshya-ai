/**
 * Demo data for local development: `pnpm db:seed`.
 * Replaces everything in the database, so it refuses to run in production.
 * The random generator has a fixed seed, so every run produces the same data.
 */
import { AttendanceStatus, PrismaClient, type Role, type Student } from '@prisma/client';
import bcrypt from 'bcrypt';
import { findClashes } from '../src/services/clashes.js';
import { recomputeSemesterResults } from '../src/services/grading.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The demo seed replaces all data and must not run in production.');
}

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Shikshya@123';
const EMAIL_DOMAIN = 'shikshya.test';

// A small seeded generator (mulberry32), so attendance varies but stays repeatable.
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = createRandom(20260601);

const FIRST_NAMES = [
  'Aarav',
  'Aayush',
  'Abishek',
  'Anil',
  'Anish',
  'Bibek',
  'Bikash',
  'Binod',
  'Deepak',
  'Dipesh',
  'Ganesh',
  'Hari',
  'Kiran',
  'Manish',
  'Nabin',
  'Prabin',
  'Rajan',
  'Roshan',
  'Sagar',
  'Suman',
  'Aasha',
  'Anjali',
  'Anita',
  'Bina',
  'Deepa',
  'Gita',
  'Kritika',
  'Laxmi',
  'Manisha',
  'Nisha',
  'Pooja',
  'Pratima',
  'Puja',
  'Rachana',
  'Rekha',
  'Sabina',
  'Sarita',
  'Shristi',
  'Sita',
  'Sunita',
];
const LAST_NAMES = [
  'Sharma',
  'Adhikari',
  'Shrestha',
  'Thapa',
  'Gurung',
  'Tamang',
  'Rai',
  'Karki',
  'Basnet',
  'Poudel',
];

const COURSES = [
  { code: 'CSC364', title: 'Software Engineering', credits: 3, practical: true },
  { code: 'CSC365', title: 'Compiler Design and Construction', credits: 3, practical: true },
  { code: 'CSC366', title: 'E-Governance', credits: 3, practical: false },
  { code: 'CSC367', title: 'NET Centric Computing', credits: 3, practical: true },
  { code: 'CSC368', title: 'Technical Writing', credits: 3, practical: false },
  { code: 'CSC369', title: 'Applied Logic', credits: 3, practical: false },
];

const TEACHERS = [
  { first: 'Ramesh', last: 'Koirala', designation: 'Associate Professor' },
  { first: 'Sushila', last: 'Bhandari', designation: 'Assistant Professor' },
  { first: 'Prakash', last: 'Pandey', designation: 'Lecturer' },
  { first: 'Meena', last: 'Joshi', designation: 'Lecturer' },
];

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** Today's calendar date in Nepal, as a UTC midnight, which is how dates are stored. */
function todayInKathmandu() {
  const text = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
  return new Date(text);
}

/** Empties every table, so this keeps working as later phases add more of them. */
async function clearDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`);
}

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

/**
 * The grading table published by TU's Central Department of CS & IT.
 * It lives in the database, so a college can adjust it without a code change.
 */
const TU_GRADE_SCALE = [
  { grade: 'A', minPercent: 90, maxPercent: 100, gradePoint: 4.0 },
  { grade: 'A-', minPercent: 80, maxPercent: 90, gradePoint: 3.7 },
  { grade: 'B+', minPercent: 70, maxPercent: 80, gradePoint: 3.3 },
  { grade: 'B', minPercent: 60, maxPercent: 70, gradePoint: 3.0 },
  { grade: 'B-', minPercent: 50, maxPercent: 60, gradePoint: 2.7 },
  { grade: 'C', minPercent: 40, maxPercent: 50, gradePoint: 2.3 },
  { grade: 'F', minPercent: 0, maxPercent: 40, gradePoint: 0 },
];

const PERIODS = [
  ['07:00', '07:50'],
  ['07:50', '08:40'],
  ['08:40', '09:30'],
  ['09:50', '10:40'],
  ['10:40', '11:30'],
  ['11:30', '12:20'],
] as const;

async function main() {
  await clearDatabase();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const account = (email: string, role: Role, firstName: string, lastName: string) => ({
    email: `${email}@${EMAIL_DOMAIN}`,
    passwordHash,
    role,
    firstName,
    lastName,
  });

  await prisma.user.create({ data: account('superadmin', 'SUPER_ADMIN', 'Super', 'Admin') });
  const adminUser = await prisma.user.create({
    data: account('admin', 'ADMIN', 'Shanta', 'Regmi'),
  });
  await prisma.gradeScale.createMany({ data: TU_GRADE_SCALE });

  const department = await prisma.department.create({
    data: { name: 'Computer Science', code: 'CS' },
  });
  const csit = await prisma.program.create({
    data: {
      departmentId: department.id,
      name: 'BSc. CSIT',
      code: 'CSIT',
      durationSemesters: 8,
    },
  });
  await prisma.program.create({
    data: {
      departmentId: department.id,
      name: 'Bachelor of Information Technology',
      code: 'BIT',
      durationSemesters: 8,
    },
  });

  const today = todayInKathmandu();
  const thisYear = today.getUTCFullYear();
  const year = await prisma.academicYear.create({
    data: {
      name: `${thisYear}/${String(thisYear + 1).slice(2)}`,
      startDate: new Date(Date.UTC(thisYear, 0, 1)),
      endDate: new Date(Date.UTC(thisYear, 11, 31)),
      isCurrent: true,
    },
  });

  // Semesters 1-8 for CSIT. Odd and even run in alternating halves of the year.
  const semesters = await Promise.all(
    Array.from({ length: 8 }, (_, i) => i + 1).map((number) => {
      const firstHalf = number % 2 === 1;
      return prisma.semester.create({
        data: {
          programId: csit.id,
          academicYearId: year.id,
          number,
          startDate: new Date(Date.UTC(thisYear, firstHalf ? 0 : 6, 1)),
          endDate: new Date(Date.UTC(thisYear, firstHalf ? 5 : 11, 30)),
        },
      });
    }),
  );
  // Semester 6 is the one in progress, whatever date the seed happens to run on.
  const semester6 = await prisma.semester.update({
    where: { id: semesters.find((s) => s.number === 6)!.id },
    data: { startDate: addDays(today, -90), endDate: addDays(today, 90) },
  });

  const sectionA = await prisma.section.create({ data: { semesterId: semester6.id, name: 'A' } });
  const sectionB = await prisma.section.create({ data: { semesterId: semester6.id, name: 'B' } });

  const courses = await Promise.all(
    COURSES.map((c) =>
      prisma.course.create({
        data: {
          programId: csit.id,
          code: c.code,
          title: c.title,
          creditHours: c.credits,
          semesterNumber: 6,
          hasPractical: c.practical,
        },
      }),
    ),
  );

  const teachers = await Promise.all(
    TEACHERS.map((t, i) =>
      prisma.teacher.create({
        data: {
          employeeCode: `T-${String(i + 1).padStart(3, '0')}`,
          designation: t.designation,
          department: { connect: { id: department.id } },
          user: {
            create: account(`teacher${i + 1}`, 'TEACHER', t.first, t.last),
          },
        },
      }),
    ),
  );

  // Every course runs in both sections, shared out between the four teachers in turn.
  const offerings = [];
  let nextTeacher = 0;
  for (const section of [sectionA, sectionB]) {
    for (const course of courses) {
      const teacher = teachers[nextTeacher % teachers.length]!;
      nextTeacher += 1;
      offerings.push(
        await prisma.courseOffering.create({
          data: { courseId: course.id, sectionId: section.id, teacherId: teacher.id },
        }),
      );
    }
  }

  // 40 students, 20 in each section.
  const students: Student[] = [];
  for (let i = 0; i < 40; i += 1) {
    const number = String(i + 1).padStart(2, '0');
    const section = i < 20 ? sectionA : sectionB;
    const first = FIRST_NAMES[i % FIRST_NAMES.length]!;
    const last = LAST_NAMES[i % LAST_NAMES.length]!;
    students.push(
      await prisma.student.create({
        data: {
          rollNumber: `CSIT-078-${number}`,
          registrationNumber: `5-2-37-${100 + i}-2021`,
          admissionDate: new Date(Date.UTC(thisYear - 3, 10, 15)),
          dateOfBirth: new Date(Date.UTC(2002, i % 12, (i % 27) + 1)),
          address: 'Kathmandu, Nepal',
          guardianName: `${FIRST_NAMES[(i + 7) % FIRST_NAMES.length]} ${last}`,
          guardianPhone: `98000${String(10000 + i)}`,
          program: { connect: { id: csit.id } },
          currentSection: { connect: { id: section.id } },
          enrollments: { create: { sectionId: section.id } },
          user: { create: account(`student${number}`, 'STUDENT', first, last) },
        },
      }),
    );
  }

  // 5 parents. The first has two children, so the child switcher can be demonstrated.
  for (let i = 0; i < 5; i += 1) {
    const childOne = students[i * 2]!;
    const childTwo = i === 0 ? students[1]! : null;
    const childUser = await prisma.user.findUniqueOrThrow({ where: { id: childOne.userId } });
    await prisma.parent.create({
      data: {
        user: {
          create: account(
            `parent${i + 1}`,
            'PARENT',
            FIRST_NAMES[(i * 2 + 7) % FIRST_NAMES.length]!,
            childUser.lastName,
          ),
        },
        children: {
          create: [
            { studentId: childOne.id, relation: i % 2 === 0 ? 'Father' : 'Mother' },
            ...(childTwo ? [{ studentId: childTwo.id, relation: 'Father' }] : []),
          ],
        },
      },
    });
  }

  // ---------- Rooms, time slots and a clash-free timetable ----------

  const rooms = await Promise.all(
    [
      { name: 'Room 301', capacity: 48, type: 'CLASSROOM' as const },
      { name: 'Room 302', capacity: 48, type: 'CLASSROOM' as const },
      { name: 'Room 303', capacity: 48, type: 'CLASSROOM' as const },
      { name: 'Computer Lab 1', capacity: 30, type: 'LAB' as const },
      { name: 'Seminar Hall', capacity: 120, type: 'HALL' as const },
    ].map((data) => prisma.room.create({ data })),
  );
  const classrooms = rooms.filter((room) => room.type === 'CLASSROOM');

  // Sunday to Friday, 6 periods. Saturday is the weekend in Nepal.
  const slots = [];
  for (const dayOfWeek of [0, 1, 2, 3, 4, 5]) {
    for (const [index, [startTime, endTime]] of PERIODS.entries()) {
      slots.push(
        await prisma.timeSlot.create({
          data: { dayOfWeek, startTime, endTime, label: `Period ${index + 1}` },
        }),
      );
    }
  }
  const periodOf = (slot: { startTime: string }) =>
    PERIODS.findIndex(([startTime]) => startTime === slot.startTime) + 1;

  // Each offering meets on 3 different days. A slot is taken greedily when the teacher,
  // the section and a classroom are all free. Every course in this seed fits this way.
  const placed: {
    id: string;
    timeSlotId: string;
    roomId: string;
    teacherId: string;
    sectionId: string;
  }[] = [];
  const timetable = new Map<string, typeof slots>();
  for (const [index, offering] of offerings.entries()) {
    const chosen: typeof slots = [];
    const startDay = index % 6;
    for (let step = 0; step < 6 && chosen.length < 3; step += 2) {
      const day = (startDay + step) % 6;
      for (const slot of slots.filter((candidate) => candidate.dayOfWeek === day)) {
        const here = placed.filter((entry) => entry.timeSlotId === slot.id);
        const busy =
          here.some((entry) => entry.teacherId === offering.teacherId) ||
          here.some((entry) => entry.sectionId === offering.sectionId);
        const room = classrooms.find((r) => !here.some((entry) => entry.roomId === r.id));
        if (busy || !room) continue;

        const entry = await prisma.timetableEntry.create({
          data: {
            courseOfferingId: offering.id,
            roomId: room.id,
            timeSlotId: slot.id,
            semesterId: semester6.id,
          },
        });
        placed.push({
          id: entry.id,
          timeSlotId: slot.id,
          roomId: room.id,
          teacherId: offering.teacherId,
          sectionId: offering.sectionId,
        });
        chosen.push(slot);
        break;
      }
    }
    timetable.set(offering.id, chosen);
  }
  const clashes = findClashes(placed);
  if (clashes.length > 0) throw new Error(`The seed timetable has clashes: ${clashes.length}`);

  // ---------- Three weeks of attendance, on the days each class actually meets ----------

  const rosterOf = (sectionId: string) => students.filter((s) => s.currentSectionId === sectionId);

  // Each student has a typical attendance rate. About one in six sits below 75%.
  const attendanceRate = new Map(
    students.map((student, i) => [
      student.id,
      i % 6 === 2 ? 0.45 + random() * 0.22 : 0.82 + random() * 0.17,
    ]),
  );

  const pickStatus = (rate: number): AttendanceStatus => {
    const roll = random();
    if (roll < rate) return random() < 0.08 ? 'LATE' : 'PRESENT';
    return random() < 0.1 ? 'EXCUSED' : 'ABSENT';
  };

  let sessionCount = 0;
  for (const [index, offering] of offerings.entries()) {
    const teacher = teachers.find((t) => t.id === offering.teacherId)!;
    for (const slot of timetable.get(offering.id) ?? []) {
      for (let back = 21; back >= 1; back -= 1) {
        const day = addDays(today, -back);
        if (day.getUTCDay() !== slot.dayOfWeek) continue;
        // The most recent class of the first offering is left out, so "pending attendance"
        // has something to show.
        if (index === 0 && back <= 6) continue;
        await prisma.attendanceSession.create({
          data: {
            courseOfferingId: offering.id,
            date: new Date(iso(day)),
            period: periodOf(slot),
            takenById: teacher.userId,
            records: {
              create: rosterOf(offering.sectionId).map((student) => ({
                studentId: student.id,
                status: pickStatus(attendanceRate.get(student.id)!),
              })),
            },
          },
        });
        sessionCount += 1;
      }
    }
  }

  // ---------- Exams: one published with results, one still open for marks ----------

  const internal = await prisma.exam.create({
    data: {
      semesterId: semester6.id,
      name: 'First Term',
      type: 'INTERNAL',
      startDate: addDays(today, -30),
      endDate: addDays(today, -24),
    },
  });
  const upcoming = await prisma.exam.create({
    data: {
      semesterId: semester6.id,
      name: 'Pre-board',
      type: 'INTERNAL',
      startDate: addDays(today, 5),
      endDate: addDays(today, 11),
    },
  });

  // Each student has a typical ability, so one student's marks are consistent across courses.
  const ability = new Map(students.map((s, i) => [s.id, i % 7 === 3 ? 30 : 55 + random() * 40]));

  for (const [index, offering] of offerings.entries()) {
    const teacher = teachers.find((t) => t.id === offering.teacherId)!;
    const subject = await prisma.examSubject.create({
      data: {
        examId: internal.id,
        courseOfferingId: offering.id,
        fullMarks: 100,
        passMarks: 40,
        date: new Date(iso(addDays(today, -30 + (index % 6)))),
      },
    });
    await prisma.mark.createMany({
      data: rosterOf(offering.sectionId).map((student, position) => {
        // One student in each section misses one paper, to show how absence is graded.
        const isAbsent = position === 5 && index % 6 === 2;
        const score = ability.get(student.id)! + (random() - 0.5) * 16;
        return {
          examSubjectId: subject.id,
          studentId: student.id,
          isAbsent,
          marksObtained: isAbsent ? null : Math.round(Math.min(100, Math.max(0, score))),
          enteredById: teacher.userId,
        };
      }),
    });
    await prisma.examSubject.create({
      data: {
        examId: upcoming.id,
        courseOfferingId: offering.id,
        fullMarks: 100,
        passMarks: 40,
        date: new Date(iso(addDays(today, 5 + (index % 6)))),
      },
    });
  }
  await prisma.exam.update({ where: { id: internal.id }, data: { isPublished: true } });
  await prisma.$transaction((tx) => recomputeSemesterResults(tx, semester6.id), {
    timeout: 60_000,
  });

  // ---------- Assignments, from long past to next week, with mixed submissions ----------

  const ASSIGNMENTS = [
    { title: 'Requirements document for a library system', due: -14, late: false, handedIn: 1 },
    { title: 'Lexical analyser in C', due: -7, late: true, handedIn: 0.8 },
    { title: 'E-governance case study: Nagarik app', due: -2, late: false, handedIn: 0.7 },
    { title: 'REST API with ASP.NET Core', due: 3, late: true, handedIn: 0.4 },
    { title: 'Technical report outline', due: 6, late: false, handedIn: 0.2 },
    { title: 'Propositional logic problem set', due: 10, late: false, handedIn: 0 },
  ];
  for (const [index, spec] of ASSIGNMENTS.entries()) {
    const offering = offerings[index]!;
    const teacher = teachers.find((t) => t.id === offering.teacherId)!;
    const dueAt = addDays(new Date(), spec.due);
    const assignment = await prisma.assignment.create({
      data: {
        courseOfferingId: offering.id,
        title: spec.title,
        description: `Complete **${spec.title}** and submit it here.\n\n- Cite your sources\n- Keep it concise`,
        dueAt,
        maxMarks: 20,
        allowLate: spec.late,
        createdById: teacher.userId,
      },
    });
    for (const student of rosterOf(offering.sectionId)) {
      if (random() > spec.handedIn) continue;
      const isLate = spec.late && spec.due < 0 && random() < 0.25;
      const graded = spec.due <= -7;
      await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentId: student.id,
          submittedAt: addDays(dueAt, isLate ? 1 : -1),
          text: 'My submission for this assignment.',
          isLate,
          marks: graded ? 10 + Math.floor(random() * 11) : null,
          feedback: graded ? 'Well structured. Check your references.' : null,
          gradedById: graded ? teacher.userId : null,
          gradedAt: graded ? addDays(dueAt, 3) : null,
        },
      });
    }
  }

  // ---------- Notices and events ----------

  const NOTICES = [
    {
      title: 'Welcome to the new semester',
      body: 'Classes for this semester are now **in session**. Check your timetable for rooms.',
      audience: 'ALL' as const,
      isPinned: true,
    },
    {
      title: 'Pre-board examination routine published',
      body: 'The Pre-board examinations begin next week. See your dashboard for dates.',
      audience: 'STUDENTS' as const,
      isPinned: true,
    },
    {
      title: 'Marks submission deadline',
      body: 'Please enter all First Term marks before the department meeting.',
      audience: 'TEACHERS' as const,
    },
    {
      title: 'Parent-teacher meeting',
      body: 'Parents are invited to meet teachers this Friday from 10:00 to 13:00.',
      audience: 'PARENTS' as const,
    },
    {
      title: 'BSc. CSIT project proposal defence',
      body: 'Semester 6 students should prepare their project proposals for defence.',
      audience: 'PROGRAM' as const,
      programId: csit.id,
    },
    {
      title: 'Section A: lab rescheduled',
      body: 'The Sunday lab moves to **Computer Lab 1** for this week only.',
      audience: 'SECTION' as const,
      sectionId: sectionA.id,
    },
    {
      title: 'Section B: guest lecture',
      body: 'A guest lecture on cloud computing will take place on Thursday.',
      audience: 'SECTION' as const,
      sectionId: sectionB.id,
    },
    {
      title: 'Library hours extended',
      body: 'The library now stays open until 18:00 on weekdays.',
      audience: 'ALL' as const,
    },
  ];
  for (const [index, notice] of NOTICES.entries()) {
    await prisma.notice.create({
      data: { ...notice, publishAt: addDays(new Date(), -index), createdById: adminUser.id },
    });
  }

  const EVENTS = [
    {
      title: 'Sports week',
      days: 7,
      length: 3,
      location: 'College ground',
      audience: 'ALL' as const,
    },
    {
      title: 'Department meeting',
      days: 2,
      length: 0,
      location: 'Seminar Hall',
      audience: 'TEACHERS' as const,
    },
    {
      title: 'Project proposal defence',
      days: 14,
      length: 1,
      location: 'Seminar Hall',
      audience: 'STUDENTS' as const,
    },
    {
      title: 'Parent-teacher meeting',
      days: 4,
      length: 0,
      location: 'Room 301',
      audience: 'PARENTS' as const,
    },
  ];
  for (const { days, length, ...event } of EVENTS) {
    const startAt = addDays(new Date(`${iso(today)}T04:15:00.000Z`), days);
    await prisma.event.create({
      data: {
        ...event,
        startAt,
        endAt: new Date(addDays(startAt, length).getTime() + 3 * 3_600_000),
        createdById: adminUser.id,
      },
    });
  }

  console.log('\nSeed complete.');
  console.log(
    `  ${students.length} students, ${teachers.length} teachers, ${offerings.length} offerings, ${placed.length} timetable entries, ${sessionCount} attendance sessions\n`,
  );
  console.log(`Every account uses the password: ${DEMO_PASSWORD}\n`);
  console.table([
    { role: 'Super admin', email: `superadmin@${EMAIL_DOMAIN}` },
    { role: 'Admin', email: `admin@${EMAIL_DOMAIN}` },
    { role: 'Teacher (1 to 4)', email: `teacher1@${EMAIL_DOMAIN}` },
    { role: 'Student (01 to 40)', email: `student01@${EMAIL_DOMAIN}` },
    { role: 'Student below 75%', email: `student03@${EMAIL_DOMAIN}` },
    { role: 'Parent of two (1 to 5)', email: `parent1@${EMAIL_DOMAIN}` },
  ]);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
