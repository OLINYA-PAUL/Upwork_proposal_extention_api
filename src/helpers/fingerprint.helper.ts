import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface FingerprintData {
  userAgent: string;
  language: string;
  timezone: string;
  screenResolution: string;
  platform: string;
  colorDepth: string;
  extensionId?: string;
}

@Injectable()
export class FingerprintHelper {
  // ── HASH FINGERPRINT ────────────────────────────────────
  // Takes raw fingerprint data from extension and returns
  // a consistent SHA-256 hash — never store raw fingerprint

  hash(data: FingerprintData): string {
    const raw = [
      data.userAgent,
      data.language,
      data.timezone,
      data.screenResolution,
      data.platform,
      data.colorDepth,
      data.extensionId || '',
    ]
      .join('|')
      .toLowerCase()
      .trim();

    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  // ── HASH FROM STRING ────────────────────────────────────
  // If extension sends pre-combined string

  hashString(raw: string): string {
    return crypto
      .createHash('sha256')
      .update(raw.toLowerCase().trim())
      .digest('hex');
  }
}
