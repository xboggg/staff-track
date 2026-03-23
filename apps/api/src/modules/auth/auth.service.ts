import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../../database/database.service';
import {
  BCRYPT_ROUNDS,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MINUTES,
  REFRESH_TOKEN_EXPIRY_DAYS,
} from '@timetrack/shared';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.db.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `Account locked. Try again in ${minutesLeft} minutes`,
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      await this.handleFailedLogin(user.id, user.failedAttempts);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed attempts on successful login
    await this.db.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    // Check 2FA
    if (user.twoFactorEnabled) {
      return {
        requiresTwoFactor: true,
        tempToken: this.jwtService.sign(
          { sub: user.id, type: '2fa' },
          { expiresIn: '5m' },
        ),
      };
    }

    // Check if user must change password (e.g. AD-imported with default password)
    if (user.mustChangePassword) {
      const tempToken = this.jwtService.sign(
        { sub: user.id, type: 'password-change' },
        { expiresIn: '10m' },
      );
      return {
        mustChangePassword: true,
        tempToken,
        requiresTwoFactor: false,
      };
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.role);

    // Audit log
    await this.db.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        entityType: 'user',
        entityId: user.id,
      },
    });

    return {
      user: {
        id: user.id,
        employeeId: user.employeeId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        departmentId: user.departmentId,
        avatarUrl: user.avatarUrl,
      },
      tokens,
      requiresTwoFactor: false,
      mustChangePassword: false,
    };
  }

  async verifyTwoFactor(tempToken: string, totpCode: string) {
    try {
      const payload = this.jwtService.verify(tempToken);
      if (payload.type !== '2fa') {
        throw new UnauthorizedException('Invalid token');
      }

      const user = await this.db.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || !user.twoFactorSecret) {
        throw new UnauthorizedException('Invalid token');
      }

      const isValid = authenticator.verify({
        token: totpCode,
        secret: user.twoFactorSecret,
      });

      if (!isValid) {
        throw new UnauthorizedException('Invalid 2FA code');
      }

      const tokens = await this.generateTokens(user.id, user.role);

      return {
        user: {
          id: user.id,
          employeeId: user.employeeId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          departmentId: user.departmentId,
        },
        tokens,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async enableTwoFactor(userId: string) {
    const secret = authenticator.generateSecret();
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const otpauthUrl = authenticator.keyuri(user.email, 'TimeTrack', secret);

    // Store secret temporarily (not enabled until verified)
    await this.db.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
    });

    return { secret, otpauthUrl };
  }

  async confirmTwoFactor(userId: string, totpCode: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) {
      throw new UnauthorizedException();
    }

    const isValid = authenticator.verify({
      token: totpCode,
      secret: user.twoFactorSecret,
    });

    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    await this.db.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    return { message: 'Two-factor authentication enabled' };
  }

  async refreshTokens(refreshToken: string) {
    const stored = await this.db.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        await this.db.refreshToken.delete({ where: { id: stored.id } });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate refresh token
    await this.db.refreshToken.delete({ where: { id: stored.id } });

    const tokens = await this.generateTokens(stored.user.id, stored.user.role);

    return { tokens };
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.db.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    } else {
      // Logout from all devices
      await this.db.refreshToken.deleteMany({
        where: { userId },
      });
    }

    await this.db.auditLog.create({
      data: {
        userId,
        action: 'LOGOUT',
        entityType: 'user',
        entityId: userId,
      },
    });

    return { message: 'Logged out successfully' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.db.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });

    // Invalidate all refresh tokens
    await this.db.refreshToken.deleteMany({ where: { userId } });

    return { message: 'Password changed. Please log in again.' };
  }

  async forceChangePassword(tempToken: string, newPassword: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(tempToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired token. Please log in again.');
    }

    if (payload.type !== 'password-change') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.db.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.db.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    // Generate tokens so they're logged in after changing password
    const tokens = await this.generateTokens(user.id, user.role);

    await this.db.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_CHANGED',
        entityType: 'user',
        entityId: user.id,
      },
    });

    return {
      user: {
        id: user.id,
        employeeId: user.employeeId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        departmentId: user.departmentId,
        avatarUrl: user.avatarUrl,
      },
      tokens,
    };
  }

  async requestPasswordReset(email: string) {
    const user = await this.db.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user || !user.isActive) {
      return { message: 'If an account with that email exists, a reset link has been sent.' };
    }

    // In production, generate and send the reset token via email
    // const resetToken = this.jwtService.sign(
    //   { sub: user.id, type: 'password-reset' },
    //   { expiresIn: '30m' },
    // );
    this.logger.log(`Password reset requested for ${email}`);

    await this.db.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        entityType: 'user',
        entityId: user.id,
      },
    });

    return {
      message: 'If an account with that email exists, a reset link has been sent.',
    };
  }

  async resetPassword(resetToken: string, newPassword: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(resetToken);
    } catch {
      throw new UnauthorizedException('Reset link has expired. Please request a new one.');
    }

    if (payload.type !== 'password-reset') {
      throw new UnauthorizedException('Invalid reset token');
    }

    const user = await this.db.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.db.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false, failedAttempts: 0, lockedUntil: null },
    });

    // Invalidate all existing sessions
    await this.db.refreshToken.deleteMany({ where: { userId: user.id } });

    await this.db.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET',
        entityType: 'user',
        entityId: user.id,
      },
    });

    return { message: 'Password has been reset successfully. Please log in with your new password.' };
  }

  async registerOrganization(data: {
    organizationName: string;
    organizationCode: string;
    domain?: string;
    adminEmail: string;
    adminPassword: string;
    adminFirstName: string;
    adminLastName: string;
    timezone?: string;
  }) {
    // Check if org code or admin email already exists
    const existingOrg = await this.db.organization.findUnique({
      where: { code: data.organizationCode },
    });
    if (existingOrg) {
      throw new ConflictException('Organization code is already taken');
    }

    const existingUser = await this.db.user.findUnique({
      where: { email: data.adminEmail },
    });
    if (existingUser) {
      throw new ConflictException('Email address is already registered');
    }

    const passwordHash = await bcrypt.hash(data.adminPassword, BCRYPT_ROUNDS);

    // Create org, default department, and admin user in a transaction
    const result = await this.db.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: data.organizationName,
          code: data.organizationCode.toUpperCase(),
          domain: data.domain,
          timezone: data.timezone || 'Africa/Accra',
        },
      });

      const dept = await tx.department.create({
        data: {
          name: 'General',
          code: 'GEN',
          organizationId: org.id,
        },
      });

      const user = await tx.user.create({
        data: {
          email: data.adminEmail,
          passwordHash,
          firstName: data.adminFirstName,
          lastName: data.adminLastName,
          employeeId: 'ADMIN-001',
          role: 'SUPER_ADMIN',
          departmentId: dept.id,
          organizationId: org.id,
        },
      });

      // Create a default shift
      await tx.shift.create({
        data: {
          name: 'Standard (8AM - 5PM)',
          type: 'MORNING',
          organizationId: org.id,
          startTime: '08:00',
          endTime: '17:00',
          graceMinutesLate: 15,
          graceMinutesEarly: 15,
          breakDurationMinutes: 60,
          isDefault: true,
        },
      });

      return { org, user };
    });

    // Generate tokens so the admin is logged in immediately
    const tokens = await this.generateTokens(result.user.id, result.user.role);

    this.logger.log(`New organization registered: ${data.organizationName} (${data.organizationCode})`);

    return {
      user: {
        id: result.user.id,
        employeeId: result.user.employeeId,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role,
        departmentId: result.user.departmentId,
        avatarUrl: null,
      },
      organization: {
        id: result.org.id,
        name: result.org.name,
        code: result.org.code,
      },
      tokens,
    };
  }

  // --- Private Methods ---

  private async generateTokens(userId: string, role: string) {
    const accessToken = this.jwtService.sign({
      sub: userId,
      role,
      type: 'access',
    });

    const refreshToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await this.db.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  private async handleFailedLogin(userId: string, currentAttempts: number) {
    const newAttempts = currentAttempts + 1;
    const updateData: Record<string, unknown> = {
      failedAttempts: newAttempts,
    };

    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + LOCKOUT_DURATION_MINUTES);
      updateData.lockedUntil = lockedUntil;
      this.logger.warn(`Account locked for user ${userId} after ${newAttempts} failed attempts`);
    }

    await this.db.user.update({
      where: { id: userId },
      data: updateData,
    });

    await this.db.auditLog.create({
      data: {
        userId,
        action: 'FAILED_LOGIN',
        entityType: 'user',
        entityId: userId,
      },
    });
  }
}
