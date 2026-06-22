import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { Plan } from '@prisma/client';

const TRIAL_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours in ms

const MONTHLY_LIMITS: Record<string, number | 'unlimited'> = {
  FREE: 1, // 1 per 24 hours after trial — handled separately
  STARTER: 50, // 50 per month
  PRO: 'unlimited', // no limit
};

@Injectable()
export class UsageLimiterInterceptor implements NestInterceptor {
  private readonly logger = new Logger(UsageLimiterInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.sub) {
      throw new ForbiddenException('Authentication required');
    }

    // Always fetch fresh user data — never trust JWT for limits
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        id: true,
        plan: true,
        fingerprint: true,
        trialStartedAt: true,
        trialExpiresAt: true,
        lastRequestAt: true,
        restricted: true,
        deletedAt: true,
      },
    });

    if (!dbUser) {
      throw new ForbiddenException('Account not found');
    }

    if (dbUser.deletedAt) {
      throw new ForbiddenException('Your account has been deactivated');
    }

    if (dbUser.restricted) {
      throw new ForbiddenException(
        'Your account has been restricted. Please contact support.',
      );
    }

    // PRO plan — skip all checks
    if (dbUser.plan === Plan.PRO) {
      return next.handle();
    }

    const now = new Date();

    // ── FIRST EVER REQUEST — DECIDE TRIAL ─────────────────
    if (!dbUser.trialStartedAt) {
      await this.handleFirstUse(dbUser, now);
      return next.handle();
    }

    // ── TRIAL STILL ACTIVE ─────────────────────────────────
    if (dbUser.trialExpiresAt && now < new Date(dbUser.trialExpiresAt)) {
      await this.prisma.user.update({
        where: { id: dbUser.id },
        data: { lastRequestAt: now },
      });

      this.logger.log(
        `Trial active for user: ${dbUser.id} — expires: ${dbUser.trialExpiresAt}`,
      );

      return next.handle();
    }

    // ── TRIAL EXPIRED ──────────────────────────────────────
    this.logger.log(
      `Trial expired for user: ${dbUser.id} — plan: ${dbUser.plan}`,
    );

    if (dbUser.plan === Plan.STARTER) {
      await this.enforceMonthlyLimit(dbUser, now);
      return next.handle();
    }

    // FREE plan after trial — 1 per 24 hours
    await this.enforceFreeDailyLimit(dbUser, now);
    return next.handle();
  }

  // ── HANDLE FIRST USE ────────────────────────────────────

  private async handleFirstUse(dbUser: any, now: Date): Promise<void> {
    let trialAllowed = true;

    // Check fingerprint abuse only if fingerprint exists
    if (dbUser.fingerprint) {
      const existingFingerprint =
        await this.prisma.deviceFingerprint.findUnique({
          where: { fingerprint: dbUser.fingerprint },
        });

      if (existingFingerprint && existingFingerprint.userId !== dbUser.id) {
        // Different user — same device — no trial
        trialAllowed = false;
        this.logger.warn(
          `Trial abuse blocked for user: ${dbUser.id} — device already used by: ${existingFingerprint.userId}`,
        );
      }
    }

    if (trialAllowed) {
      const trialExpiresAt = new Date(now.getTime() + TRIAL_DURATION_MS);

      // Start trial
      await this.prisma.user.update({
        where: { id: dbUser.id },
        data: {
          trialStartedAt: now,
          trialExpiresAt,
          lastRequestAt: now,
        },
      });

      // Store fingerprint to prevent future abuse on this device
      if (dbUser.fingerprint) {
        await this.prisma.deviceFingerprint.upsert({
          where: { fingerprint: dbUser.fingerprint },
          update: {},
          create: {
            fingerprint: dbUser.fingerprint,
            userId: dbUser.id,
          },
        });
      }

      this.logger.log(
        `Trial started for user: ${dbUser.id} — expires: ${trialExpiresAt.toISOString()}`,
      );
    } else {
      // Device already used trial — treat as FREE with 24hr limit
      // No trialStartedAt set — they go straight to daily limit
      await this.enforceFreeDailyLimitNoUpdate(dbUser, now);
    }
  }

  // ── ENFORCE FREE DAILY LIMIT ────────────────────────────

  private async enforceFreeDailyLimit(dbUser: any, now: Date): Promise<void> {
    if (dbUser.lastRequestAt) {
      const timeSinceLastRequest =
        now.getTime() - new Date(dbUser.lastRequestAt).getTime();

      if (timeSinceLastRequest < COOLDOWN_MS) {
        const remainingMs = COOLDOWN_MS - timeSinceLastRequest;
        const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
        const remainingMinutes = Math.ceil(remainingMs / (1000 * 60));

        const timeMessage =
          remainingHours >= 1
            ? `${remainingHours} hour${remainingHours > 1 ? 's' : ''}`
            : `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;

        throw new ForbiddenException({
          message:
            `Your free trial has expired. You are limited to 1 proposal per 24 hours. ` +
            `Next request available in ${timeMessage}.`,
          upgradeRequired: true,
          nextAvailableIn: remainingMs,
        });
      }
    }

    // Allowed — update last request time
    await this.prisma.user.update({
      where: { id: dbUser.id },
      data: { lastRequestAt: now },
    });
  }

  // ── ENFORCE FREE DAILY LIMIT (NO DB UPDATE) ─────────────
  // Used for abuse case — no trial started, just check and block

  private async enforceFreeDailyLimitNoUpdate(
    dbUser: any,
    now: Date,
  ): Promise<void> {
    if (dbUser.lastRequestAt) {
      const timeSinceLastRequest =
        now.getTime() - new Date(dbUser.lastRequestAt).getTime();

      if (timeSinceLastRequest < COOLDOWN_MS) {
        const remainingMs = COOLDOWN_MS - timeSinceLastRequest;
        const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));

        throw new ForbiddenException({
          message:
            `You are limited to 1 proposal per 24 hours. ` +
            `Next request available in ${remainingHours} hour${remainingHours > 1 ? 's' : ''}.`,
          upgradeRequired: true,
          nextAvailableIn: remainingMs,
        });
      }
    }

    // Allow — update lastRequestAt only
    await this.prisma.user.update({
      where: { id: dbUser.id },
      data: { lastRequestAt: now },
    });
  }

  // ── ENFORCE MONTHLY LIMIT (STARTER) ────────────────────

  private async enforceMonthlyLimit(dbUser: any, now: Date): Promise<void> {
    const limit = MONTHLY_LIMITS[dbUser.plan];

    if (limit === 'unlimited') return;

    // Count proposals generated this calendar month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const count = await this.prisma.proposal.count({
      where: {
        userId: dbUser.id,
        createdAt: { gte: startOfMonth },
      },
    });

    if (count >= (limit as number)) {
      throw new ForbiddenException({
        message:
          `You have reached your monthly limit of ${limit} proposals on the Starter plan. ` +
          `Upgrade to PRO for unlimited access.`,
        upgradeRequired: true,
        currentCount: count,
        limit,
      });
    }

    // Update last request time
    await this.prisma.user.update({
      where: { id: dbUser.id },
      data: { lastRequestAt: now },
    });
  }
}
