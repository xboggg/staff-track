import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../../database/database.service';
import { LocationsService } from '../locations/locations.service';
import { QrCodesService } from '../qr-codes/qr-codes.service';

// Penalty thresholds for missed clock-outs (per month)
const MISSED_CLOCKOUT_THRESHOLDS = [
  { count: 3, level: 'WARNING', message: 'You have missed clocking out 3 times this month. Please remember to clock out.' },
  { count: 5, level: 'CAUTION', message: 'You have missed clocking out 5 times this month. This may affect your attendance record.' },
  { count: 8, level: 'SERIOUS', message: 'You have missed clocking out 8 times this month. Please see your supervisor.' },
  { count: 10, level: 'CRITICAL', message: 'You have missed clocking out 10+ times this month. Disciplinary action may be taken.' },
];

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly locationsService: LocationsService,
    private readonly qrCodesService: QrCodesService,
  ) {}

  async clockIn(data: {
    userId: string;
    locationId: string;
    method: string;
    latitude?: number;
    longitude?: number;
    qrToken?: string;
    deviceFingerprint?: string;
    ipAddress?: string;
  }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already clocked in today
    const existing = await this.db.attendanceRecord.findUnique({
      where: { userId_date: { userId: data.userId, date: today } },
    });

    if (existing?.clockIn) {
      throw new ConflictException('Already clocked in today');
    }

    // Validate location/geofence
    const location = await this.locationsService.findById(data.locationId);

    if (data.latitude !== undefined && data.longitude !== undefined) {
      const isWithin = this.locationsService.isWithinGeofence(
        data.latitude,
        data.longitude,
        location.latitude,
        location.longitude,
        location.radiusMeters,
      );

      if (!isWithin) {
        // In development, log warning but allow clock-in
        if (process.env.NODE_ENV === 'development') {
          this.logger.warn(`Geofence bypass (dev): user=${data.userId} outside radius`);
        } else {
          throw new BadRequestException('You are not within the allowed location radius');
        }
      }
    }

    // Validate QR code if provided
    if (data.qrToken && data.method === 'QR_CODE') {
      const isValidQr = await this.qrCodesService.validateToken(data.qrToken, data.locationId);
      if (!isValidQr) {
        throw new BadRequestException('Invalid or expired QR code');
      }
    }

    // Determine status (late check against assigned shift)
    const now = new Date();
    let status: string = 'PRESENT';

    try {
      const activeAssignment = await this.db.shiftAssignment.findFirst({
        where: {
          userId: data.userId,
          isActive: true,
          startDate: { lte: today },
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
        include: { shift: true },
      });

      // Fall back to default shift if no assignment
      const shift = activeAssignment?.shift
        || await this.db.shift.findFirst({
          where: { organizationId: (await this.db.user.findUnique({ where: { id: data.userId }, select: { organizationId: true } }))!.organizationId, isDefault: true },
        });

      if (shift) {
        const [shiftHour, shiftMin] = shift.startTime.split(':').map(Number);
        const shiftStart = new Date(today);
        shiftStart.setHours(shiftHour, shiftMin, 0, 0);
        const graceMs = (shift.graceMinutesLate || 15) * 60000;
        if (now.getTime() > shiftStart.getTime() + graceMs) {
          status = 'LATE';
        }
      }
    } catch (e) {
      this.logger.warn(`Late detection failed for user=${data.userId}: ${e}`);
    }

    const record = await this.db.attendanceRecord.upsert({
      where: { userId_date: { userId: data.userId, date: today } },
      create: {
        userId: data.userId,
        date: today,
        clockIn: now,
        clockInMethod: data.method as any,
        clockInLocationId: data.locationId,
        clockInLatitude: data.latitude,
        clockInLongitude: data.longitude,
        status: status as any,
        ipAddress: data.ipAddress,
        deviceId: data.deviceFingerprint,
      },
      update: {
        clockIn: now,
        clockInMethod: data.method as any,
        clockInLocationId: data.locationId,
        clockInLatitude: data.latitude,
        clockInLongitude: data.longitude,
        status: status as any,
      },
    });

    // Audit log
    await this.db.auditLog.create({
      data: {
        userId: data.userId,
        action: 'CLOCK_IN',
        entityType: 'attendance_record',
        entityId: record.id,
        newValue: {
          method: data.method,
          locationId: data.locationId,
          time: now.toISOString(),
        },
        ipAddress: data.ipAddress,
      },
    });

    this.logger.log(`Clock-in: user=${data.userId} method=${data.method}`);
    return record;
  }

  async clockOut(data: {
    userId: string;
    method: string;
    latitude?: number;
    longitude?: number;
    notes?: string;
    ipAddress?: string;
  }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await this.db.attendanceRecord.findUnique({
      where: { userId_date: { userId: data.userId, date: today } },
    });

    if (!record || !record.clockIn) {
      throw new BadRequestException('No clock-in record found for today');
    }

    if (record.clockOut) {
      throw new ConflictException('Already clocked out today');
    }

    const now = new Date();
    const totalMinutes = Math.round(
      (now.getTime() - record.clockIn.getTime()) / 60000,
    );
    const overtimeMinutes = Math.max(0, totalMinutes - 480); // 8 hours = 480 minutes

    const updated = await this.db.attendanceRecord.update({
      where: { id: record.id },
      data: {
        clockOut: now,
        clockOutMethod: data.method as any,
        clockOutLatitude: data.latitude,
        clockOutLongitude: data.longitude,
        totalMinutes,
        overtimeMinutes: overtimeMinutes > 0 ? overtimeMinutes : null,
        notes: data.notes,
      },
    });

    // Audit log
    await this.db.auditLog.create({
      data: {
        userId: data.userId,
        action: 'CLOCK_OUT',
        entityType: 'attendance_record',
        entityId: record.id,
        newValue: {
          method: data.method,
          time: now.toISOString(),
          totalMinutes,
        },
        ipAddress: data.ipAddress,
      },
    });

    this.logger.log(`Clock-out: user=${data.userId} total=${totalMinutes}min`);
    return updated;
  }

  // ========== AUTO CLOCK-OUT CRON ==========
  // Runs every day at 8:00 PM (20:00) Africa/Accra time
  @Cron('0 20 * * *', { timeZone: 'Africa/Accra' })
  async autoClockOut() {
    this.logger.log('Running auto clock-out job...');

    // Find all records (any date) that have clock-in but no clock-out
    const openRecords = await this.db.attendanceRecord.findMany({
      where: {
        clockIn: { not: null },
        clockOut: null,
      },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    if (!openRecords.length) {
      this.logger.log('Auto clock-out: no open records found');
      return { autoClocked: 0 };
    }

    const now = new Date();
    let autoClocked = 0;

    for (const record of openRecords) {
      // For past records, use end-of-day (5 PM closing time) as clock-out
      // For today's records, use current time
      // Use clockIn date (not record.date) to handle date mismatches
      const clockInDate = new Date(record.clockIn!);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const clockInDay = new Date(clockInDate);
      clockInDay.setHours(0, 0, 0, 0);
      const isPastRecord = clockInDay.getTime() < today.getTime();

      let clockOutTime: Date;
      if (isPastRecord) {
        // Set clock-out to 5:00 PM on the clock-in date (standard closing)
        clockOutTime = new Date(clockInDate);
        clockOutTime.setHours(17, 0, 0, 0);
        // If clock-in was after 5 PM, add 30 min grace
        if (clockInDate.getTime() > clockOutTime.getTime()) {
          clockOutTime = new Date(clockInDate.getTime() + 30 * 60000);
        }
      } else {
        clockOutTime = now;
      }

      const totalMinutes = Math.round(
        (clockOutTime.getTime() - record.clockIn!.getTime()) / 60000,
      );
      // Cap at 10 hours max for auto clock-out, minimum 0
      const cappedMinutes = Math.min(Math.max(0, totalMinutes), 600);
      const overtimeMinutes = Math.max(0, cappedMinutes - 480);

      await this.db.attendanceRecord.update({
        where: { id: record.id },
        data: {
          clockOut: clockOutTime,
          clockOutMethod: 'MANUAL' as any,
          totalMinutes: cappedMinutes,
          overtimeMinutes: overtimeMinutes > 0 ? overtimeMinutes : null,
          status: 'AUTO_CLOCKED_OUT' as any,
          notes: isPastRecord
            ? `Auto clocked out by system. Employee did not clock out on ${clockInDay.toLocaleDateString('en-GH')}. Hours capped at standard closing time (5:00 PM).`
            : `Auto clocked out by system at ${clockOutTime.toLocaleTimeString('en-GH', { timeZone: 'Africa/Accra' })}. Employee did not clock out.`,
        },
      });

      // Create notification for user
      await this.db.notification.create({
        data: {
          userId: record.userId,
          title: 'Missed Clock-Out',
          body: isPastRecord
            ? `You did not clock out on ${clockInDay.toLocaleDateString('en-GH')}. Your hours have been capped at standard closing time (5:00 PM). Please remember to clock out at the end of your shift.`
            : `You were automatically clocked out at ${clockOutTime.toLocaleTimeString('en-GH', { timeZone: 'Africa/Accra' })}. Please remember to clock out at the end of your shift.`,
          type: 'WARNING',
        },
      });

      autoClocked++;
      this.logger.warn(`Auto clock-out: ${record.user.email} (${cappedMinutes} min, ${isPastRecord ? 'past' : 'today'})`);
    }

    // Audit log the batch operation
    await this.db.auditLog.create({
      data: {
        userId: openRecords[0].userId, // system action, attribute to first user
        action: 'AUTO_CLOCK_OUT_BATCH',
        entityType: 'attendance_record',
        entityId: 'system',
        newValue: {
          count: autoClocked,
          time: now.toISOString(),
        },
      },
    });

    this.logger.log(`Auto clock-out complete: ${autoClocked} records processed`);
    return { autoClocked };
  }

  // Manually trigger auto clock-out (for admin use)
  async triggerAutoClockOut() {
    return this.autoClockOut();
  }

  // ========== MISSED CLOCK-OUT STATS ==========

  async getMissedClockOutStats(userId: string) {
    // Get current month range
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Count auto clock-outs this month
    const monthlyCount = await this.db.attendanceRecord.count({
      where: {
        userId,
        status: 'AUTO_CLOCKED_OUT' as any,
        date: { gte: monthStart, lte: monthEnd },
      },
    });

    // Count total auto clock-outs (all time)
    const totalCount = await this.db.attendanceRecord.count({
      where: {
        userId,
        status: 'AUTO_CLOCKED_OUT' as any,
      },
    });

    // Determine penalty level
    let penalty = null;
    for (const threshold of [...MISSED_CLOCKOUT_THRESHOLDS].reverse()) {
      if (monthlyCount >= threshold.count) {
        penalty = { level: threshold.level, message: threshold.message };
        break;
      }
    }

    // Get recent auto clock-out dates
    const recentAutoClockOuts = await this.db.attendanceRecord.findMany({
      where: {
        userId,
        status: 'AUTO_CLOCKED_OUT' as any,
      },
      select: { date: true, totalMinutes: true },
      orderBy: { date: 'desc' },
      take: 5,
    });

    return {
      monthlyCount,
      totalCount,
      penalty,
      recentDates: recentAutoClockOuts.map(r => ({
        date: r.date,
        hours: r.totalMinutes ? Math.round(r.totalMinutes / 60 * 10) / 10 : null,
      })),
      thresholds: MISSED_CLOCKOUT_THRESHOLDS,
    };
  }

  // Admin: get all users with missed clock-out counts this month
  async getMissedClockOutReport(organizationId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const results = await this.db.attendanceRecord.groupBy({
      by: ['userId'],
      where: {
        status: 'AUTO_CLOCKED_OUT' as any,
        date: { gte: monthStart, lte: monthEnd },
        user: { organizationId },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    // Get user details
    const userIds = results.map(r => r.userId);
    const users = await this.db.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true, firstName: true, lastName: true, email: true, employeeId: true,
        department: { select: { name: true } },
      },
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    return results.map(r => {
      const user = userMap.get(r.userId);
      const count = r._count.id;
      let penaltyLevel = 'NONE';
      for (const threshold of [...MISSED_CLOCKOUT_THRESHOLDS].reverse()) {
        if (count >= threshold.count) { penaltyLevel = threshold.level; break; }
      }
      return {
        user,
        missedCount: count,
        penaltyLevel,
      };
    });
  }

  // ========== ADMIN MANUAL CLOCK-IN/OUT ==========

  async adminClockIn(data: {
    adminUserId: string;
    targetUserId: string;
    locationId: string;
    notes?: string;
    ipAddress?: string;
  }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check target user exists
    const targetUser = await this.db.user.findUnique({ where: { id: data.targetUserId } });
    if (!targetUser) throw new BadRequestException('Employee not found');

    // Check if already clocked in
    const existing = await this.db.attendanceRecord.findUnique({
      where: { userId_date: { userId: data.targetUserId, date: today } },
    });
    if (existing?.clockIn) throw new ConflictException('Employee already clocked in today');

    // Validate location
    await this.locationsService.findById(data.locationId);

    const now = new Date();
    const record = await this.db.attendanceRecord.upsert({
      where: { userId_date: { userId: data.targetUserId, date: today } },
      create: {
        userId: data.targetUserId,
        date: today,
        clockIn: now,
        clockInMethod: 'MANUAL' as any,
        clockInLocationId: data.locationId,
        status: 'PRESENT' as any,
        isManualEntry: true,
        approvedBy: data.adminUserId,
        notes: data.notes || `Manually clocked in by admin`,
        ipAddress: data.ipAddress,
      },
      update: {
        clockIn: now,
        clockInMethod: 'MANUAL' as any,
        clockInLocationId: data.locationId,
        status: 'PRESENT' as any,
        isManualEntry: true,
        approvedBy: data.adminUserId,
        notes: data.notes || `Manually clocked in by admin`,
      },
    });

    await this.db.auditLog.create({
      data: {
        userId: data.adminUserId,
        action: 'ADMIN_CLOCK_IN',
        entityType: 'attendance_record',
        entityId: record.id,
        newValue: {
          targetUserId: data.targetUserId,
          targetName: `${targetUser.firstName} ${targetUser.lastName}`,
          locationId: data.locationId,
          time: now.toISOString(),
        },
        ipAddress: data.ipAddress,
      },
    });

    this.logger.log(`Admin clock-in: admin=${data.adminUserId} employee=${targetUser.email}`);
    return record;
  }

  async adminClockOut(data: {
    adminUserId: string;
    targetUserId: string;
    notes?: string;
    ipAddress?: string;
  }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await this.db.attendanceRecord.findUnique({
      where: { userId_date: { userId: data.targetUserId, date: today } },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });

    if (!record || !record.clockIn) throw new BadRequestException('Employee has not clocked in today');
    if (record.clockOut) throw new ConflictException('Employee already clocked out today');

    const now = new Date();
    const totalMinutes = Math.round((now.getTime() - record.clockIn.getTime()) / 60000);
    const overtimeMinutes = Math.max(0, totalMinutes - 480);

    const updated = await this.db.attendanceRecord.update({
      where: { id: record.id },
      data: {
        clockOut: now,
        clockOutMethod: 'MANUAL' as any,
        totalMinutes,
        overtimeMinutes: overtimeMinutes > 0 ? overtimeMinutes : null,
        notes: data.notes || `Manually clocked out by admin`,
      },
    });

    await this.db.auditLog.create({
      data: {
        userId: data.adminUserId,
        action: 'ADMIN_CLOCK_OUT',
        entityType: 'attendance_record',
        entityId: record.id,
        newValue: {
          targetUserId: data.targetUserId,
          targetName: `${record.user.firstName} ${record.user.lastName}`,
          time: now.toISOString(),
          totalMinutes,
        },
        ipAddress: data.ipAddress,
      },
    });

    this.logger.log(`Admin clock-out: admin=${data.adminUserId} employee=${record.user.email} total=${totalMinutes}min`);
    return updated;
  }

  async getMyAttendance(userId: string, startDate: string, endDate: string) {
    return this.db.attendanceRecord.findMany({
      where: {
        userId,
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      include: {
        clockInLocation: { select: { name: true } },
        clockOutLocation: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
    });
  }

  async getTodayStatus(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await this.db.attendanceRecord.findUnique({
      where: { userId_date: { userId, date: today } },
      include: {
        clockInLocation: { select: { name: true } },
      },
    });

    // Get missed clock-out stats
    const missedStats = await this.getMissedClockOutStats(userId);

    return {
      isClockedIn: !!record?.clockIn,
      isClockedOut: !!record?.clockOut,
      record,
      missedClockOuts: missedStats,
    };
  }

  async getAllAttendance(params: {
    organizationId: string;
    startDate: string;
    endDate: string;
    page: number;
    perPage: number;
    status?: string;
    departmentId?: string;
    search?: string;
  }) {
    const { organizationId, page, perPage, status, departmentId, search } = params;
    const startDate = new Date(params.startDate || new Date(Date.now() - 30 * 86400000));
    const endDate = new Date(params.endDate || new Date());
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const where: any = {
      date: { gte: startDate, lte: endDate },
      user: { organizationId },
    };

    if (status) where.status = status;
    if (departmentId) where.user = { ...where.user, departmentId };
    if (search) {
      where.user = {
        ...where.user,
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { employeeId: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.db.attendanceRecord.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              employeeId: true,
              department: { select: { name: true } },
            },
          },
          clockInLocation: { select: { name: true } },
          clockOutLocation: { select: { name: true } },
        },
        orderBy: [{ date: 'desc' }, { clockIn: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.db.attendanceRecord.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async getDashboardStats(organizationId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalEmployees, todayRecords, onLeave] = await Promise.all([
      this.db.user.count({
        where: { organizationId, isActive: true },
      }),
      this.db.attendanceRecord.findMany({
        where: {
          date: today,
          user: { organizationId },
        },
      }),
      this.db.leaveRequest.count({
        where: {
          status: 'APPROVED',
          startDate: { lte: today },
          endDate: { gte: today },
          user: { organizationId },
        },
      }),
    ]);

    const present = todayRecords.filter((r) => r.clockIn).length;
    const late = todayRecords.filter((r) => r.status === 'LATE').length;
    const stillClockedIn = todayRecords.filter((r) => r.clockIn && !r.clockOut).length;
    const absent = totalEmployees - present - onLeave;

    return {
      totalEmployees,
      presentToday: present,
      absentToday: Math.max(0, absent),
      lateToday: late,
      onLeaveToday: onLeave,
      stillClockedIn,
      attendanceRate: totalEmployees > 0
        ? Math.round((present / totalEmployees) * 100)
        : 0,
    };
  }
}
