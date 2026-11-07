import type { AuthUser, ChangePasswordBody, LoginBody, LoginResponse } from '@shikshya/shared';
import { ApiError, unauthorized } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  signAccessToken,
} from '../lib/tokens.js';

const authUserInclude = {
  student: { select: { id: true } },
  teacher: { select: { id: true } },
  parent: { select: { id: true } },
} as const;

async function loadAuthUser(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: authUserInclude });
  if (!user) throw unauthorized();
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    mustChangePassword: user.mustChangePassword,
    studentId: user.student?.id ?? null,
    teacherId: user.teacher?.id ?? null,
    parentId: user.parent?.id ?? null,
  };
}

async function issueRefreshToken(userId: string) {
  const token = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return token;
}

export interface SessionResult extends LoginResponse {
  refreshToken: string;
}

export const MAX_FAILED_LOGINS = 10;
export const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * A bcrypt hash of a random value that was thrown away. Checking against it takes as long as a real
 * check, so an unknown email cannot be told apart from a known one by how fast the reply comes.
 */
const NO_SUCH_USER_HASH = '$2b$12$mIkFWd0k8w4ZMW3oh/cHtewqgrQtuFQJ5cj7httrIDQOs/TBoawnu';

/** After too many wrong passwords, from anywhere, the account refuses all logins for a while. */
async function recordFailedLogin(user: { id: string; email: string }) {
  const { failedLoginCount } = await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  if (failedLoginCount < MAX_FAILED_LOGINS) return;

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) },
  });
  logger.warn({ userId: user.id }, 'Account locked after repeated failed logins');
}

export async function login({ email, password }: LoginBody): Promise<SessionResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  const passwordMatches = await verifyPassword(password, user?.passwordHash ?? NO_SUCH_USER_HASH);

  // The same message for every failure, including a locked account, so this cannot be used to
  // discover which emails exist. The message explains locking, for anyone it happens to.
  const invalid = new ApiError(
    401,
    'INVALID_CREDENTIALS',
    `Incorrect email or password. After ${MAX_FAILED_LOGINS} failed attempts an account is locked for ${LOCKOUT_MS / 60_000} minutes.`,
  );
  if (!user) throw invalid;
  // Checked before the password, so a locked account stays locked even for the right one.
  if (user.lockedUntil && user.lockedUntil > new Date()) throw invalid;
  if (!passwordMatches) {
    await recordFailedLogin(user);
    throw invalid;
  }
  if (!user.isActive) throw invalid;

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  });

  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken: await issueRefreshToken(user.id),
    user: await loadAuthUser(user.id),
  };
}

/**
 * Each refresh token works once and is replaced by a new one. If a token that was
 * already used comes back, it may have been stolen, so all that user's sessions end.
 */
export async function refresh(token: string): Promise<SessionResult> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
    include: { user: true },
  });
  if (!stored) throw unauthorized('Your session has expired');

  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized('Your session has expired');
  }
  if (stored.expiresAt < new Date() || !stored.user.isActive) {
    throw unauthorized('Your session has expired');
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return {
    accessToken: signAccessToken({ sub: stored.user.id, role: stored.user.role }),
    refreshToken: await issueRefreshToken(stored.user.id),
    user: await loadAuthUser(stored.user.id),
  };
}

export async function logout(token: string | undefined) {
  if (!token) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export const getMe = loadAuthUser;

export async function changePassword(
  userId: string,
  { currentPassword, newPassword }: ChangePasswordBody,
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new ApiError(400, 'INVALID_PASSWORD', 'Your current password is incorrect');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    }),
    // Log out every other device.
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
