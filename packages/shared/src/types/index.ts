// ============================================
// TimeTrack - Shared Type Definitions
// NovaStream Digital
// ============================================

// --- Enums ---

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  HR_MANAGER = 'HR_MANAGER',
  DEPARTMENT_HEAD = 'DEPARTMENT_HEAD',
  SUPERVISOR = 'SUPERVISOR',
  EMPLOYEE = 'EMPLOYEE',
}

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  EARLY_DEPARTURE = 'EARLY_DEPARTURE',
  HALF_DAY = 'HALF_DAY',
  ON_LEAVE = 'ON_LEAVE',
  HOLIDAY = 'HOLIDAY',
  REMOTE = 'REMOTE',
}

export enum ClockMethod {
  QR_CODE = 'QR_CODE',
  GPS = 'GPS',
  MANUAL = 'MANUAL',
  BIOMETRIC = 'BIOMETRIC',
  NFC = 'NFC',
  KIOSK = 'KIOSK',
}

export enum LeaveType {
  ANNUAL = 'ANNUAL',
  SICK = 'SICK',
  MATERNITY = 'MATERNITY',
  PATERNITY = 'PATERNITY',
  COMPASSIONATE = 'COMPASSIONATE',
  STUDY = 'STUDY',
  UNPAID = 'UNPAID',
  OTHER = 'OTHER',
}

export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum ShiftType {
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
  NIGHT = 'NIGHT',
  FLEXIBLE = 'FLEXIBLE',
  SPLIT = 'SPLIT',
  CUSTOM = 'CUSTOM',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ESCALATED = 'ESCALATED',
}

export enum DevicePlatform {
  ANDROID = 'ANDROID',
  IOS = 'IOS',
  WEB = 'WEB',
  KIOSK = 'KIOSK',
}

export enum AuditAction {
  CLOCK_IN = 'CLOCK_IN',
  CLOCK_OUT = 'CLOCK_OUT',
  LEAVE_REQUEST = 'LEAVE_REQUEST',
  LEAVE_APPROVE = 'LEAVE_APPROVE',
  LEAVE_REJECT = 'LEAVE_REJECT',
  RECORD_EDIT = 'RECORD_EDIT',
  USER_CREATE = 'USER_CREATE',
  USER_UPDATE = 'USER_UPDATE',
  USER_DEACTIVATE = 'USER_DEACTIVATE',
  SETTINGS_CHANGE = 'SETTINGS_CHANGE',
  EXPORT = 'EXPORT',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  FAILED_LOGIN = 'FAILED_LOGIN',
}

// --- Interfaces ---

export interface User {
  id: string;
  employeeId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  departmentId: string;
  isActive: boolean;
  phoneNumber?: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  parentId?: string;
  headId?: string;
  isActive: boolean;
  createdAt: Date;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isActive: boolean;
  timezone: string;
  createdAt: Date;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  clockIn?: Date;
  clockOut?: Date;
  clockInMethod?: ClockMethod;
  clockOutMethod?: ClockMethod;
  clockInLocationId?: string;
  clockOutLocationId?: string;
  clockInLatitude?: number;
  clockInLongitude?: number;
  clockOutLatitude?: number;
  clockOutLongitude?: number;
  status: AttendanceStatus;
  totalHours?: number;
  overtimeHours?: number;
  notes?: string;
  isManualEntry: boolean;
  approvedBy?: string;
  deviceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Shift {
  id: string;
  name: string;
  type: ShiftType;
  startTime: string;
  endTime: string;
  graceMinutesLate: number;
  graceMinutesEarly: number;
  breakDurationMinutes: number;
  isDefault: boolean;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  attachmentUrl?: string;
  createdAt: Date;
}

export interface QrToken {
  locationId: string;
  timestamp: number;
  nonce: string;
  signature: string;
}

export interface DeviceInfo {
  id: string;
  userId: string;
  deviceName: string;
  platform: DevicePlatform;
  fingerprint: string;
  isApproved: boolean;
  lastUsedAt: Date;
  registeredAt: Date;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}

// --- API Response Types ---

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  statusCode: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse {
  user: Omit<User, 'createdAt' | 'updatedAt'>;
  tokens: AuthTokens;
  requiresTwoFactor?: boolean;
}

// --- Dashboard Types ---

export interface DashboardStats {
  totalEmployees: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  onLeaveToday: number;
  averageArrivalTime: string;
  attendanceRate: number;
}

export interface DepartmentAttendance {
  departmentId: string;
  departmentName: string;
  totalStaff: number;
  present: number;
  absent: number;
  late: number;
  attendanceRate: number;
}
