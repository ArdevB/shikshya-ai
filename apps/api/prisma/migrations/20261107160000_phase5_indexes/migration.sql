-- Foreign keys that queries filter on, found by comparing Postgres's list of foreign keys with
-- its indexes, and the finance reports' filter on status and payment date.
CREATE INDEX "Payment_status_paidAt_idx" ON "Payment"("status", "paidAt");
CREATE INDEX "QuizAttempt_studentId_idx" ON "QuizAttempt"("studentId");
CREATE INDEX "QuizAnswer_questionId_idx" ON "QuizAnswer"("questionId");
CREATE INDEX "Invoice_feeStructureId_idx" ON "Invoice"("feeStructureId");
CREATE INDEX "Notice_createdById_idx" ON "Notice"("createdById");
CREATE INDEX "Quiz_createdById_idx" ON "Quiz"("createdById");
CREATE INDEX "Event_sectionId_idx" ON "Event"("sectionId");
CREATE INDEX "Event_programId_idx" ON "Event"("programId");
CREATE INDEX "AiCallLog_userId_idx" ON "AiCallLog"("userId");
