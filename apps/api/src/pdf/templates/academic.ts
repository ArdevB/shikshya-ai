import type { SemesterResult, StudentResults } from '@shikshya/shared';
import { BASE_STYLES, documentPage, esc, factList, type Institution } from './layout.js';

function courseTable(semester: SemesterResult) {
  const rows = semester.courses
    .map(
      (course) => `<tr>
        <td>${esc(course.courseCode)}</td>
        <td>${esc(course.courseTitle)}</td>
        <td class="num">${esc(course.creditHours)}</td>
        <td class="num">${esc(course.percent.toFixed(2))}%</td>
        <td class="num">${esc(course.grade)}</td>
        <td class="num">${esc(course.gradePoint.toFixed(2))}</td>
      </tr>`,
    )
    .join('');
  return `<table><thead><tr>
    <th>Code</th><th>Course</th><th class="num">Credits</th><th class="num">Percent</th><th class="num">Grade</th><th class="num">Grade point</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

const principalLine = (institution: Institution) =>
  `<div class="signature"><div>${esc(institution.principalName || 'Principal')}<br><span class="muted">Principal</span></div></div>`;

export function marksheetHtml(
  institution: Institution,
  results: StudentResults,
  semester: SemesterResult,
) {
  return documentPage(
    institution,
    `Marksheet, semester ${semester.semesterNumber}`,
    `<div class="doc-title"><h2>Semester marksheet</h2><span class="accent">${esc(semester.status)}</span></div>
    ${factList([
      ['Student', results.studentName],
      ['Program', semester.programCode],
      ['Roll no.', results.rollNumber],
      ['Semester', semester.semesterNumber],
      ['Academic year', semester.academicYear],
      ['Total credits', semester.totalCredits],
    ])}
    ${courseTable(semester)}
    <div class="summary">
      <div><span class="muted">GPA</span><b>${esc(semester.gpa.toFixed(2))}</b></div>
      <div><span class="muted">CGPA to date</span><b>${esc(results.cgpa.toFixed(2))}</b></div>
    </div>
    ${principalLine(institution)}
    <div class="footer">GPA is the sum of (grade point x credit hours) divided by the sum of credit hours.</div>`,
  );
}

export function transcriptHtml(institution: Institution, results: StudentResults) {
  const semesters = results.semesters
    .map(
      (
        semester,
      ) => `<h2 style="font-size:14px;margin:18px 0 8px">Semester ${esc(semester.semesterNumber)}
        <span class="muted" style="font-weight:400;font-size:12px">${esc(semester.academicYear)}, GPA ${esc(semester.gpa.toFixed(2))}, ${esc(semester.status)}</span></h2>
        ${courseTable(semester)}`,
    )
    .join('');
  const credits = results.semesters.reduce((sum, semester) => sum + semester.totalCredits, 0);
  return documentPage(
    institution,
    'Academic transcript',
    `<div class="doc-title"><h2>Academic transcript</h2></div>
    ${factList([
      ['Student', results.studentName],
      ['Roll no.', results.rollNumber],
    ])}
    ${semesters}
    <div class="summary">
      <div><span class="muted">CGPA</span><b>${esc(results.cgpa.toFixed(2))}</b></div>
      <div><span class="muted">Credits completed</span><b>${esc(credits)}</b></div>
    </div>
    ${principalLine(institution)}`,
  );
}

export function idCardHtml(
  institution: Institution,
  student: {
    name: string;
    rollNumber: string;
    programName: string;
    photoDataUrl: string | null;
  },
  qrDataUrl: string,
) {
  const initials = student.name
    .split(' ')
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('');
  const photo = student.photoDataUrl
    ? `<img class="photo" src="${esc(student.photoDataUrl)}" alt="">`
    : `<div class="photo placeholder">${esc(initials)}</div>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Student ID card</title><style>
  ${BASE_STYLES}
  @page { size: 85.6mm 54mm; margin: 0; }
  body { width: 85.6mm; height: 54mm; overflow: hidden; font-size: 8pt; }
  .band { background: #0593C6; color: #FCFFFF; padding: 2mm 3mm; font-weight: 700; font-size: 9.5pt; display: flex; justify-content: space-between; align-items: center; }
  .band small { font-weight: 500; font-size: 6.5pt; }
  .strip { height: 1mm; background: #D83995; }
  .card { display: flex; gap: 3mm; padding: 2.5mm 3mm; }
  .photo { width: 20mm; height: 25mm; object-fit: cover; border-radius: 1mm; border: 0.3mm solid #D5E6ED; }
  .placeholder { background: #E7F5FA; display: flex; align-items: center; justify-content: center; font-size: 18pt; font-weight: 700; color: #04729A; }
  .details { flex: 1; min-width: 0; }
  .name { font-size: 10pt; font-weight: 700; line-height: 1.2; }
  .details p { margin: 1mm 0 0; }
  .label { color: #4A6472; font-size: 6.5pt; display: block; }
  .qr { width: 17mm; height: 17mm; align-self: flex-end; }
</style></head><body>
  <div class="band"><span>${esc(institution.name)}</span><small>Student ID</small></div>
  <div class="strip"></div>
  <div class="card">
    ${photo}
    <div class="details">
      <div class="name">${esc(student.name)}</div>
      <p><span class="label">Program</span>${esc(student.programName)}</p>
      <p><span class="label">Roll number</span>${esc(student.rollNumber)}</p>
    </div>
    <img class="qr" src="${esc(qrDataUrl)}" alt="">
  </div>
</body></html>`;
}
