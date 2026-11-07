import { prisma } from './prisma.js';

export type AiFeature = 'ASSISTANT' | 'EMBEDDING' | 'QUIZ' | 'RISK' | 'TIMETABLE';

interface AiCall {
  userId: string | null;
  feature: AiFeature;
  model: string;
  tokensIn?: number | null;
  tokensOut?: number | null;
  latencyMs: number;
  succeeded: boolean;
  errorCode?: string;
}

/** Records one AI call. Holds no prompts or replies. A logging failure never breaks the feature. */
export async function logAiCall(call: AiCall) {
  try {
    await prisma.aiCallLog.create({ data: call });
  } catch (error) {
    console.error('Could not log an AI call', error);
  }
}
