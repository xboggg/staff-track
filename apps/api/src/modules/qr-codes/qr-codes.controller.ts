import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { QrCodesService } from './qr-codes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@timetrack/shared';

@ApiTags('qr-codes')
@Controller('qr-codes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class QrCodesController {
  constructor(private readonly qrCodesService: QrCodesService) {}

  @Post('generate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR_MANAGER)
  @ApiOperation({ summary: 'Generate a rotating QR code for a location' })
  async generate(@Body() body: { locationId: string }) {
    return this.qrCodesService.generateQrCode(body.locationId);
  }
}
