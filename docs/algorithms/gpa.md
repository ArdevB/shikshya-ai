# GPA and CGPA calculation

Written for the project report and viva. The calculations are in `packages/shared/src/grading.ts`, shared by the API and web app so they cannot disagree, and `apps/api/src/services/grading.ts` applies them to the database.

## The grading table

The table lives in the database (`GradeScale`), so a college can adjust it without a code change. The demo data uses the one published by [TU's Central Department of CS & IT](https://cdcsit.tu.edu.np/pages/bs-2733):

| Percent        | Grade | Grade point |
| -------------- | ----- | ----------- |
| 90 to 100      | A     | 4.0         |
| 80 to below 90 | A-    | 3.7         |
| 70 to below 80 | B+    | 3.3         |
| 60 to below 70 | B     | 3.0         |
| 50 to below 60 | B-    | 2.7         |
| 40 to below 50 | C     | 2.3         |
| below 40       | F     | 0           |

## The steps

**1. One course.** Marks combine across the semester's published exams, such as an internal and a final:

$$\text{percent} = \frac{\sum \text{marks obtained}}{\sum \text{full marks}} \times 100$$

An absent student scores zero for that paper. The percentage then picks a row in the table.

**2. Passing.** A student must reach the combined pass marks as well as a passing grade. Someone can have a C overall and still fail the course if they fall short of the pass marks, and then the course is an F.

**3. GPA for a semester.** Each course counts in proportion to its credit hours:

$$\text{GPA} = \frac{\sum (\text{grade point} \times \text{credit hours})}{\sum \text{credit hours}}$$

**4. CGPA across semesters.** Each semester's GPA is weighted by its credits, which gives the same answer as applying the GPA formula to every course ever taken:

$$\text{CGPA} = \frac{\sum (\text{GPA} \times \text{credits in that semester})}{\sum \text{credits}}$$

Both round to 2 decimal places.

## A worked example

| Course               | Credits | Percent | Grade | Grade point | Points   |
| -------------------- | ------- | ------- | ----- | ----------- | -------- |
| Software Engineering | 3       | 85      | A-    | 3.7         | 11.1     |
| Compiler Design      | 3       | 72      | B+    | 3.3         | 9.9      |
| Lab                  | 1       | 91      | A     | 4.0         | 4.0      |
| **Total**            | **7**   |         |       |             | **25.0** |

GPA = 25.0 / 7 = **3.57**.

If the previous semester had a GPA of 3.20 over 18 credits, then CGPA = (3.57 × 7 + 3.20 × 18) / 25 = (24.99 + 57.60) / 25 = **3.30**.

## When results are calculated

Results are not recalculated on every read. Publishing an exam locks its marks and rebuilds the semester's results, all in one transaction, so nobody ever sees a half-finished result. An admin can unlock an exam, which withdraws it from students' results until it is published again. Both are written to the audit log.

Publishing is refused while any marks are missing, because a missing mark would quietly fail a student.

## Testing

`packages/shared/src/grading.test.ts` checks the band boundaries, rounding and both formulas. `apps/api/test/academics.test.ts` checks publishing, locking, and that a second exam combines into the same result, and `apps/api/test/finance.test.ts` that the marksheet and transcript show the same GPA and CGPA as the API.
