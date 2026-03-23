import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { LocationsModule } from './modules/locations/locations.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { QrCodesModule } from './modules/qr-codes/qr-codes.module';
import { LeavesModule } from './modules/leaves/leaves.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { HolidaysModule } from './modules/holidays/holidays.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 3,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 20,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Scheduled tasks (cron)
    ScheduleModule.forRoot(),

    // Database
    DatabaseModule,

    // Feature modules
    AuthModule,
    UsersModule,
    DepartmentsModule,
    LocationsModule,
    AttendanceModule,
    QrCodesModule,
    LeavesModule,
    ShiftsModule,
    AuditLogsModule,
    HolidaysModule,
  ],
  controllers: [HealthController],
  providers: [
    // Enable rate limiting globally
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
