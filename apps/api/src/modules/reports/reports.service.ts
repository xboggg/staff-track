import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

// Ghana SSNIT contribution rates
const SSNIT_EMPLOYEE_RATE = 0.055; // 5.5%
const SSNIT_EMPLOYER_RATE = 0.13;  // 13%

// Ghana 2024/2025 PAYE tax brackets (monthly)
const PAYE_BRACKETS = [
  { min: 0, max: 490, rate: 0 },
  { min: 490, max: 600, rate: 0.05 },
  { min: 600, max: 730, rate: 0.10 },
  { min: 730, max: 3896.67, rate: 0.175 },
  { min: 3896.67, max: 19896.67, rate: 0.25 },
  { min: 19896.67, max: 49896.67, rate: 0.30 },
  { min: 49896.67, max: Infinity, rate: 0.35 },
];

function calculatePAYE(monthlyTaxableIncome: number): number {
  let tax = 0;
  let remaining = monthlyTaxableIncome;
  for (const bracket of PAYE_BRACKETS) {
    const width = bracket.max - bracket.min;
    const taxable = Math.min(remaining, width);
    if (taxable <= 0) break;
    tax += taxable * bracket.rate;
    remaining -= taxable;
  }
  return Math.round(tax * 100) / 100;
}

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}

  // ========== ATTENDANCE SUMMARY ==========
  async getAttendanceSummary(params: {
    organizationId: string;
    startDate: string;
    endDate: string;
    departmentId?: string;
  }) {
    const { organizationId, startDate, endDate, departmentId } = params;

    const userWhere: any = { organizationId, isActive: true };
    if (departmentId) userWhere.departmentId = departmentId;

    const users = await this.db.user.findMany({
      where: userWhere,
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
        attendanceRecords: {
          where: {
            date: { gte: new Date(startDate), lte: new Date(endDate) },
          },
          select: {
            date: true,
            status: true,
            totalMinutes: true,
            overtimeMinutes: true,
            clockIn: true,
            clockOut: true,
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return users.map((u) => {
      const records = u.attendanceRecords;
      const present = records.filter((r) => ['PRESENT', 'LATE', 'REMOTE'].includes(r.status)).length;
      const late = records.filter((r) => r.status === 'LATE').length;
      const absent = records.filter((r) => r.status === 'ABSENT').length;
      const totalMinutes = records.reduce((s, r) => s + (r.totalMinutes || 0), 0);
      const overtimeMinutes = records.reduce((s, r) => s + (r.overtimeMinutes || 0), 0);

      return {
        employeeId: u.employeeId,
        name: `${u.firstName} ${u.lastName}`,
        department: u.department.name,
        totalDays: records.length,
        present,
        late,
        absent,
        totalHours: Math.round((totalMinutes / 60) * 100) / 100,
        overtimeHours: Math.round((overtimeMinutes / 60) * 100) / 100,
        attendanceRate: records.length > 0 ? Math.round((present / records.length) * 100) : 0,
      };
    });
  }

  // ========== OVERTIME SUMMARY ==========
  async getOvertimeSummary(params: {
    organizationId: string;
    startDate: string;
    endDate: string;
    departmentId?: string;
  }) {
    const { organizationId, startDate, endDate, departmentId } = params;

    const userWhere: any = { organizationId, isActive: true };
    if (departmentId) userWhere.departmentId = departmentId;

    const users = await this.db.user.findMany({
      where: userWhere,
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        basicSalary: true,
        department: { select: { name: true } },
        attendanceRecords: {
          where: {
            date: { gte: new Date(startDate), lte: new Date(endDate) },
            overtimeMinutes: { gt: 0 },
          },
          select: {
            date: true,
            overtimeMinutes: true,
            totalMinutes: true,
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return users
      .filter((u) => u.attendanceRecords.length > 0)
      .map((u) => {
        const totalOTMinutes = u.attendanceRecords.reduce((s, r) => s + (r.overtimeMinutes || 0), 0);
        const otHours = Math.round((totalOTMinutes / 60) * 100) / 100;
        // Ghana Labour Act: overtime at 1.5x hourly rate
        const hourlyRate = u.basicSalary ? (u.basicSalary / (22 * 8)) : 0;
        const otRate = hourlyRate * 1.5;

        return {
          employeeId: u.employeeId,
          name: `${u.firstName} ${u.lastName}`,
          department: u.department.name,
          overtimeDays: u.attendanceRecords.length,
          overtimeHours: otHours,
          hourlyRate: Math.round(hourlyRate * 100) / 100,
          overtimeRate: Math.round(otRate * 100) / 100,
          overtimePay: Math.round(otHours * otRate * 100) / 100,
          basicSalary: u.basicSalary || 0,
        };
      });
  }

  // ========== SSNIT MONTHLY RETURNS ==========
  async getSsnitReturns(params: {
    organizationId: string;
    month: number; // 1-12
    year: number;
  }) {
    const { organizationId, month, year } = params;

    const users = await this.db.user.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        ssnitNumber: true,
        basicSalary: true,
        department: { select: { name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const report = users.map((u, idx) => {
      const salary = u.basicSalary || 0;
      const employeeContribution = Math.round(salary * SSNIT_EMPLOYEE_RATE * 100) / 100;
      const employerContribution = Math.round(salary * SSNIT_EMPLOYER_RATE * 100) / 100;
      const totalContribution = Math.round((employeeContribution + employerContribution) * 100) / 100;

      return {
        sn: idx + 1,
        employeeId: u.employeeId,
        ssnitNumber: u.ssnitNumber || 'N/A',
        name: `${u.lastName}, ${u.firstName}`,
        department: u.department.name,
        basicSalary: salary,
        employeeContribution,
        employerContribution,
        totalContribution,
      };
    });

    const totals = report.reduce(
      (acc, r) => ({
        basicSalary: acc.basicSalary + r.basicSalary,
        employeeContribution: acc.employeeContribution + r.employeeContribution,
        employerContribution: acc.employerContribution + r.employerContribution,
        totalContribution: acc.totalContribution + r.totalContribution,
      }),
      { basicSalary: 0, employeeContribution: 0, employerContribution: 0, totalContribution: 0 },
    );

    return {
      month,
      year,
      period: `${year}-${String(month).padStart(2, '0')}`,
      employeeCount: report.length,
      data: report,
      totals: {
        basicSalary: Math.round(totals.basicSalary * 100) / 100,
        employeeContribution: Math.round(totals.employeeContribution * 100) / 100,
        employerContribution: Math.round(totals.employerContribution * 100) / 100,
        totalContribution: Math.round(totals.totalContribution * 100) / 100,
      },
    };
  }

  // ========== GRA PAYE REPORT ==========
  async getPayeReport(params: {
    organizationId: string;
    month: number;
    year: number;
  }) {
    const { organizationId, month, year } = params;

    const users = await this.db.user.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        tinNumber: true,
        ssnitNumber: true,
        basicSalary: true,
        department: { select: { name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const report = users.map((u, idx) => {
      const grossSalary = u.basicSalary || 0;
      // Deductions: SSNIT employee contribution (5.5%) is tax-exempt
      const ssnitDeduction = Math.round(grossSalary * SSNIT_EMPLOYEE_RATE * 100) / 100;
      const taxableIncome = Math.round((grossSalary - ssnitDeduction) * 100) / 100;
      const payeTax = calculatePAYE(taxableIncome);
      const netSalary = Math.round((grossSalary - ssnitDeduction - payeTax) * 100) / 100;

      return {
        sn: idx + 1,
        employeeId: u.employeeId,
        tinNumber: u.tinNumber || 'N/A',
        name: `${u.lastName}, ${u.firstName}`,
        department: u.department.name,
        grossSalary,
        ssnitDeduction,
        taxableIncome,
        payeTax,
        netSalary,
      };
    });

    const totals = report.reduce(
      (acc, r) => ({
        grossSalary: acc.grossSalary + r.grossSalary,
        ssnitDeduction: acc.ssnitDeduction + r.ssnitDeduction,
        taxableIncome: acc.taxableIncome + r.taxableIncome,
        payeTax: acc.payeTax + r.payeTax,
        netSalary: acc.netSalary + r.netSalary,
      }),
      { grossSalary: 0, ssnitDeduction: 0, taxableIncome: 0, payeTax: 0, netSalary: 0 },
    );

    return {
      month,
      year,
      period: `${year}-${String(month).padStart(2, '0')}`,
      employeeCount: report.length,
      data: report,
      totals: {
        grossSalary: Math.round(totals.grossSalary * 100) / 100,
        ssnitDeduction: Math.round(totals.ssnitDeduction * 100) / 100,
        taxableIncome: Math.round(totals.taxableIncome * 100) / 100,
        payeTax: Math.round(totals.payeTax * 100) / 100,
        netSalary: Math.round(totals.netSalary * 100) / 100,
      },
    };
  }

  // ========== LEAVE UTILIZATION ==========
  async getLeaveUtilization(params: {
    organizationId: string;
    year: number;
    departmentId?: string;
  }) {
    const { organizationId, year, departmentId } = params;

    const userWhere: any = { organizationId, isActive: true };
    if (departmentId) userWhere.departmentId = departmentId;

    const users = await this.db.user.findMany({
      where: userWhere,
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
        leaveRequests: {
          where: {
            status: 'APPROVED',
            startDate: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) },
          },
          select: {
            type: true,
            totalDays: true,
            startDate: true,
            endDate: true,
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return users.map((u) => {
      const leaveByType: Record<string, number> = {};
      for (const lr of u.leaveRequests) {
        leaveByType[lr.type] = (leaveByType[lr.type] || 0) + lr.totalDays;
      }
      const totalDaysTaken = u.leaveRequests.reduce((s, lr) => s + lr.totalDays, 0);

      return {
        employeeId: u.employeeId,
        name: `${u.firstName} ${u.lastName}`,
        department: u.department.name,
        totalDaysTaken,
        annual: leaveByType['ANNUAL'] || 0,
        sick: leaveByType['SICK'] || 0,
        maternity: leaveByType['MATERNITY'] || 0,
        paternity: leaveByType['PATERNITY'] || 0,
        compassionate: leaveByType['COMPASSIONATE'] || 0,
        study: leaveByType['STUDY'] || 0,
        unpaid: leaveByType['UNPAID'] || 0,
        other: leaveByType['OTHER'] || 0,
      };
    });
  }
}
