// ============================================
// TimeTrack - Shared Constants
// ============================================

export const APP_NAME = 'TimeTrack';
export const APP_VERSION = '1.0.0';
export const COMPANY_NAME = 'NovaStream Digital';

// Auth
export const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY_DAYS = 7;
export const BCRYPT_ROUNDS = 12;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 30;
export const TOTP_WINDOW = 1;

// QR Code
export const QR_ROTATION_INTERVAL_SECONDS = 30;
export const QR_MAX_AGE_SECONDS = 60;

// Geofencing
export const DEFAULT_GEOFENCE_RADIUS_METERS = 100;
export const MAX_GEOFENCE_RADIUS_METERS = 5000;
export const GPS_ACCURACY_THRESHOLD_METERS = 50;

// Attendance
export const DEFAULT_GRACE_MINUTES_LATE = 15;
export const DEFAULT_GRACE_MINUTES_EARLY = 15;
export const DEFAULT_BREAK_DURATION_MINUTES = 60;
export const MAX_WORK_HOURS_PER_DAY = 16;
export const OVERTIME_THRESHOLD_HOURS = 8;

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Rate Limiting
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_MAX_REQUESTS = 100;
export const AUTH_RATE_LIMIT_MAX = 10;

// File Upload
export const MAX_FILE_SIZE_MB = 10;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// Device
export const MAX_DEVICES_PER_USER = 3;

// Leave
export const DEFAULT_ANNUAL_LEAVE_DAYS = 25;
export const MAX_LEAVE_DAYS_PER_REQUEST = 30;
