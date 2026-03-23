import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { LeaveType } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';

const APPROVAL_LEVELS = [
  { level: 1, name: 'Immediate Supervisor', roles: ['SUPERVISOR'] },
  { level: 2, name: 'Head of Department', roles: ['DEPARTMENT_HEAD'] },
  { level: 3, name: 'Head of HR', roles: ['HR_MANAGER'] },
];

@Injectable()
export class LeavesService {
  private readonly logger = new Logger(LeavesService.name);

  constructor(private readonly db: DatabaseService) {}

  async createLeaveRequest(
    userId: string,
    data: { type: string; startDate: string; endDate: string; reason: string },
  ) {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    if (endDate < startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    const diffMs = endDate.getTime() - startDate.getTime();
    const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

    // Create leave request with all 3 approval steps
    const request = await this.db.leaveRequest.create({
      data: {
        userId,
        type: data.type as LeaveType,
        startDate,
        endDate,
        totalDays,
        reason: data.reason,
        status: 'PENDING',
        currentLevel: 1,
        approvals: {
          create: APPROVAL_LEVELS.map((lvl) => ({
            level: lvl.level,
            levelName: lvl.name,
            status: 'PENDING',
          })),
        },
      },
      include: { approvals: { orderBy: { level: 'asc' } } },
    });

    this.logger.log(`Leave request created with 3-level approval: user=${userId} type=${data.type}`);
    return request;
  }

  async getMyRequests(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.db.leaveRequest.findMany({
        where: { userId },
        include: {
          approvals: {
            orderBy: { level: 'asc' },
            include: {
              approver: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.db.leaveRequest.count({ where: { userId } }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getPendingRequests(userRole: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    // SUPER_ADMIN/ADMIN can view all pending leaves (oversight only, cannot approve)
    const isAdminViewer = ['SUPER_ADMIN', 'ADMIN'].includes(userRole);

    // Find which levels this user's role can approve
    const canApproveLevels = APPROVAL_LEVELS
      .filter((lvl) => lvl.roles.includes(userRole))
      .map((lvl) => lvl.level);

    if (!canApproveLevels.length && !isAdminViewer) {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }

    // Admin viewers see ALL pending, approvers see only their level
    const whereClause = isAdminViewer
      ? { status: 'PENDING' as const }
      : { status: 'PENDING' as const, currentLevel: { in: canApproveLevels } };

    const [data, total] = await Promise.all([
      this.db.leaveRequest.findMany({
        where: whereClause,
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
          approvals: {
            orderBy: { level: 'asc' },
            include: {
              approver: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.db.leaveRequest.count({ where: whereClause }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async approveLevel(id: string, approverId: string, approverRole: string, comments?: string) {
    const request = await this.db.leaveRequest.findUnique({
      where: { id },
      include: { approvals: { orderBy: { level: 'asc' } } },
    });

    if (!request) throw new NotFoundException('Leave request not found');
    if (request.status !== 'PENDING') throw new BadRequestException('Leave request is not pending');

    const currentLevel = request.currentLevel;
    const levelConfig = APPROVAL_LEVELS.find((l) => l.level === currentLevel);

    if (!levelConfig || !levelConfig.roles.includes(approverRole)) {
      throw new ForbiddenException(`Your role cannot approve at level ${currentLevel} (${levelConfig?.name || 'unknown'})`);
    }

    // Cannot approve own leave
    if (request.userId === approverId) {
      throw new BadRequestException('You cannot approve your own leave request');
    }

    // Update this level's approval
    await this.db.leaveApproval.update({
      where: { leaveRequestId_level: { leaveRequestId: id, level: currentLevel } },
      data: {
        status: 'APPROVED',
        approverId,
        comments,
        actedAt: new Date(),
      },
    });

    // If this was the last level (3), fully approve the request
    if (currentLevel >= 3) {
      const updated = await this.db.leaveRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          currentLevel: 3,
          approvedBy: approverId,
          approvedAt: new Date(),
        },
        include: { approvals: { orderBy: { level: 'asc' }, include: { approver: { select: { firstName: true, lastName: true } } } } },
      });
      this.logger.log(`Leave FULLY APPROVED (all 3 levels): id=${id}`);
      return updated;
    }

    // Move to next level
    const updated = await this.db.leaveRequest.update({
      where: { id },
      data: { currentLevel: currentLevel + 1 },
      include: { approvals: { orderBy: { level: 'asc' }, include: { approver: { select: { firstName: true, lastName: true } } } } },
    });

    this.logger.log(`Leave approved at level ${currentLevel} (${levelConfig.name}): id=${id} by=${approverId}, next level=${currentLevel + 1}`);
    return updated;
  }

  async rejectLeave(id: string, rejectedById: string, rejectorRole: string, rejectionReason: string) {
    const request = await this.db.leaveRequest.findUnique({
      where: { id },
      include: { approvals: { orderBy: { level: 'asc' } } },
    });

    if (!request) throw new NotFoundException('Leave request not found');
    if (request.status !== 'PENDING') throw new BadRequestException('Leave request is not pending');

    const currentLevel = request.currentLevel;
    const levelConfig = APPROVAL_LEVELS.find((l) => l.level === currentLevel);

    if (!levelConfig || !levelConfig.roles.includes(rejectorRole)) {
      throw new ForbiddenException(`Your role cannot act on level ${currentLevel}`);
    }

    // Mark the current approval step as rejected
    await this.db.leaveApproval.update({
      where: { leaveRequestId_level: { leaveRequestId: id, level: currentLevel } },
      data: {
        status: 'REJECTED',
        approverId: rejectedById,
        comments: rejectionReason,
        actedAt: new Date(),
      },
    });

    // Reject the entire request
    const updated = await this.db.leaveRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectedBy: rejectedById,
        rejectedAt: new Date(),
        rejectionReason,
      },
      include: { approvals: { orderBy: { level: 'asc' }, include: { approver: { select: { firstName: true, lastName: true } } } } },
    });

    this.logger.log(`Leave REJECTED at level ${currentLevel} (${levelConfig.name}): id=${id} by=${rejectedById}`);
    return updated;
  }

  async getBalances(userId: string) {
    const currentYear = new Date().getFullYear();
    return this.db.leaveBalance.findMany({
      where: { userId, year: currentYear },
    });
  }
}
