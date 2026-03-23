import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsEnum,
  IsOptional,
  MinLength,
  IsBoolean,
} from 'class-validator';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@timetrack/shared';

class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsString() employeeId!: string;
  @IsString() departmentId!: string;
  @IsEnum(UserRole) role!: UserRole;
  @IsOptional() @IsString() phoneNumber?: string;
}

class UpdateUserDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsString() phoneNumber?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class AdSyncDto {
  @IsString() server!: string;
  @IsString() port!: string;
  @IsString() baseDN!: string;
  @IsString() bindDN!: string;
  @IsString() bindPassword!: string;
  @IsBoolean() useTLS!: boolean;
  @IsString() userFilter!: string;
  @IsString() defaultRole!: string;
  @IsString() defaultDepartmentId!: string;
}

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Create a new user' })
  async create(@Req() req: any, @Body() body: CreateUserDto) {
    return this.usersService.create({
      ...body,
      organizationId: req.user.organizationId,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List users with filtering and pagination' })
  async findAll(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('perPage') perPage?: number,
    @Query('search') search?: string,
    @Query('departmentId') departmentId?: string,
    @Query('role') role?: string,
    @Query('isActive') isActive?: boolean,
  ) {
    // DEPARTMENT_HEAD can only view users in their own department
    const effectiveDeptId =
      req.user.role === 'DEPARTMENT_HEAD' ? req.user.departmentId : departmentId;

    return this.usersService.findAll({
      organizationId: req.user.organizationId,
      page: Number(page) || 1,
      perPage: Math.min(Number(perPage) || 20, 100),
      search: search || undefined,
      departmentId: effectiveDeptId,
      role,
      isActive: isActive === undefined ? undefined : String(isActive) === 'true',
    });
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@Req() req: any) {
    return this.usersService.findById(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  async findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Update user' })
  async update(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.usersService.update(id, body);
  }

  @Post(':id/deactivate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Deactivate user' })
  async deactivate(@Param('id') id: string) {
    return this.usersService.deactivate(id);
  }

  @Post(':id/activate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Activate user' })
  async activate(@Param('id') id: string) {
    return this.usersService.update(id, { isActive: true });
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Permanently delete user (SUPER_ADMIN only)' })
  async deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }

  @Post('ad-sync')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Sync users from Active Directory / LDAP' })
  async adSync(@Req() req: any, @Body() body: AdSyncDto) {
    return this.usersService.syncFromAD({
      ...body,
      organizationId: req.user.organizationId,
    });
  }
}
