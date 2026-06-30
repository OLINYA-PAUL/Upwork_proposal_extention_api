import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Plan,
  Role,
  BookingStatus,
  ProposalStatus,
  PayoutStatus,
} from '@prisma/client';
import {
  FullUserStats,
  GuruStats,
  ProposalStatusBreakdown,
} from './dto/user-stats-response.dto';

const FREE_TRIAL_LIMIT = 10;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class UserStatsService {
  private readonly logger = new Logger(UserStatsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── GET MY STATS ─────────────────────────────────────────

  async getMyStats(userId: string): Promise<FullUserStats> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        plan: true,
        trialStartedAt: true,
        lastRequestAt: true,
        createdAt: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const baseStats = await this.getBaseUserStats(user);

    // If user is GURU, attach guru-specific stats
    if (user.role === Role.GURU) {
      const guruStats = await this.getGuruStats(userId);
      return { ...baseStats, guruStats };
    }

    return baseStats;
  }

  // ── BASE USER STATS ──────────────────────────────────────

  private async getBaseUserStats(user: any) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      totalProposals,
      proposalsThisMonth,
      statusBreakdownRaw,
      recentProposals,
      templatesPurchased,
      bookingsMade,
    ] = await Promise.all([
      this.prisma.proposal.count({ where: { userId: user.id } }),
      this.prisma.proposal.count({
        where: { userId: user.id, createdAt: { gte: startOfMonth } },
      }),
      this.prisma.proposal.groupBy({
        by: ['status'],
        where: { userId: user.id },
        _count: true,
      }),
      this.prisma.proposal.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, jobTitle: true, status: true, createdAt: true },
      }),
      this.prisma.purchasedTemplate.count({ where: { userId: user.id } }),
      this.prisma.booking.count({ where: { userId: user.id } }),
    ]);

    const statusBreakdown = statusBreakdownRaw.map((s) => ({
      status: s.status,
      count: s._count,
    }));

    const status: ProposalStatus[] = [
      ProposalStatus.SUBMITTED,
      ProposalStatus.INTERVIEW,
      ProposalStatus.HIRED,
      ProposalStatus.REJECTED,
    ];

    // Success rate — hired / (submitted + interview + hired + rejected)
    const submittedCount = statusBreakdownRaw
      .filter((s) => status.includes(s.status as ProposalStatus))
      .reduce((sum, s) => sum + s._count, 0);

    const hiredCount =
      statusBreakdownRaw.find((s) => s.status === ProposalStatus.HIRED)
        ?._count ?? 0;

    const successRate =
      submittedCount > 0
        ? Math.round((hiredCount / submittedCount) * 1000) / 10
        : 0;

    // ── TRIAL / PLAN STATUS ──────────────────────────────
    let trialActive = false;
    let trialRemaining: number | null = null;
    let nextRequestAvailableIn: number | null = null;

    if (user.plan === Plan.PRO) {
      // unlimited — no trial info needed
    } else if (user.plan === Plan.STARTER) {
      // monthly limit handled separately — not trial based
    } else {
      // FREE plan — check trial usage
      if (totalProposals < FREE_TRIAL_LIMIT) {
        trialActive = true;
        trialRemaining = FREE_TRIAL_LIMIT - totalProposals;
      } else if (user.lastRequestAt) {
        const elapsed = Date.now() - new Date(user.lastRequestAt).getTime();
        if (elapsed < COOLDOWN_MS) {
          nextRequestAvailableIn = COOLDOWN_MS - elapsed;
        }
      }
    }

    return {
      totalProposals,
      proposalsThisMonth,
      proposalStatusBreakdown: statusBreakdown,
      successRate,
      plan: user.plan,
      trialActive,
      trialRemaining,
      nextRequestAvailableIn,
      recentProposals,
      memberSince: user.createdAt,
      templatesPurchased,
      bookingsMade,
    };
  }

  // ── GURU STATS ────────────────────────────────────────────

  private async getGuruStats(userId: string): Promise<GuruStats> {
    const guru = await this.prisma.guru.findUnique({
      where: { userId },
      select: { id: true, rating: true, reviewCount: true },
    });

    if (!guru) {
      // Guru profile not yet created (edge case — role is GURU but no profile)
      return {
        totalBookingsReceived: 0,
        upcomingSessions: 0,
        totalEarningsPaid: 0,
        totalEarningsPending: 0,
        averageRating: 0,
        totalReviews: 0,
        blogPostsPublished: 0,
      };
    }

    const now = new Date();

    const [
      totalBookingsReceived,
      upcomingSessions,
      completedEarningsAgg,
      payoutsAgg,
      blogPostsPublished,
    ] = await Promise.all([
      this.prisma.booking.count({ where: { guruId: guru.id } }),
      this.prisma.booking.count({
        where: {
          guruId: guru.id,
          status: BookingStatus.PAID,
          scheduledAt: { gte: now },
        },
      }),
      this.prisma.booking.aggregate({
        where: { guruId: guru.id, status: BookingStatus.COMPLETED },
        _sum: { guruEarningsUsd: true },
      }),
      this.prisma.payout.aggregate({
        where: { guruId: guru.id, status: PayoutStatus.PROCESSED },
        _sum: { amountUsd: true },
      }),
      this.prisma.blogPost.count({
        where: { authorId: userId, status: 'PUBLISHED' },
      }),
    ]);

    const totalEarningsAccrued = completedEarningsAgg._sum.guruEarningsUsd ?? 0;
    const totalEarningsPaid = payoutsAgg._sum.amountUsd ?? 0;
    const totalEarningsPending = Math.max(
      0,
      totalEarningsAccrued - totalEarningsPaid,
    );

    return {
      totalBookingsReceived,
      upcomingSessions,
      totalEarningsPaid: Math.round(totalEarningsPaid * 100) / 100,
      totalEarningsPending: Math.round(totalEarningsPending * 100) / 100,
      averageRating: guru.rating,
      totalReviews: guru.reviewCount,
      blogPostsPublished,
    };
  }
}
