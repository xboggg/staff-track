import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HolidaysService } from './holidays.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@timetrack/shared';

@ApiTags('holidays')
@Controller('holidays')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  @Get()
  @ApiOperation({ summary: 'List all holidays' })
  async findAll(@Query('countryCode') countryCode?: string) {
    return this.holidaysService.findAll(countryCode);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create holiday' })
  async create(@Body() body: { name: string; date: string; isRecurring?: boolean; countryCode?: string }) {
    return this.holidaysService.create(body);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update holiday' })
  async update(@Param('id') id: string, @Body() body: any) {
    return this.holidaysService.update(id, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete holiday' })
  async delete(@Param('id') id: string) {
    return this.holidaysService.delete(id);
  }

  @Post('seed/:year')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Seed Ghana public holidays for a year' })
  async seed(@Param('year') year: string) {
    return this.holidaysService.seedGhanaHolidays(parseInt(year));
  }
}
