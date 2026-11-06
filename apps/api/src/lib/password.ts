import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';

const ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12;

export const hashPassword = (password: string) => bcrypt.hash(password, ROUNDS);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

/** A readable one-time password. The trailing "a1" guarantees it meets the password rule. */
export function generateTemporaryPassword() {
  return `${randomBytes(9).toString('base64url')}a1`;
}
