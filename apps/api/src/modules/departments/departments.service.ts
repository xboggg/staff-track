import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class DepartmentsService {
  constructor(private readonly db: DatabaseService) {}

  async create(data: {
    name: string;
    code: string;
    organizationId: string;
    parentId?: string;
    headId?: string;
  }) {
    const existing = await this.db.department.findUnique({
      where: {
        code_organizationId: {
          code: data.code,
          organizationId: data.organizationId,
        },
      },
    });
    if (existing) {
      throw new ConflictException('Department code already exists');
    }

    return this.db.department.create({
      data,
      include: { head: { select: { firstName: true, lastName: true } } },
    });
  }

  async findAll(organizationId: string) {
    return this.db.department.findMany({
      where: { organizationId },
      include: {
        head: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const dept = await this.db.department.findUnique({
      where: { id },
      include: {
        head: { select: { id: true, firstName: true, lastName: true } },
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true, code: true } },
        _count: { select: { users: true } },
      },
    });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  async update(id: string, data: Partial<{ name: string; code: string; parentId: string; headId: string; isActive: boolean }>) {
    await this.findById(id);
    return this.db.department.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.findById(id);
    const userCount = await this.db.user.count({ where: { departmentId: id } });
    if (userCount > 0) {
      throw new ConflictException(`Cannot delete department with ${userCount} assigned users. Reassign them first.`);
    }
    const childCount = await this.db.department.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new ConflictException('Cannot delete department with sub-departments. Remove them first.');
    }
    return this.db.department.delete({ where: { id } });
  }
}
