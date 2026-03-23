import { Injectable, NotFoundException } from '@nestjs/common';
import { ShiftType } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class ShiftsService {
  constructor(private readonly db: DatabaseService) {}

  async create(data: {
    name: string;
    type: string;
    startTime: string;
    endTime: string;
    graceMinutesLate?: number;
    graceMinutesEarly?: number;
    breakDurationMinutes?: number;
    isDefault?: boolean;
    organizationId: string;
  }) {
    return this.db.shift.create({
      data: {
        ...data,
        type: data.type as ShiftType,
      },
    });
  }

  async findAll(organizationId: string) {
    return this.db.shift.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const shift = await this.db.shift.findUnique({ where: { id } });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      type: string;
      startTime: string;
      endTime: string;
      graceMinutesLate: number;
      graceMinutesEarly: number;
      breakDurationMinutes: number;
      isDefault: boolean;
      isActive: boolean;
    }>,
  ) {
    await this.findById(id);
    const { type, ...rest } = data;
    return this.db.shift.update({
      where: { id },
      data: {
        ...rest,
        ...(type && { type: type as ShiftType }),
      },
    });
  }

  async remove(id: string) {
    await this.findById(id);
    return this.db.shift.delete({ where: { id } });
  }

  // ========== SHIFT ASSIGNMENTS ==========

  async assignShift(data: { userId: string; shiftId: string; startDate: string; endDate?: string }) {
    await this.db.shiftAssignment.updateMany({
      where: { userId: data.userId, isActive: true },
      data: { isActive: false },
    });

    return this.db.shiftAssignment.create({
      data: {
        userId: data.userId,
        shiftId: data.shiftId,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        isActive: true,
      },
      include: {
        shift: { select: { name: true, type: true, startTime: true, endTime: true } },
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });
  }

  async getAssignments(organizationId: string) {
    return this.db.shiftAssignment.findMany({
      where: { isActive: true, user: { organizationId } },
      include: {
        shift: { select: { id: true, name: true, type: true, startTime: true, endTime: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true, employeeId: true, department: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeAssignment(id: string) {
    return this.db.shiftAssignment.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
