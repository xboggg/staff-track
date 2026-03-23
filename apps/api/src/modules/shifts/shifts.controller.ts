import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
} from 'class-validator';
import { ShiftsService } from './shifts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@timetrack/shared';

enum ShiftTypeDto {
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
  NIGHT = 'NIGHT',
  FLEXIBLE = 'FLEXIBLE',
  SPLIT = 'SPLIT',
  CUSTOM = 'CUSTOM',
}

class CreateShiftDto {
  @IsString()
  name!: string;

  @IsEnum(ShiftTypeDto)
  type!: ShiftTypeDto;

  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  graceMinutesLate?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  graceMinutesEarly?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  breakDurationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

class UpdateShiftDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(ShiftTypeDto)
  type?: ShiftTypeDto;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  graceMinutesLate?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  graceMinutesEarly?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  breakDurationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@ApiTags('shifts')
@Controller('shifts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get()
  @ApiOperation({ summary: 'List all shifts' })
  async findAll(@Req() req: any) {
    return this.shiftsService.findAll(req.user.organizationId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Create shift' })
  async create(@Req() req: any, @Body() body: CreateShiftDto) {
    return this.shiftsService.create({
      ...body,
      organizationId: req.user.organizationId,
    });
  }

  // ========== SHIFT ASSIGNMENTS (must be above :id routes) ==========

  @Post('assignments')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Assign shift to user' })
  async assignShift(@Body() body: { userId: string; shiftId: string; startDate: string; endDate?: string }) {
    return this.shiftsService.assignShift(body);
  }

  @Get('assignments/all')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.DEPARTMENT_HEAD)
  @ApiOperation({ summary: 'Get all active shift assignments' })
  async getAssignments(@Req() req: any) {
    return this.shiftsService.getAssignments(req.user.organizationId);
  }

  @Delete('assignments/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Remove shift assignment' })
  async removeAssignment(@Param('id') id: string) {
    return this.shiftsService.removeAssignment(id);
  }

  // ========== PARAMETERIZED ROUTES ==========

  @Get(':id')
  @ApiOperation({ summary: 'Get shift by ID' })
  async findById(@Param('id') id: string) {
    return this.shiftsService.findById(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Update shift' })
  async update(@Param('id') id: string, @Body() body: UpdateShiftDto) {
    return this.shiftsService.update(id, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete shift' })
  async remove(@Param('id') id: string) {
    return this.shiftsService.remove(id);
  }
}
