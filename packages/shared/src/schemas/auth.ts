import { z } from 'zod';
import type { Role } from '../enums.js';

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginBody = z.infer<typeof loginBody>;

/** Passwords that pass the rules below but are among the first anyone would try. */
const COMMON_PASSWORDS = new Set([
  'password1',
  'password12',
  'password123',
  'password1234',
  'passw0rd',
  'p@ssw0rd',
  'p@ssword1',
  'admin123',
  'admin1234',
  'administrator1',
  'qwerty123',
  'qwerty1234',
  'qwertyuiop1',
  'abc12345',
  'abcd1234',
  'a1234567',
  'a12345678',
  '1234567a',
  '12345678a',
  '1q2w3e4r',
  '1qaz2wsx',
  'iloveyou1',
  'letmein1',
  'letmein123',
  'welcome1',
  'welcome123',
  'nepal123',
  'nepal1234',
  'kathmandu1',
  'kathmandu123',
  'shikshya1',
  'shikshya123',
  'student1',
  'student123',
  'teacher1',
  'teacher123',
]);

// bcrypt only reads the first 72 bytes, so a longer password would be silently cut short.
export const passwordRule = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number')
  .refine((password) => !COMMON_PASSWORDS.has(password.toLowerCase()), {
    message: 'That password is too common. Choose one that is harder to guess',
  });

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: passwordRule,
});
export type ChangePasswordBody = z.infer<typeof changePasswordBody>;

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  mustChangePassword: boolean;
  /** Set for students, teachers and parents: the id of their profile row. */
  studentId: string | null;
  teacherId: string | null;
  parentId: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}
