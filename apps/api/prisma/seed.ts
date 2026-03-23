import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create organization
  const org = await prisma.organization.upsert({
    where: { code: 'NOVASTREAM' },
    update: {},
    create: {
      name: 'NovaStream Digital',
      code: 'NOVASTREAM',
      domain: 'novastreamdigital.com',
      timezone: 'Africa/Accra',
    },
  });

  console.log('Organization created:', org.name);

  // Create departments
  const departments = await Promise.all([
    prisma.department.upsert({
      where: { code_organizationId: { code: 'ADMIN', organizationId: org.id } },
      update: {},
      create: { name: 'Administration', code: 'ADMIN', organizationId: org.id },
    }),
    prisma.department.upsert({
      where: { code_organizationId: { code: 'IT', organizationId: org.id } },
      update: {},
      create: { name: 'Information Technology', code: 'IT', organizationId: org.id },
    }),
    prisma.department.upsert({
      where: { code_organizationId: { code: 'HR', organizationId: org.id } },
      update: {},
      create: { name: 'Human Resources', code: 'HR', organizationId: org.id },
    }),
    prisma.department.upsert({
      where: { code_organizationId: { code: 'FIN', organizationId: org.id } },
      update: {},
      create: { name: 'Finance', code: 'FIN', organizationId: org.id },
    }),
    prisma.department.upsert({
      where: { code_organizationId: { code: 'OPS', organizationId: org.id } },
      update: {},
      create: { name: 'Operations', code: 'OPS', organizationId: org.id },
    }),
  ]);

  console.log(`${departments.length} departments created`);

  // Create default location
  const location = await prisma.location.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Head Office',
      address: 'Accra, Ghana',
      latitude: 5.6037,
      longitude: -0.1870,
      radiusMeters: 200,
      organizationId: org.id,
      timezone: 'Africa/Accra',
    },
  });

  console.log('Location created:', location.name);

  // Create default shift
  await prisma.shift.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Standard (8AM - 5PM)',
      type: 'MORNING',
      organizationId: org.id,
      startTime: '08:00',
      endTime: '17:00',
      graceMinutesLate: 15,
      graceMinutesEarly: 15,
      breakDurationMinutes: 60,
      isDefault: true,
    },
  });

  console.log('Default shift created');

  // Create super admin user
  const passwordHash = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@novastreamdigital.com' },
    update: {},
    create: {
      employeeId: 'NSD-001',
      email: 'admin@novastreamdigital.com',
      passwordHash,
      firstName: 'System',
      lastName: 'Admin',
      role: UserRole.SUPER_ADMIN,
      departmentId: departments[0].id,
      organizationId: org.id,
    },
  });

  console.log('Super admin created:', admin.email);

  // Create sample employees
  const sampleUsers = [
    { employeeId: 'NSD-002', email: 'hr@novastreamdigital.com', firstName: 'HR', lastName: 'Manager', role: UserRole.HR_MANAGER, deptIdx: 2 },
    { employeeId: 'NSD-003', email: 'john.doe@company.com', firstName: 'John', lastName: 'Doe', role: UserRole.EMPLOYEE, deptIdx: 1 },
    { employeeId: 'NSD-004', email: 'jane.smith@company.com', firstName: 'Jane', lastName: 'Smith', role: UserRole.EMPLOYEE, deptIdx: 3 },
    { employeeId: 'NSD-005', email: 'dept.head@company.com', firstName: 'Department', lastName: 'Head', role: UserRole.DEPARTMENT_HEAD, deptIdx: 1 },
  ];

  for (const u of sampleUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        employeeId: u.employeeId,
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        departmentId: departments[u.deptIdx].id,
        organizationId: org.id,
      },
    });
  }

  console.log(`${sampleUsers.length} sample employees created`);

  // Create holidays (Ghana 2026)
  const holidays = [
    { name: 'New Year', date: new Date('2026-01-01') },
    { name: 'Independence Day', date: new Date('2026-03-06') },
    { name: 'May Day', date: new Date('2026-05-01') },
    { name: 'Republic Day', date: new Date('2026-07-01') },
    { name: 'Founders Day', date: new Date('2026-09-21') },
    { name: 'Christmas', date: new Date('2026-12-25'), isRecurring: true },
    { name: 'Boxing Day', date: new Date('2026-12-26'), isRecurring: true },
  ];

  for (const h of holidays) {
    await prisma.holiday.upsert({
      where: { date_countryCode: { date: h.date, countryCode: 'GH' } },
      update: {},
      create: {
        name: h.name,
        date: h.date,
        countryCode: 'GH',
        isRecurring: h.isRecurring || false,
      },
    });
  }

  console.log(`${holidays.length} holidays created`);
  console.log('\nSeed complete! Login with: admin@novastreamdigital.com / Admin@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
