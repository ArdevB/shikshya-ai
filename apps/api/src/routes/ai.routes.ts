import {
  assistantMessageBody,
  type AssistantStreamEvent,
  offeringPeriodsBody,
  paginationQuery,
  policyDocumentBody,
  quizGenerateBody,
  quizGradeBody,
  quizListQuery,
  quizPublishBody,
  quizQuestionBody,
  quizSubmitBody,
  quizUpdateBody,
  riskListQuery,
  riskReviewBody,
  teacherUnavailabilityBody,
  timetableApplyBody,
  timetableGenerateBody,
} from '@shikshya/shared';
import { type Request, Router } from 'express';
import { ApiError } from '../lib/errors.js';
import { reportError } from '../lib/logger.js';
import { uploadFiles } from '../lib/storage.js';
import { ADMIN_ROLES, currentUser, requireRole } from '../middleware/auth.js';
import { aiLimit, expensiveAiLimit } from '../middleware/rateLimits.js';
import { param, parseBody, parseQuery } from '../middleware/validate.js';
import * as assistant from '../services/assistant/assistant.service.js';
import * as policies from '../services/policy.service.js';
import * as quizzes from '../services/quiz.service.js';
import * as risk from '../services/risk.service.js';
import * as generator from '../services/timetableGenerator.service.js';

const firstFile = (req: Request) => (req.files as Express.Multer.File[] | undefined)?.[0];

