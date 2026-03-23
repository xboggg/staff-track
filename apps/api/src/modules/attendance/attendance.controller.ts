import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@timetrack/shared';

class ClockInDto {
  @IsString() locationId!: string;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsString() qrToken?: string;
}

class ClockOutDto {
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsString() notes?: string;
}

class AdminClockDto {
  @IsString() userId!: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('attendance')
@Controller('attendance')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  private getClientIp(req: any): string {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers['x-real-ip']
      || req.connection?.remoteAddress
      || req.ip
      || 'unknown';
  }

  @Post('clock-in')
  @ApiOperation({ summary: 'Clock in for today' })
  async clockIn(@Req() req: any, @Body() body: ClockInDto) {
    return this.attendanceService.clockIn({
      userId: req.user.id,
      locationId: body.locationId,
      method: body.method || 'GPS',
      latitude: body.latitude,
      longitude: body.longitude,
      qrToken: body.qrToken,
      ipAddress: this.getClientIp(req),
    });
  }

  @Post('clock-out')
  @ApiOperation({ summary: 'Clock out for today' })
  async clockOut(@Req() req: any, @Body() body: ClockOutDto) {
    return this.attendanceService.clockOut({
      userId: req.user.id,
      method: body.method || 'GPS',
      latitude: body.latitude,
      longitude: body.longitude,
      notes: body.notes,
      ipAddress: this.getClientIp(req),
    });
  }

  @Get('today')
  @ApiOperation({ summary: 'Get today\'s attendance status' })
  async getTodayStatus(@Req() req: any) {
    return this.attendanceService.getTodayStatus(req.user.id);
  }

  @Get('my-records')
  @ApiOperation({ summary: 'Get my attendance records' })
  async getMyRecords(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.attendanceService.getMyAttendance(req.user.id, startDate, endDate);
  }

  @Get('all')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPARTMENT_HEAD)
  @ApiOperation({ summary: 'Get all staff attendance records (admin)' })
  async getAllRecords(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('page') page?: number,
    @Query('perPage') perPage?: number,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
    @Query('search') search?: string,
  ) {
    return this.attendanceService.getAllAttendance({
      organizationId: req.user.organizationId,
      startDate,
      endDate,
      page: Number(page) || 1,
      perPage: Math.min(Number(perPage) || 20, 100),
      status,
      departmentId,
      search,
    });
  }

  @Get('dashboard')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPARTMENT_HEAD)
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getDashboard(@Req() req: any) {
    return this.attendanceService.getDashboardStats(req.user.organizationId);
  }

  @Get('missed-clockouts')
  @ApiOperation({ summary: 'Get my missed clock-out stats and penalties' })
  async getMissedClockOuts(@Req() req: any) {
    return this.attendanceService.getMissedClockOutStats(req.user.id);
  }

  @Get('missed-clockout-report')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Get missed clock-out report for all staff (admin)' })
  async getMissedClockOutReport(@Req() req: any) {
    return this.attendanceService.getMissedClockOutReport(req.user.organizationId);
  }

  @Post('trigger-auto-clockout')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Manually trigger auto clock-out (admin)' })
  async triggerAutoClockOut() {
    return this.attendanceService.triggerAutoClockOut();
  }

  @Post('admin-clock-in')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Admin clock in an employee manually' })
  async adminClockIn(@Req() req: any, @Body() body: AdminClockDto) {
    return this.attendanceService.adminClockIn({
      adminUserId: req.user.id,
      targetUserId: body.userId,
      locationId: body.locationId || '',
      notes: body.notes,
      ipAddress: this.getClientIp(req),
    });
  }

  @Post('admin-clock-out')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Admin clock out an employee manually' })
  async adminClockOut(@Req() req: any, @Body() body: AdminClockDto) {
    return this.attendanceService.adminClockOut({
      adminUserId: req.user.id,
      targetUserId: body.userId,
      notes: body.notes,
      ipAddress: this.getClientIp(req),
    });
  }
}
