import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class AuditLogsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(params: {
    organizationId: string;
    page?: number;
    perPage?: number;
    action?: string;
    entityType?: string;
    userId?: string;
  }) {
    const page = Number(params.page) || 1;
    const perPage = Math.min(Number(params.perPage) || 50, 100);
    const { organizationId, action, entityType, userId } = params;

    const where: any = {
      user: { organizationId },
    };
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (userId) where.userId = userId;

    const [data, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { timestamp: 'desc' },
      }),
      this.db.auditLog.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      perPage,
    };
  }
}
