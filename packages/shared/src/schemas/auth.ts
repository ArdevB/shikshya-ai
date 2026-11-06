import { z } from 'zod';
import type { Role } from '../enums.js';

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginBody = z.infer<typeof loginBody>;

export const passwordRule = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

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
