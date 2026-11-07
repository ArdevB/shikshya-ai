/**
 * Load test for the main read endpoints, with 100 virtual users. Needs k6: https://k6.io
 *
 *   k6 run load/read-endpoints.js
 *   k6 run -e BASE_URL=https://your-site.vercel.app load/read-endpoints.js
 *
 * It only reads, and logs in with the demo accounts, so it is safe to run against demo data.
 * Results and how to read them are in docs/performance.md.
 */
/* global __ENV, __VU, __ITER -- provided by k6 */
import { check, sleep } from 'k6';
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const API = `${BASE_URL}/api/v1`;
const PASSWORD = 'Shikshya@123';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

function logIn(email) {
  const response = http.post(`${API}/auth/login`, JSON.stringify({ email, password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(response, { 'logged in': (r) => r.status === 200 });
  return response.json();
}

/** Logs in once for each kind of person, so the test measures reading rather than bcrypt. */
export function setup() {
  const student = logIn('student01@shikshya.test');
  const teacher = logIn('teacher1@shikshya.test');
  const admin = logIn('admin@shikshya.test');
  const id = student.user.studentId;
  return {
    people: [
      {
        token: student.accessToken,
        paths: [
          '/auth/me',
          `/dashboard/students/${id}/today`,
          `/dashboard/students/${id}/deadlines`,
          `/students/${id}/attendance-summary`,
          `/students/${id}/results`,
          `/students/${id}/timetable`,
          '/notices?pageSize=20',
          '/notifications?pageSize=20',
          '/invoices',
        ],
      },
      {
        token: teacher.accessToken,
        paths: [
          '/auth/me',
          '/dashboard/teacher/today-classes',
          '/dashboard/teacher/pending-attendance',
          '/dashboard/teacher/low-attendance',
          '/exam-subjects/mine',
          '/assignments?pageSize=20',
        ],
      },
      {
        token: admin.accessToken,
        paths: [
          '/auth/me',
          '/stats/overview',
          '/dashboard/admin/students-by-program',
          '/dashboard/admin/attendance-today',
          '/dashboard/admin/low-attendance',
          '/students?pageSize=20',
          '/invoices?pageSize=20',
        ],
      },
    ],
  };
}

export default function (data) {
  // Most people using the system are students, so most virtual users are too.
  const person = data.people[__VU % 10 < 7 ? 0 : __VU % 10 < 9 ? 1 : 2];
  const path = person.paths[__ITER % person.paths.length];
  const response = http.get(`${API}${path}`, {
    headers: { Authorization: `Bearer ${person.token}` },
    tags: { name: path.replace(/c[a-z0-9]{24}/g, ':id').split('?')[0] },
  });
  check(response, { 'status is 200': (r) => r.status === 200 });
  // Someone reading a page, not a machine hammering it.
  sleep(1);
}
