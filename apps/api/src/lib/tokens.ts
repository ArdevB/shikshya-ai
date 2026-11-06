import type { Role } from '@shikshya/shared';
import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as AccessTokenPayload;
}

/**
 * Refresh tokens are long random strings rather than JWTs. Only a hash is stored,
 * so a leaked database cannot be used to log in as anyone.
 */
export function generateRefreshToken() {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
