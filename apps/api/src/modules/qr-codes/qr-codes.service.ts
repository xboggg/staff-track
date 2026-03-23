import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import * as QRCode from 'qrcode';
import { DatabaseService } from '../../database/database.service';
import { QR_ROTATION_INTERVAL_SECONDS, QR_MAX_AGE_SECONDS } from '@timetrack/shared';

@Injectable()
export class QrCodesService {
  private readonly logger = new Logger(QrCodesService.name);
  private readonly hmacSecret: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    this.hmacSecret = this.configService.get<string>('QR_HMAC_SECRET', 'change-me-in-production');
  }

  async generateQrCode(locationId: string): Promise<{ qrDataUrl: string; token: string; expiresAt: Date }> {
    const nonce = uuidv4();
    const timestamp = Date.now();
    const payload = `${locationId}:${timestamp}:${nonce}`;

    // HMAC-SHA256 signature to prevent forgery
    const signature = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(payload)
      .digest('hex');

    const token = Buffer.from(JSON.stringify({
      locationId,
      timestamp,
      nonce,
      signature,
    })).toString('base64url');

    const expiresAt = new Date(timestamp + QR_ROTATION_INTERVAL_SECONDS * 1000);

    // Store in DB for validation
    await this.db.qrCode.create({
      data: {
        locationId,
        token,
        hmacSignature: signature,
        expiresAt,
      },
    });

    // Generate QR code image as data URL
    const qrDataUrl = await QRCode.toDataURL(token, {
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });

    return { qrDataUrl, token, expiresAt };
  }

  async validateToken(token: string, expectedLocationId: string): Promise<boolean> {
    try {
      // Decode token
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
      const { locationId, timestamp, nonce, signature } = decoded;

      // Check location match
      if (locationId !== expectedLocationId) {
        this.logger.warn('QR location mismatch');
        return false;
      }

      // Check expiry
      const age = Date.now() - timestamp;
      if (age > QR_MAX_AGE_SECONDS * 1000) {
        this.logger.warn('QR code expired');
        return false;
      }

      // Verify HMAC signature
      const expectedSignature = crypto
        .createHmac('sha256', this.hmacSecret)
        .update(`${locationId}:${timestamp}:${nonce}`)
        .digest('hex');

      if (!crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      )) {
        this.logger.warn('QR HMAC signature invalid');
        return false;
      }

      // Check DB record exists (multi-use: any employee can scan within expiry window)
      const stored = await this.db.qrCode.findUnique({ where: { token } });
      if (!stored) {
        this.logger.warn('QR code not found in database');
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('QR validation error', error);
      return false;
    }
  }

  async cleanupExpired(): Promise<number> {
    const result = await this.db.qrCode.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}
