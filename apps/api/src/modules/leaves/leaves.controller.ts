import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsEnum, IsDateString, IsOptional } from 'class-validator';
import { LeavesService } from './leaves.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@timetrack/shared';

enum LeaveTypeDto {
  ANNUAL = 'ANNUAL',
  SICK = 'SICK',
  MATERNITY = 'MATERNITY',
  PATERNITY = 'PATERNITY',
  COMPASSIONATE = 'COMPASSIONATE',
  STUDY = 'STUDY',
  UNPAID = 'UNPAID',
}

class CreateLeaveRequestDto {
  @IsEnum(LeaveTypeDto)
  type!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsString()
  @IsOptional()
  reason!: string;
}

class ApproveLeaveDto {
  @IsString()
  @IsOptional()
  comments?: string;
}

class RejectLeaveDto {
  @IsString()
  rejectionReason!: string;
}

@ApiTags('leaves')
@Controller('leaves')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a leave request (creates 3-level approval chain)' })
  async createLeaveRequest(@Req() req: any, @Body() dto: CreateLeaveRequestDto) {
    return this.leavesService.createLeaveRequest(req.user.id, dto);
  }

  @Get('my-requests')
  @ApiOperation({ summary: 'Get current user\'s leave requests with approval chain' })
  async getMyRequests(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.leavesService.getMyRequests(req.user.id, Number(page) || 1, Number(limit) || 10);
  }

  @Get('pending')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPARTMENT_HEAD, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get leave requests pending your approval level' })
  async getPendingRequests(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.leavesService.getPendingRequests(req.user.organizationId, req.user.role, Number(page) || 1, Number(limit) || 10);
  }

  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.DEPARTMENT_HEAD, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Approve leave at your approval level (Supervisor → Dept Head → HR only)' })
  async approveLeave(@Req() req: any, @Param('id') id: string, @Body() dto: ApproveLeaveDto) {
    return this.leavesService.approveLevel(id, req.user.id, req.user.role, dto.comments);
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(UserRole.HR_MANAGER, UserRole.DEPARTMENT_HEAD, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Reject leave request at current level (Supervisor → Dept Head → HR only)' })
  async rejectLeave(@Req() req: any, @Param('id') id: string, @Body() dto: RejectLeaveDto) {
    return this.leavesService.rejectLeave(id, req.user.id, req.user.role, dto.rejectionReason);
  }

  @Get('balances')
  @ApiOperation({ summary: 'Get current user\'s leave balances' })
  async getBalances(@Req() req: any) {
    return this.leavesService.getBalances(req.user.id);
  }
}
