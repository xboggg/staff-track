import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@timetrack/shared';

function toCsv(headers: string[], rows: any[][]): string {
  const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }
  return lines.join('\r\n');
}

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPARTMENT_HEAD, UserRole.SUPERVISOR)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ========== ATTENDANCE SUMMARY (JSON) ==========
  @Get('attendance-summary')
  @ApiOperation({ summary: 'Attendance summary report for all employees' })
  async getAttendanceSummary(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.reportsService.getAttendanceSummary({
      organizationId: req.user.organizationId,
      startDate,
      endDate,
      departmentId,
    });
  }

  // ========== ATTENDANCE SUMMARY (CSV) ==========
  @Get('attendance-summary/csv')
  @ApiOperation({ summary: 'Download attendance summary as CSV' })
  async downloadAttendanceCsv(
    @Req() req: any,
    @Res() res: Response,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const data = await this.reportsService.getAttendanceSummary({
      organizationId: req.user.organizationId,
      startDate,
      endDate,
      departmentId,
    });

    const csv = toCsv(
      ['Employee ID', 'Name', 'Department', 'Total Days', 'Present', 'Late', 'Absent', 'Total Hours', 'Overtime Hours', 'Attendance %'],
      data.map((r) => [r.employeeId, r.name, r.department, r.totalDays, r.present, r.late, r.absent, r.totalHours, r.overtimeHours, `${r.attendanceRate}%`]),
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=attendance-summary-${startDate}-to-${endDate}.csv`);
    res.send(csv);
  }

  // ========== OVERTIME SUMMARY (JSON) ==========
  @Get('overtime-summary')
  @ApiOperation({ summary: 'Overtime summary report' })
  async getOvertimeSummary(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.reportsService.getOvertimeSummary({
      organizationId: req.user.organizationId,
      startDate,
      endDate,
      departmentId,
    });
  }

  // ========== OVERTIME SUMMARY (CSV) ==========
  @Get('overtime-summary/csv')
  @ApiOperation({ summary: 'Download overtime summary as CSV' })
  async downloadOvertimeCsv(
    @Req() req: any,
    @Res() res: Response,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const data = await this.reportsService.getOvertimeSummary({
      organizationId: req.user.organizationId,
      startDate,
      endDate,
      departmentId,
    });

    const csv = toCsv(
      ['Employee ID', 'Name', 'Department', 'OT Days', 'OT Hours', 'Hourly Rate (GHS)', 'OT Rate (GHS)', 'OT Pay (GHS)', 'Basic Salary (GHS)'],
      data.map((r) => [r.employeeId, r.name, r.department, r.overtimeDays, r.overtimeHours, r.hourlyRate, r.overtimeRate, r.overtimePay, r.basicSalary]),
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=overtime-summary-${startDate}-to-${endDate}.csv`);
    res.send(csv);
  }

  // ========== SSNIT MONTHLY RETURNS (JSON) ==========
  @Get('ssnit-returns')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'SSNIT monthly contribution returns (5.5% employee + 13% employer)' })
  async getSsnitReturns(
    @Req() req: any,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.reportsService.getSsnitReturns({
      organizationId: req.user.organizationId,
      month: Number(month) || new Date().getMonth() + 1,
      year: Number(year) || new Date().getFullYear(),
    });
  }

  // ========== SSNIT RETURNS (CSV) ==========
  @Get('ssnit-returns/csv')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Download SSNIT monthly returns as CSV' })
  async downloadSsnitCsv(
    @Req() req: any,
    @Res() res: Response,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const result = await this.reportsService.getSsnitReturns({
      organizationId: req.user.organizationId,
      month: Number(month) || new Date().getMonth() + 1,
      year: Number(year) || new Date().getFullYear(),
    });

    const rows = result.data.map((r) => [r.sn, r.employeeId, r.ssnitNumber, r.name, r.department, r.basicSalary, r.employeeContribution, r.employerContribution, r.totalContribution]);
    rows.push(['', '', '', 'TOTALS', '', result.totals.basicSalary, result.totals.employeeContribution, result.totals.employerContribution, result.totals.totalContribution]);

    const csv = toCsv(
      ['S/N', 'Employee ID', 'SSNIT Number', 'Name', 'Department', 'Basic Salary (GHS)', 'Employee 5.5% (GHS)', 'Employer 13% (GHS)', 'Total (GHS)'],
      rows,
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=ssnit-returns-${result.period}.csv`);
    res.send(csv);
  }

  // ========== GRA PAYE REPORT (JSON) ==========
  @Get('paye-report')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'GRA PAYE tax deduction report' })
  async getPayeReport(
    @Req() req: any,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.reportsService.getPayeReport({
      organizationId: req.user.organizationId,
      month: Number(month) || new Date().getMonth() + 1,
      year: Number(year) || new Date().getFullYear(),
    });
  }

  // ========== PAYE REPORT (CSV) ==========
  @Get('paye-report/csv')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Download GRA PAYE report as CSV' })
  async downloadPayeCsv(
    @Req() req: any,
    @Res() res: Response,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const result = await this.reportsService.getPayeReport({
      organizationId: req.user.organizationId,
      month: Number(month) || new Date().getMonth() + 1,
      year: Number(year) || new Date().getFullYear(),
    });

    const rows = result.data.map((r) => [r.sn, r.employeeId, r.tinNumber, r.name, r.department, r.grossSalary, r.ssnitDeduction, r.taxableIncome, r.payeTax, r.netSalary]);
    rows.push(['', '', '', 'TOTALS', '', result.totals.grossSalary, result.totals.ssnitDeduction, result.totals.taxableIncome, result.totals.payeTax, result.totals.netSalary]);

    const csv = toCsv(
      ['S/N', 'Employee ID', 'TIN', 'Name', 'Department', 'Gross Salary (GHS)', 'SSNIT 5.5% (GHS)', 'Taxable Income (GHS)', 'PAYE Tax (GHS)', 'Net Salary (GHS)'],
      rows,
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=paye-report-${result.period}.csv`);
    res.send(csv);
  }

  // ========== LEAVE UTILIZATION (JSON) ==========
  @Get('leave-utilization')
  @ApiOperation({ summary: 'Leave utilization report by employee' })
  async getLeaveUtilization(
    @Req() req: any,
    @Query('year') year: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.reportsService.getLeaveUtilization({
      organizationId: req.user.organizationId,
      year: Number(year) || new Date().getFullYear(),
      departmentId,
    });
  }

  // ========== LEAVE UTILIZATION (CSV) ==========
  @Get('leave-utilization/csv')
  @ApiOperation({ summary: 'Download leave utilization as CSV' })
  async downloadLeaveUtilizationCsv(
    @Req() req: any,
    @Res() res: Response,
    @Query('year') year: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const data = await this.reportsService.getLeaveUtilization({
      organizationId: req.user.organizationId,
      year: Number(year) || new Date().getFullYear(),
      departmentId,
    });

    const csv = toCsv(
      ['Employee ID', 'Name', 'Department', 'Total Days', 'Annual', 'Sick', 'Maternity', 'Paternity', 'Compassionate', 'Study', 'Unpaid', 'Other'],
      data.map((r) => [r.employeeId, r.name, r.department, r.totalDaysTaken, r.annual, r.sick, r.maternity, r.paternity, r.compassionate, r.study, r.unpaid, r.other]),
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=leave-utilization-${year || new Date().getFullYear()}.csv`);
    res.send(csv);
  }
}
