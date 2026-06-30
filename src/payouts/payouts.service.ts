import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { getPaginationParams, paginate } from '../helpers/pagination.helper';
import { PayoutStatus, NotificationType } from '@prisma/client';
import { ProcessPayoutDto } from './dto/process-payout.dto';

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── ADMIN: GET PENDING PAYOUTS ──────────────────────────

  async adminGetPendingPayouts() {
    // Get all gurus with completed bookings not yet paid out
    const gurus = await this.prisma.guru.findMany({
      include: {
        user: { select: { name: true, email: true } },
        bookings: {
          where: { status: 'COMPLETED' },
          select: { guruEarningsUsd: true, scheduledAt: true },
        },
        payouts: {
          where: { status: PayoutStatus.PROCESSED },
          select: { periodEnd: true },
        },
      },
    });

    return gurus
      .filter((g) => g.bookings.length > 0)
      .map((g) => {
        const totalEarnings = g.bookings.reduce(
          (sum, b) => sum + b.guruEarningsUsd,
          0,
        );

        return {
          guruId: g.id,
          guruName: g.user.name,
          guruEmail: g.user.email,
          totalCompletedSessions: g.bookings.length,
          totalEarningsUsd: Math.round(totalEarnings * 100) / 100,
          lastPayoutDate: g.payouts[g.payouts.length - 1]?.periodEnd ?? null,
        };
      });
  }

  // ── ADMIN: PROCESS PAYOUT ───────────────────────────────

  async adminProcessPayout(dto: ProcessPayoutDto, adminId: string) {
    const guru = await this.prisma.guru.findUnique({
      where: { id: dto.guruId },
      include: { user: { select: { name: true, email: true } } },
    });

    if (!guru) throw new NotFoundException('Guru not found');

    // Create payout record
    const payout = await this.prisma.payout.create({
      data: {
        guruId: dto.guruId,
        amountUsd: dto.amountUsd,
        status: PayoutStatus.PROCESSED,
        transactionRef: dto.transactionRef,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        processedAt: new Date(),
      },
    });

    // Send email + notification to guru
    await this.mail.sendPayoutProcessed(
      guru.user.email,
      guru.user.name,
      dto.amountUsd,
      new Date(dto.periodStart).toDateString(),
      new Date(dto.periodEnd).toDateString(),
      dto.transactionRef,
      new Date().toDateString(),
    );

    await this.notifications.createAndSend({
      userId: guru.userId,
      type: NotificationType.PAYOUT_PROCESSED,
      title: 'Payout Processed',
      body: `Your payout of $${dto.amountUsd} has been processed successfully.`,
    });

    this.logger.log(
      `Payout processed — guru: ${dto.guruId} amount: $${dto.amountUsd} by admin: ${adminId}`,
    );

    return { message: 'Payout processed successfully.', payoutId: payout.id };
  }

  // ── GURU: GET MY PAYOUTS ────────────────────────────────

  async getMyPayouts(userId: string, page: number = 1, limit: number = 10) {
    const guru = await this.prisma.guru.findUnique({ where: { userId } });
    if (!guru) throw new NotFoundException('Guru profile not found');

    const { skip, take } = getPaginationParams(page, limit);

    const [payouts, total] = await Promise.all([
      this.prisma.payout.findMany({
        where: { guruId: guru.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.payout.count({ where: { guruId: guru.id } }),
    ]);

    return paginate(payouts, total, page, limit);
  }
}
