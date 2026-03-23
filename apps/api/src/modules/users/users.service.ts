import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { BCRYPT_ROUNDS } from '@timetrack/shared';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly db: DatabaseService) {}

  async create(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    employeeId: string;
    departmentId: string;
    organizationId: string;
    role?: string;
    phoneNumber?: string;
  }) {
    const existing = await this.db.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    const user = await this.db.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        employeeId: data.employeeId,
        departmentId: data.departmentId,
        organizationId: data.organizationId,
        role: (data.role as any) || 'EMPLOYEE',
        phoneNumber: data.phoneNumber,
      },
      select: {
        id: true,
        employeeId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        departmentId: true,
        isActive: true,
        createdAt: true,
      },
    });

    this.logger.log(`User created: ${user.email}`);
    return user;
  }

  async findAll(params: {
    organizationId: string;
    page?: number;
    perPage?: number;
    search?: string;
    departmentId?: string;
    role?: string;
    isActive?: boolean;
  }) {
    const { organizationId, search, departmentId, role, isActive } = params;
    const page = Number(params.page) || 1;
    const perPage = Number(params.perPage) || 20;

    const where: Prisma.UserWhereInput = {
      organizationId,
      ...(departmentId && { departmentId }),
      ...(role && { role: role as any }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { employeeId: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      this.db.user.findMany({
        where,
        select: {
          id: true,
          employeeId: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          departmentId: true,
          department: { select: { name: true } },
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { lastName: 'asc' },
      }),
      this.db.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
      },
    };
  }

  async findById(id: string) {
    const user = await this.db.user.findUnique({
      where: { id },
      select: {
        id: true,
        employeeId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        departmentId: true,
        department: { select: { id: true, name: true, code: true } },
        organizationId: true,
        phoneNumber: true,
        avatarUrl: true,
        isActive: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(id: string, data: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    employeeId: string;
    phoneNumber: string;
    departmentId: string;
    role: string;
    isActive: boolean;
  }>) {
    const existing = await this.findById(id);

    // Check email uniqueness if changing
    if (data.email && data.email !== existing.email) {
      const emailTaken = await this.db.user.findUnique({ where: { email: data.email } });
      if (emailTaken) throw new ConflictException('Email already in use');
    }

    // Check employeeId uniqueness if changing
    if (data.employeeId && data.employeeId !== existing.employeeId) {
      const empIdTaken = await this.db.user.findFirst({ where: { employeeId: data.employeeId, organizationId: existing.organizationId } });
      if (empIdTaken) throw new ConflictException('Employee ID already in use');
    }

    return this.db.user.update({
      where: { id },
      data: data as any,
      select: {
        id: true,
        employeeId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        departmentId: true,
        department: { select: { name: true } },
        isActive: true,
        updatedAt: true,
      },
    });
  }

  async deactivate(id: string) {
    return this.update(id, { isActive: false });
  }

  async deleteUser(id: string) {
    const user = await this.findById(id);

    // Delete related records in order
    await this.db.$transaction([
      this.db.refreshToken.deleteMany({ where: { userId: id } }),
      this.db.notification.deleteMany({ where: { userId: id } }),
      this.db.auditLog.deleteMany({ where: { userId: id } }),
      this.db.device.deleteMany({ where: { userId: id } }),
      this.db.shiftAssignment.deleteMany({ where: { userId: id } }),
      this.db.leaveApproval.deleteMany({ where: { approverId: id } }),
      this.db.overtimeRecord.deleteMany({ where: { OR: [{ userId: id }, { approvedBy: id }] } }),
      this.db.attendanceRecord.deleteMany({ where: { userId: id } }),
    ]);

    // Handle leave requests (delete approvals first, then requests)
    const leaveIds = await this.db.leaveRequest.findMany({ where: { userId: id }, select: { id: true } });
    if (leaveIds.length) {
      await this.db.leaveApproval.deleteMany({ where: { leaveRequestId: { in: leaveIds.map(l => l.id) } } });
      await this.db.leaveRequest.deleteMany({ where: { userId: id } });
    }

    // Clear department head references
    await this.db.department.updateMany({ where: { headId: id }, data: { headId: null } });

    // Delete the user
    await this.db.user.delete({ where: { id } });

    this.logger.log(`User permanently deleted: ${user.email}`);
    return { message: `User ${user.email} permanently deleted` };
  }

  async syncFromAD(config: {
    server: string;
    port: string;
    baseDN: string;
    bindDN: string;
    bindPassword: string;
    useTLS: boolean;
    userFilter: string;
    defaultRole: string;
    defaultDepartmentId: string;
    organizationId: string;
  }) {
    // Dynamic import of ldapjs (optional dependency)
    let ldap: any;
    try {
      ldap = require('ldapjs');
    } catch {
      throw new BadRequestException(
        'LDAP client not installed. Run: pnpm add ldapjs @types/ldapjs --filter api',
      );
    }

    const results = { synced: 0, updated: 0, failed: 0, errors: [] as string[] };

    return new Promise<typeof results>((resolve) => {
      const url = `${config.useTLS ? 'ldaps' : 'ldap'}://${config.server}:${config.port || (config.useTLS ? '636' : '389')}`;
      const client = ldap.createClient({ url, tlsOptions: { rejectUnauthorized: false } });

      client.on('error', (err: any) => {
        results.errors.push(`Connection error: ${err.message}`);
        resolve(results);
      });

      client.bind(config.bindDN, config.bindPassword, (bindErr: any) => {
        if (bindErr) {
          results.errors.push(`Bind failed: ${bindErr.message}`);
          client.unbind();
          resolve(results);
          return;
        }

        const searchOpts = {
          filter: config.userFilter || '(&(objectClass=user)(objectCategory=person))',
          scope: 'sub',
          attributes: ['sAMAccountName', 'givenName', 'sn', 'mail', 'employeeID', 'telephoneNumber', 'department', 'title', 'userAccountControl'],
        };

        const entries: any[] = [];

        client.search(config.baseDN, searchOpts, (searchErr: any, res: any) => {
          if (searchErr) {
            results.errors.push(`Search failed: ${searchErr.message}`);
            client.unbind();
            resolve(results);
            return;
          }

          res.on('searchEntry', (entry: any) => {
            const attrs: Record<string, string> = {};
            (entry.ppiAttributes || entry.attributes || []).forEach((a: any) => {
              attrs[a.type] = Array.isArray(a.values) ? a.values[0] : (a._vals?.[0]?.toString() || '');
            });
            // Also handle the object form
            const obj = entry.object || entry.pojo?.attributes?.reduce((acc: any, a: any) => {
              acc[a.type] = a.values?.[0] || '';
              return acc;
            }, {}) || attrs;
            entries.push(obj);
          });

          res.on('end', async () => {
            this.logger.log(`AD sync: found ${entries.length} entries from ${config.server}`);

            for (const entry of entries) {
              const email = entry.mail || entry.userPrincipalName;
              const firstName = entry.givenName || entry.cn?.split(' ')[0] || '';
              const lastName = entry.sn || entry.cn?.split(' ').slice(1).join(' ') || '';
              const employeeId = entry.employeeID || entry.sAMAccountName || '';

              if (!email || !firstName) {
                results.failed++;
                results.errors.push(`Skipped: missing email or name (${entry.sAMAccountName || 'unknown'})`);
                continue;
              }

              try {
                const existing = await this.db.user.findUnique({ where: { email } });

                if (existing) {
                  await this.db.user.update({
                    where: { id: existing.id },
                    data: {
                      firstName,
                      lastName,
                      phoneNumber: entry.telephoneNumber || existing.phoneNumber,
                      ...(config.defaultDepartmentId && !existing.departmentId && { departmentId: config.defaultDepartmentId }),
                    },
                  });
                  results.updated++;
                } else {
                  const passwordHash = await (await import('bcrypt')).hash('Welcome@123', 10);
                  await this.db.user.create({
                    data: {
                      email,
                      passwordHash,
                      firstName,
                      lastName,
                      employeeId: employeeId || `AD-${Date.now()}-${results.synced}`,
                      organizationId: config.organizationId,
                      role: (config.defaultRole as any) || 'EMPLOYEE',
                      departmentId: config.defaultDepartmentId,
                      mustChangePassword: true,
                      ...(entry.telephoneNumber && { phoneNumber: entry.telephoneNumber }),
                    },
                  });
                  results.synced++;
                }
              } catch (e: any) {
                results.failed++;
                results.errors.push(`${email}: ${e.message}`);
              }
            }

            client.unbind();
            this.logger.log(`AD sync complete: synced=${results.synced} updated=${results.updated} failed=${results.failed}`);
            resolve(results);
          });

          res.on('error', (err: any) => {
            results.errors.push(`Search error: ${err.message}`);
            client.unbind();
            resolve(results);
          });
        });
      });
    });
  }
}