/** Every logged-in role may use the assistant. What it can see depends on who is asking. */
export function assistantRoutes() {
  const router = Router();
  router.use(aiLimit());

  router.get('/status', (req, res) => {
    res.json(assistant.assistantStatus(currentUser(req)));
  });
  router.get('/conversations', async (req, res) => {
    res.json(await assistant.listConversations(currentUser(req), parseQuery(req, paginationQuery)));
  });
  router.get('/conversations/:id/messages', async (req, res) => {
    res.json(await assistant.getConversationMessages(currentUser(req), param(req, 'id')));
  });
  router.delete('/conversations/:id', async (req, res) => {
    await assistant.deleteConversation(currentUser(req), param(req, 'id'));
    res.status(204).end();
  });

  /** Replies as a stream of server-sent events. Failures before the first event are ordinary errors. */
  router.post('/messages', async (req, res) => {
    const user = currentUser(req);
    const body = parseBody(req, assistantMessageBody);
    assistant.assertAssistantConfigured();
    await assistant.assertWithinRateLimit(user);
    if (body.conversationId) {
      await assistant.getConversationMessages(user, body.conversationId);
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const emit = (event: AssistantStreamEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    try {
      await assistant.sendAssistantMessage(user, body, emit);
    } catch (error) {
      reportError(error, 'Assistant stream failed', { requestId: req.id });
      emit({
        type: 'error',
        code: error instanceof ApiError ? error.code : 'INTERNAL',
        message: error instanceof ApiError ? error.message : 'Something went wrong.',
      });
    }
    res.end();
  });
  return router;
}

export function policyRoutes() {
  const router = Router();
  router.use(aiLimit());
  const admin = requireRole(...ADMIN_ROLES);

  router.get('/', admin, async (_req, res) => {
    res.json(await policies.listPolicies());
  });
  router.post('/', admin, uploadFiles, async (req, res) => {
    res
      .status(201)
      .json(
        await policies.uploadPolicy(
          currentUser(req),
          parseBody(req, policyDocumentBody),
          firstFile(req),
        ),
      );
  });
  router.post('/reindex', expensiveAiLimit(), admin, async (req, res) => {
    res.json(await policies.reindexPolicies(currentUser(req)));
  });
  router.delete('/:id', admin, async (req, res) => {
    await policies.deletePolicy(param(req, 'id'));
    res.status(204).end();
  });
  return router;
}

/** Teachers and admins only. Students and parents have no route to a risk label. */
export function riskRoutes() {
  const router = Router();
  router.use(aiLimit());
  const staff = requireRole('TEACHER', ...ADMIN_ROLES);
  const admin = requireRole(...ADMIN_ROLES);

  router.get('/', staff, async (req, res) => {
    res.json(await risk.listRiskPredictions(currentUser(req), parseQuery(req, riskListQuery)));
  });
  router.get('/summary', admin, async (_req, res) => {
    res.json(await risk.riskSummary());
  });
  router.post('/recompute', expensiveAiLimit(), admin, async (req, res) => {
    res.json(await risk.computeRiskPredictions(new Date(), currentUser(req).id));
  });
  router.post('/:id/review', staff, async (req, res) => {
    res.json(
      await risk.reviewRiskPrediction(
        currentUser(req),
        param(req, 'id'),
        parseBody(req, riskReviewBody),
      ),
    );
  });
  return router;
}

export function quizRoutes() {
  const router = Router();
  router.use(aiLimit());
  const expensive = expensiveAiLimit();
  const teacher = requireRole('TEACHER');
  const staff = requireRole('TEACHER', ...ADMIN_ROLES);
  const student = requireRole('STUDENT');

  // Declared before /:id, so "mine" is not taken for an id.
  router.get('/mine', student, async (req, res) => {
    res.json(await quizzes.listStudentQuizzes(currentUser(req)));
  });
  router.get('/mine/:id', student, async (req, res) => {
    res.json(await quizzes.getStudentQuiz(currentUser(req), param(req, 'id')));
  });
  router.post('/mine/:id/submit', student, async (req, res) => {
    res
      .status(201)
      .json(
        await quizzes.submitQuiz(
          currentUser(req),
          param(req, 'id'),
          parseBody(req, quizSubmitBody),
        ),
      );
  });

  router.get('/', staff, async (req, res) => {
    res.json(await quizzes.listQuizzes(currentUser(req), parseQuery(req, quizListQuery)));
  });
  router.post('/generate', expensive, teacher, uploadFiles, async (req, res) => {
    res
      .status(201)
      .json(
        await quizzes.generateQuiz(
          currentUser(req),
          parseBody(req, quizGenerateBody),
          firstFile(req),
        ),
      );
  });
  router.post('/answers/:answerId/grade', teacher, async (req, res) => {
    res.json(
      await quizzes.gradeQuizAnswer(
        currentUser(req),
        param(req, 'answerId'),
        parseBody(req, quizGradeBody),
      ),
    );
  });
  router.get('/:id', staff, async (req, res) => {
    res.json(await quizzes.getQuiz(currentUser(req), param(req, 'id')));
  });
  router.put('/:id', teacher, async (req, res) => {
    res.json(
      await quizzes.updateQuiz(currentUser(req), param(req, 'id'), parseBody(req, quizUpdateBody)),
    );
  });
  router.delete('/:id', teacher, async (req, res) => {
    await quizzes.deleteQuiz(currentUser(req), param(req, 'id'));
    res.status(204).end();
  });
  router.post('/:id/publish', teacher, async (req, res) => {
    res.json(
      await quizzes.publishQuiz(
        currentUser(req),
        param(req, 'id'),
        parseBody(req, quizPublishBody),
      ),
    );
  });
  router.get('/:id/attempts', staff, async (req, res) => {
    res.json(await quizzes.listQuizAttempts(currentUser(req), param(req, 'id')));
  });
  router.put('/:id/questions/:questionId', teacher, async (req, res) => {
    res.json(
      await quizzes.updateQuestion(
        currentUser(req),
        param(req, 'id'),
        param(req, 'questionId'),
        parseBody(req, quizQuestionBody),
      ),
    );
  });
  router.delete('/:id/questions/:questionId', teacher, async (req, res) => {
    await quizzes.deleteQuestion(currentUser(req), param(req, 'id'), param(req, 'questionId'));
    res.status(204).end();
  });
  router.post('/:id/questions/:questionId/approve', teacher, async (req, res) => {
    res.json(
      await quizzes.setQuestionApproved(
        currentUser(req),
        param(req, 'id'),
        param(req, 'questionId'),
        true,
      ),
    );
  });
  router.post('/:id/questions/:questionId/unapprove', teacher, async (req, res) => {
    res.json(
      await quizzes.setQuestionApproved(
        currentUser(req),
        param(req, 'id'),
        param(req, 'questionId'),
        false,
      ),
    );
  });
  router.post('/:id/questions/:questionId/regenerate', expensive, teacher, async (req, res) => {
    res.json(
      await quizzes.regenerateQuestion(
        currentUser(req),
        param(req, 'id'),
        param(req, 'questionId'),
      ),
    );
  });
  return router;
}

export function timetableGeneratorRoutes() {
  const router = Router();
  router.use(aiLimit());
  router.use(requireRole(...ADMIN_ROLES));

  router.get('/semesters/:semesterId/inputs', async (req, res) => {
    res.json(await generator.generatorInputs(param(req, 'semesterId')));
  });
  router.put('/offerings/:id/periods', async (req, res) => {
    await generator.setOfferingPeriods(param(req, 'id'), parseBody(req, offeringPeriodsBody));
    res.status(204).end();
  });
  router.put('/teachers/:id/unavailability', async (req, res) => {
    await generator.setTeacherUnavailability(
      param(req, 'id'),
      parseBody(req, teacherUnavailabilityBody),
    );
    res.status(204).end();
  });
  router.post('/generate', expensiveAiLimit(), async (req, res) => {
    res.json(
      await generator.generateTimetable(currentUser(req), parseBody(req, timetableGenerateBody)),
    );
  });
  router.post('/check', async (req, res) => {
    res.json(await generator.checkPlacements(parseBody(req, timetableApplyBody)));
  });
  router.post('/apply', async (req, res) => {
    res.json(await generator.applyTimetable(currentUser(req), parseBody(req, timetableApplyBody)));
  });
  return router;
}
