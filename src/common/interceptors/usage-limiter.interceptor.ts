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
import { SettingsService } from '../../settings/settings.service';
import { Plan } from '@prisma/client';

const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const MONTHLY_LIMITS: Record<string, number | 'unlimited'> = {
  FREE: 1,
  STARTER: 50,
  PRO: 'unlimited',
};

@Injectable()
export class UsageLimiterInterceptor implements NestInterceptor {
  private readonly logger = new Logger(UsageLimiterInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.sub) {
      throw new ForbiddenException('Authentication required');
    }

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

    // PRO plan — unlimited
    if (dbUser.plan === Plan.PRO) {
      return next.handle();
    }

    const now = new Date();

    // ── FIRST USE — CHECK TRIAL SETTING ───────────────────
    if (!dbUser.trialStartedAt) {
      // Check if admin has trial enabled
      const trialEnabled = await this.settingsService.isTrialEnabled();

      if (trialEnabled) {
        await this.handleFirstUse(dbUser, now);
      } else {
        // Trial disabled globally — go straight to free limit
        this.logger.log(
          `Trial disabled globally — user ${dbUser.id} goes straight to free limit`,
        );
        await this.enforceFreeDailyLimit(dbUser, now);
      }

      return next.handle();
    }

    // ── TRIAL ACTIVE ───────────────────────────────────────
    if (dbUser.trialExpiresAt && now < new Date(dbUser.trialExpiresAt)) {
      await this.prisma.user.update({
        where: { id: dbUser.id },
        data: { lastRequestAt: now },
      });

      return next.handle();
    }

    // ── TRIAL EXPIRED ──────────────────────────────────────
    if (dbUser.plan === Plan.STARTER) {
      await this.enforceMonthlyLimit(dbUser, now);
      return next.handle();
    }

    // FREE after trial
    await this.enforceFreeDailyLimit(dbUser, now);
    return next.handle();
  }

  // ── HANDLE FIRST USE ────────────────────────────────────

  private async handleFirstUse(dbUser: any, now: Date): Promise<void> {
    let trialAllowed = true;

    if (dbUser.fingerprint) {
      const existingFingerprint =
        await this.prisma.deviceFingerprint.findUnique({
          where: { fingerprint: dbUser.fingerprint },
        });

      if (existingFingerprint && existingFingerprint.userId !== dbUser.id) {
        trialAllowed = false;
        this.logger.warn(
          `Trial abuse blocked — user: ${dbUser.id} — device already used by: ${existingFingerprint.userId}`,
        );
      }
    }

    if (trialAllowed) {
      const trialExpiresAt = new Date(now.getTime() + TRIAL_DURATION_MS);

      await this.prisma.user.update({
        where: { id: dbUser.id },
        data: {
          trialStartedAt: now,
          trialExpiresAt,
          lastRequestAt: now,
        },
      });

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
        `Trial started — user: ${dbUser.id} expires: ${trialExpiresAt.toISOString()}`,
      );
    } else {
      await this.enforceFreeDailyLimit(dbUser, now);
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
            `You are limited to 1 proposal per 24 hours. ` +
            `Next request available in ${timeMessage}.`,
          upgradeRequired: true,
          nextAvailableIn: remainingMs,
        });
      }
    }

    await this.prisma.user.update({
      where: { id: dbUser.id },
      data: { lastRequestAt: now },
    });
  }

  // ── ENFORCE MONTHLY LIMIT (STARTER) ────────────────────

  private async enforceMonthlyLimit(dbUser: any, now: Date): Promise<void> {
    const limit = MONTHLY_LIMITS[dbUser.plan];

    if (limit === 'unlimited') return;

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
          `You have reached your monthly limit of ${limit} proposals. ` +
          `Upgrade to PRO for unlimited access.`,
        upgradeRequired: true,
        currentCount: count,
        limit,
      });
    }

    await this.prisma.user.update({
      where: { id: dbUser.id },
      data: { lastRequestAt: now },
    });
  }
}
