import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { LocationsModule } from '../locations/locations.module';
import { QrCodesModule } from '../qr-codes/qr-codes.module';

@Module({
  imports: [LocationsModule, QrCodesModule],
  providers: [AttendanceService],
  controllers: [AttendanceController],
  exports: [AttendanceService],
})
export class AttendanceModule {}
