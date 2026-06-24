import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export const SETTINGS_KEYS = {
  TRIAL_ENABLED: 'trial_enabled',
} as const;

const SETTINGS_CACHE_TTL = 300; // 5 minutes

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── BOOTSTRAP DEFAULT SETTINGS ──────────────────────────
  // Runs once on app start — seeds defaults if not exist

  async onModuleInit() {
    await this.seedDefaults();
  }

  private async seedDefaults(): Promise<void> {
    const defaults = [
      {
        key: SETTINGS_KEYS.TRIAL_ENABLED,
        value: 'false', // Trial OFF by default
      },
    ];

    for (const setting of defaults) {
      const existing = await this.prisma.appSettings.findUnique({
        where: { key: setting.key },
      });

      if (!existing) {
        // Use a system placeholder for initial seed
        const adminUser = await this.prisma.user.findFirst({
          where: { role: 'ADMIN' },
          select: { id: true },
        });

        await this.prisma.appSettings.create({
          data: {
            key: setting.key,
            value: setting.value,
            updatedBy: adminUser?.id || '000000000000000000000000',
          },
        });

        this.logger.log(
          `Default setting seeded: ${setting.key} = ${setting.value}`,
        );
      }
    }
  }

  // ── GET TRIAL ENABLED ───────────────────────────────────
  // Checks Redis first — falls back to MongoDB

  async isTrialEnabled(): Promise<boolean> {
    // 1. Check Redis cache first
    const cached = await this.redis.getCachedAppSetting(
      SETTINGS_KEYS.TRIAL_ENABLED,
    );

    if (cached !== null) {
      return cached === 'true';
    }

    // 2. Fallback to MongoDB
    const setting = await this.prisma.appSettings.findUnique({
      where: { key: SETTINGS_KEYS.TRIAL_ENABLED },
    });

    const value = setting?.value ?? 'false';

    // 3. Cache the result
    await this.redis.cacheAppSetting(
      SETTINGS_KEYS.TRIAL_ENABLED,
      value,
      SETTINGS_CACHE_TTL,
    );

    return value === 'true';
  }

  // ── TOGGLE TRIAL ────────────────────────────────────────

  async setTrialEnabled(
    enabled: boolean,
    adminId: string,
    adminEmail: string,
  ): Promise<{ message: string; trialEnabled: boolean }> {
    const key = SETTINGS_KEYS.TRIAL_ENABLED;
    const newValue = enabled ? 'true' : 'false';

    // Get current value for audit log
    const current = await this.prisma.appSettings.findUnique({
      where: { key },
    });

    const oldValue = current?.value ?? 'false';

    // Update MongoDB
    await this.prisma.appSettings.upsert({
      where: { key },
      update: {
        value: newValue,
        updatedBy: adminId,
      },
      create: {
        key,
        value: newValue,
        updatedBy: adminId,
      },
    });

    // Invalidate Redis cache immediately
    await this.redis.invalidateAppSetting(key);

    // Write audit log
    await this.prisma.settingsAuditLog.create({
      data: {
        key,
        oldValue,
        newValue,
        changedBy: adminId,
        changedByEmail: adminEmail,
      },
    });

    this.logger.log(
      `Trial setting changed to ${newValue} by admin ${adminEmail}`,
    );

    return {
      message: `Free trial has been ${enabled ? 'enabled' : 'disabled'} successfully.`,
      trialEnabled: enabled,
    };
  }

  // ── GET ALL SETTINGS ────────────────────────────────────

  async getAllSettings(): Promise<Record<string, string>> {
    const settings = await this.prisma.appSettings.findMany();

    return settings.reduce(
      (acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      },
      {} as Record<string, string>,
    );
  }

  // ── GET AUDIT LOG ───────────────────────────────────────

  async getAuditLog(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.settingsAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.settingsAuditLog.count(),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }
}
