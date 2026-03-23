import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { LeaveType } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';

export interface ApprovalLevel {
  level: number;
  name: string;
  roles: string[];
}

const DEFAULT_APPROVAL_LEVELS: ApprovalLevel[] = [
  { level: 1, name: 'Immediate Supervisor', roles: ['SUPERVISOR'] },
  { level: 2, name: 'Head of Department', roles: ['DEPARTMENT_HEAD'] },
  { level: 3, name: 'Head of HR', roles: ['HR_MANAGER'] },
];

const AVAILABLE_ROLES = [
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'DEPARTMENT_HEAD', label: 'Department Head' },
  { value: 'HR_MANAGER', label: 'HR Manager' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
];

@Injectable()
export class LeavesService {
  private readonly logger = new Logger(LeavesService.name);

  constructor(private readonly db: DatabaseService) {}

  // ========== APPROVAL HIERARCHY CONFIG ==========

  async getApprovalHierarchy(organizationId: string): Promise<ApprovalLevel[]> {
    const org = await this.db.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const settings = (org?.settings as any) || {};
    return settings.leaveApprovalHierarchy || DEFAULT_APPROVAL_LEVELS;
  }

  async updateApprovalHierarchy(organizationId: string, hierarchy: ApprovalLevel[]) {
    // Validate: max 3 levels, levels must be sequential starting at 1
    if (hierarchy.length < 1 || hierarchy.length > 3) {
      throw new BadRequestException('Approval hierarchy must have 1 to 3 levels');
    }

    for (let i = 0; i < hierarchy.length; i++) {
      const lvl = hierarchy[i];
      if (lvl.level !== i + 1) {
        throw new BadRequestException(`Level ${i + 1} has incorrect level number ${lvl.level}`);
      }
      if (!lvl.name || lvl.name.trim().length === 0) {
        throw new BadRequestException(`Level ${lvl.level} must have a name`);
      }
      if (!lvl.roles || lvl.roles.length === 0) {
        throw new BadRequestException(`Level ${lvl.level} must have at least one role`);
      }
      const validRoles = AVAILABLE_ROLES.map((r) => r.value);
      for (const role of lvl.roles) {
        if (!validRoles.includes(role)) {
          throw new BadRequestException(`Invalid role "${role}" at level ${lvl.level}`);
        }
      }
    }

    // Get current settings and merge
    const org = await this.db.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const currentSettings = (org?.settings as any) || {};

    await this.db.organization.update({
      where: { id: organizationId },
      data: {
        settings: {
          ...currentSettings,
          leaveApprovalHierarchy: hierarchy,
        },
      },
    });

    this.logger.log(`Approval hierarchy updated for org=${organizationId}: ${hierarchy.length} levels`);
    return { hierarchy, availableRoles: AVAILABLE_ROLES };
  }

  getAvailableRoles() {
    return AVAILABLE_ROLES;
  }

  // ========== LEAVE REQUESTS ==========

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

    // Load org-specific approval hierarchy
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const hierarchy = await this.getApprovalHierarchy(user.organizationId);

    // Create leave request with org-configured approval steps
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
          create: hierarchy.map((lvl) => ({
            level: lvl.level,
            levelName: lvl.name,
            status: 'PENDING',
          })),
        },
      },
      include: { approvals: { orderBy: { level: 'asc' } } },
    });

    this.logger.log(`Leave request created with ${hierarchy.length}-level approval: user=${userId} type=${data.type}`);
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

  async getPendingRequests(organizationId: string, userRole: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    // Load org-specific approval hierarchy
    const hierarchy = await this.getApprovalHierarchy(organizationId);

    // SUPER_ADMIN/ADMIN can view all pending leaves (oversight only, cannot approve)
    const isAdminViewer = ['SUPER_ADMIN', 'ADMIN'].includes(userRole);

    // Find which levels this user's role can approve in this org's hierarchy
    const canApproveLevels = hierarchy
      .filter((lvl) => lvl.roles.includes(userRole))
      .map((lvl) => lvl.level);

    if (!canApproveLevels.length && !isAdminViewer) {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }

    // Always filter by organization to prevent cross-tenant leakage
    const whereClause = isAdminViewer
      ? { status: 'PENDING' as const, user: { organizationId } }
      : { status: 'PENDING' as const, currentLevel: { in: canApproveLevels }, user: { organizationId } };

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
      include: {
        approvals: { orderBy: { level: 'asc' } },
        user: { select: { organizationId: true } },
      },
    });

    if (!request) throw new NotFoundException('Leave request not found');
    if (request.status !== 'PENDING') throw new BadRequestException('Leave request is not pending');

    // Load org-specific hierarchy
    const hierarchy = await this.getApprovalHierarchy(request.user.organizationId);
    const maxLevel = hierarchy.length;

    const currentLevel = request.currentLevel;
    const levelConfig = hierarchy.find((l) => l.level === currentLevel);

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

    // If this was the last level, fully approve the request
    if (currentLevel >= maxLevel) {
      const updated = await this.db.leaveRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          currentLevel: maxLevel,
          approvedBy: approverId,
          approvedAt: new Date(),
        },
        include: { approvals: { orderBy: { level: 'asc' }, include: { approver: { select: { firstName: true, lastName: true } } } } },
      });
      this.logger.log(`Leave FULLY APPROVED (all ${maxLevel} levels): id=${id}`);
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
      include: {
        approvals: { orderBy: { level: 'asc' } },
        user: { select: { organizationId: true } },
      },
    });

    if (!request) throw new NotFoundException('Leave request not found');
    if (request.status !== 'PENDING') throw new BadRequestException('Leave request is not pending');

    // Load org-specific hierarchy
    const hierarchy = await this.getApprovalHierarchy(request.user.organizationId);

    const currentLevel = request.currentLevel;
    const levelConfig = hierarchy.find((l) => l.level === currentLevel);

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
