import { z } from 'zod';
import { UserRole, LeaveType, ClockMethod, ShiftType } from '../types';

// --- Auth Validators ---

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  employeeId: z.string().min(1, 'Employee ID is required').max(50),
  departmentId: z.string().uuid('Invalid department ID'),
  role: z.nativeEnum(UserRole).default(UserRole.EMPLOYEE),
  phoneNumber: z.string().optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(8)
      .regex(/[A-Z]/)
      .regex(/[a-z]/)
      .regex(/[0-9]/)
      .regex(/[^A-Za-z0-9]/),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// --- Attendance Validators ---

export const clockInSchema = z.object({
  locationId: z.string().uuid(),
  method: z.nativeEnum(ClockMethod),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  qrToken: z.string().optional(),
  deviceFingerprint: z.string().optional(),
});

export const clockOutSchema = z.object({
  method: z.nativeEnum(ClockMethod),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  notes: z.string().max(500).optional(),
});

export const manualEntrySchema = z.object({
  userId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clockIn: z.string().datetime(),
  clockOut: z.string().datetime(),
  reason: z.string().min(1).max(500),
});

// --- Leave Validators ---

export const leaveRequestSchema = z
  .object({
    type: z.nativeEnum(LeaveType),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().min(1, 'Reason is required').max(1000),
    attachmentUrl: z.string().url().optional(),
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  });

// --- Department Validators ---

export const departmentSchema = z.object({
  name: z.string().min(1).max(200),
  code: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9-]+$/, 'Code must be uppercase alphanumeric with hyphens'),
  parentId: z.string().uuid().optional(),
  headId: z.string().uuid().optional(),
});

// --- Location Validators ---

export const locationSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(10).max(5000).default(100),
  timezone: z.string().default('Africa/Accra'),
});

// --- Shift Validators ---

export const shiftSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.nativeEnum(ShiftType),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  graceMinutesLate: z.number().min(0).max(60).default(15),
  graceMinutesEarly: z.number().min(0).max(60).default(15),
  breakDurationMinutes: z.number().min(0).max(120).default(60),
});

// --- Query Validators ---

export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  perPage: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const dateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Export inferred types
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ClockInInput = z.infer<typeof clockInSchema>;
export type ClockOutInput = z.infer<typeof clockOutSchema>;
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;
export type DepartmentInput = z.infer<typeof departmentSchema>;
export type LocationInput = z.infer<typeof locationSchema>;
export type ShiftInput = z.infer<typeof shiftSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
