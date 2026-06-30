import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatsCacheHelper } from '../helpers/stats-cache.helper';
import { resolveDateRange, getDaysArray } from '../helpers/date-range.helper';
import { DateRangeDto } from './dto/date-range.dto';
import { Plan, Role, BookingStatus, BlogPostStatus } from '@prisma/client';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class AdminStatsService {
  private readonly logger = new Logger(AdminStatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: StatsCacheHelper,
  ) {}

  // ── OVERVIEW ─────────────────────────────────────────────

  async getOverview() {
    const key = this.cache.buildKey('overview');

    return this.cache.getOrCompute(key, async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        totalUsers,
        newUsersToday,
        activeUsersToday,
        totalProposalsAllTime,
        proposalsToday,
        totalGurus,
        pendingGuruApplications,
        totalBlogPosts,
        pendingBlogPosts,
        activeSubscriptions,
      ] = await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.user.count({
          where: { createdAt: { gte: today }, deletedAt: null },
        }),
        this.prisma.user.count({
          where: { lastLoginAt: { gte: today } },
        }),
        this.prisma.proposal.count(),
        this.prisma.proposal.count({ where: { createdAt: { gte: today } } }),
        this.prisma.guru.count({ where: { status: 'APPROVED' } }),
        this.prisma.guruApplication.count({ where: { status: 'PENDING' } }),
        this.prisma.blogPost.count({
          where: { status: BlogPostStatus.PUBLISHED },
        }),
        this.prisma.blogPost.count({
          where: { status: BlogPostStatus.PENDING_REVIEW },
        }),
        this.prisma.user.count({
          where: { plan: { in: [Plan.STARTER, Plan.PRO] }, deletedAt: null },
        }),
      ]);

      return {
        totalUsers,
        newUsersToday,
        activeUsersToday,
        totalProposalsAllTime,
        proposalsToday,
        totalGurus,
        pendingGuruApplications,
        totalBlogPosts,
        pendingBlogPosts,
        activeSubscriptions,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  // ── USERS ────────────────────────────────────────────────

  async getUserStats(dto: DateRangeDto) {
    const { start, end } = resolveDateRange(dto.startDate, dto.endDate);
    const key = this.cache.buildKey('users', dto.startDate, dto.endDate);

    return this.cache.getOrCompute(key, async () => {
      const [
        totalUsers,
        usersByPlan,
        usersByRole,
        restrictedUsers,
        deletedUsers,
        newUsersInRange,
        signupsRaw,
      ] = await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.user.groupBy({
          by: ['plan'],
          where: { deletedAt: null },
          _count: true,
        }),
        this.prisma.user.groupBy({
          by: ['role'],
          where: { deletedAt: null },
          _count: true,
        }),
        this.prisma.user.count({
          where: { restricted: true, deletedAt: null },
        }),
        this.prisma.user.count({ where: { deletedAt: { not: null } } }),
        this.prisma.user.count({
          where: { createdAt: { gte: start, lte: end }, deletedAt: null },
        }),
        this.prisma.user.findMany({
          where: { createdAt: { gte: start, lte: end } },
          select: { createdAt: true },
        }),
      ]);

      // Build daily signup chart
      const days = getDaysArray(start, end);
      const signupMap = new Map(days.map((d) => [d, 0]));

      for (const user of signupsRaw) {
        const day = user.createdAt.toISOString().split('T')[0];
        if (signupMap.has(day)) {
          signupMap.set(day, (signupMap.get(day) || 0) + 1);
        }
      }

      const growthChart = Array.from(signupMap.entries()).map(
        ([date, count]) => ({ date, count }),
      );

      // Trial stats
      const trialActiveUsers = await this.prisma.user.count({
        where: {
          trialStartedAt: { not: null },
          plan: Plan.FREE,
          deletedAt: null,
        },
      });

      const trialConvertedUsers = await this.prisma.user.count({
        where: {
          trialStartedAt: { not: null },
          plan: { in: [Plan.STARTER, Plan.PRO] },
          deletedAt: null,
        },
      });

      const totalTrialUsers = trialActiveUsers + trialConvertedUsers;
      const conversionRate =
        totalTrialUsers > 0
          ? Math.round((trialConvertedUsers / totalTrialUsers) * 1000) / 10
          : 0;

      return {
        totalUsers,
        newUsersInRange,
        usersByPlan: usersByPlan.map((p) => ({
          plan: p.plan,
          count: p._count,
        })),
        usersByRole: usersByRole.map((r) => ({
          role: r.role,
          count: r._count,
        })),
        restrictedUsers,
        deletedUsers,
        trialUsersActive: trialActiveUsers,
        trialConversionRate: conversionRate,
        growthChart,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  // ── REVENUE ──────────────────────────────────────────────

  async getRevenueStats(dto: DateRangeDto) {
    const { start, end } = resolveDateRange(dto.startDate, dto.endDate);
    const key = this.cache.buildKey('revenue', dto.startDate, dto.endDate);

    return this.cache.getOrCompute(key, async () => {
      const [
        templatePurchases,
        bookingsCompleted,
        activeStarterCount,
        activeProCount,
        canceledThisMonth,
      ] = await Promise.all([
        this.prisma.purchasedTemplate.findMany({
          where: { purchasedAt: { gte: start, lte: end } },
          select: { amountPaidUsd: true, purchasedAt: true },
        }),
        this.prisma.booking.findMany({
          where: {
            status: BookingStatus.COMPLETED,
            createdAt: { gte: start, lte: end },
          },
          select: { amountUsd: true, platformFeeUsd: true, createdAt: true },
        }),
        this.prisma.user.count({
          where: { plan: Plan.STARTER, deletedAt: null },
        }),
        this.prisma.user.count({ where: { plan: Plan.PRO, deletedAt: null } }),
        this.prisma.user.count({
          where: {
            plan: Plan.FREE,
            paddleSubId: null,
            updatedAt: { gte: start, lte: end },
          },
        }),
      ]);

      const templateRevenue = templatePurchases.reduce(
        (sum, t) => sum + t.amountPaidUsd,
        0,
      );

      const bookingRevenue = bookingsCompleted.reduce(
        (sum, b) => sum + b.platformFeeUsd,
        0,
      );

      // MRR estimate — STARTER $9, PRO $29
      const mrr = activeStarterCount * 9 + activeProCount * 29;

      const totalRevenueInRange = templateRevenue + bookingRevenue;

      // Build daily revenue chart
      const days = getDaysArray(start, end);
      const revenueMap = new Map(days.map((d) => [d, 0]));

      for (const t of templatePurchases) {
        const day = t.purchasedAt.toISOString().split('T')[0];
        if (revenueMap.has(day)) {
          revenueMap.set(day, (revenueMap.get(day) || 0) + t.amountPaidUsd);
        }
      }

      for (const b of bookingsCompleted) {
        const day = b.createdAt.toISOString().split('T')[0];
        if (revenueMap.has(day)) {
          revenueMap.set(day, (revenueMap.get(day) || 0) + b.platformFeeUsd);
        }
      }

      const revenueChart = Array.from(revenueMap.entries()).map(
        ([date, amount]) => ({
          date,
          amount: Math.round(amount * 100) / 100,
        }),
      );

      const totalUsers = activeStarterCount + activeProCount;
      const arpu =
        totalUsers > 0 ? Math.round((mrr / totalUsers) * 100) / 100 : 0;

      return {
        totalRevenueInRange: Math.round(totalRevenueInRange * 100) / 100,
        templateRevenue: Math.round(templateRevenue * 100) / 100,
        bookingRevenue: Math.round(bookingRevenue * 100) / 100,
        mrr,
        arpu,
        canceledSubscriptionsInRange: canceledThisMonth,
        revenueChart,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  // ── SUBSCRIPTIONS ────────────────────────────────────────

  async getSubscriptionStats(dto: DateRangeDto) {
    const { start, end } = resolveDateRange(dto.startDate, dto.endDate);
    const key = this.cache.buildKey(
      'subscriptions',
      dto.startDate,
      dto.endDate,
    );

    return this.cache.getOrCompute(key, async () => {
      const [starterCount, proCount, freeCount, totalActiveUsers] =
        await Promise.all([
          this.prisma.user.count({
            where: { plan: Plan.STARTER, deletedAt: null },
          }),
          this.prisma.user.count({
            where: { plan: Plan.PRO, deletedAt: null },
          }),
          this.prisma.user.count({
            where: { plan: Plan.FREE, deletedAt: null },
          }),
          this.prisma.user.count({ where: { deletedAt: null } }),
        ]);

      const paidUsers = starterCount + proCount;
      const churnRate =
        totalActiveUsers > 0
          ? Math.round((freeCount / totalActiveUsers) * 1000) / 10
          : 0;

      return {
        starterCount,
        proCount,
        freeCount,
        paidUsers,
        totalActiveUsers,
        paidConversionRate:
          totalActiveUsers > 0
            ? Math.round((paidUsers / totalActiveUsers) * 1000) / 10
            : 0,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  // ── PROPOSALS ─────────────────────────────────────────────

  async getProposalStats(dto: DateRangeDto) {
    const { start, end } = resolveDateRange(dto.startDate, dto.endDate);
    const key = this.cache.buildKey('proposals', dto.startDate, dto.endDate);

    return this.cache.getOrCompute(key, async () => {
      const [totalProposals, proposalsByStatus, proposalsInRange, topUsersRaw] =
        await Promise.all([
          this.prisma.proposal.count(),
          this.prisma.proposal.groupBy({
            by: ['status'],
            _count: true,
          }),
          this.prisma.proposal.findMany({
            where: { createdAt: { gte: start, lte: end } },
            select: { createdAt: true },
          }),
          this.prisma.proposal.groupBy({
            by: ['userId'],
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 10,
          }),
        ]);

      const userIds = topUsersRaw.map((u) => u.userId);
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      });

      const topUsers = topUsersRaw.map((u) => {
        const user = users.find((usr) => usr.id === u.userId);
        return {
          userId: u.userId,
          name: user?.name ?? 'Unknown',
          email: user?.email ?? '',
          proposalCount: u._count.id,
        };
      });

      const days = getDaysArray(start, end);
      const proposalMap = new Map(days.map((d) => [d, 0]));

      for (const p of proposalsInRange) {
        const day = p.createdAt.toISOString().split('T')[0];
        if (proposalMap.has(day)) {
          proposalMap.set(day, (proposalMap.get(day) || 0) + 1);
        }
      }

      const generationChart = Array.from(proposalMap.entries()).map(
        ([date, count]) => ({ date, count }),
      );

      const totalUsers = await this.prisma.user.count({
        where: { deletedAt: null },
      });
      const avgPerUser =
        totalUsers > 0
          ? Math.round((totalProposals / totalUsers) * 10) / 10
          : 0;

      return {
        totalProposals,
        proposalsInRange: proposalsInRange.length,
        averageProposalsPerUser: avgPerUser,
        proposalsByStatus: proposalsByStatus.map((s) => ({
          status: s.status,
          count: s._count,
        })),
        topUsers,
        generationChart,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  // ── TEMPLATES ─────────────────────────────────────────────

  async getTemplateStats(dto: DateRangeDto) {
    const { start, end } = resolveDateRange(dto.startDate, dto.endDate);
    const key = this.cache.buildKey('templates', dto.startDate, dto.endDate);

    return this.cache.getOrCompute(key, async () => {
      const [
        totalTemplates,
        totalPurchases,
        purchasesInRange,
        bestSelling,
        byCategory,
      ] = await Promise.all([
        this.prisma.template.count({ where: { status: 'PUBLISHED' } }),
        this.prisma.purchasedTemplate.count(),
        this.prisma.purchasedTemplate.findMany({
          where: { purchasedAt: { gte: start, lte: end } },
          select: { amountPaidUsd: true },
        }),
        this.prisma.template.findMany({
          orderBy: { purchaseCount: 'desc' },
          take: 10,
          select: {
            id: true,
            jobTitle: true,
            purchaseCount: true,
            priceUsd: true,
            category: { select: { name: true } },
          },
        }),
        this.prisma.template.groupBy({
          by: ['categoryId'],
          _count: true,
        }),
      ]);

      const revenueInRange = purchasesInRange.reduce(
        (sum, p) => sum + p.amountPaidUsd,
        0,
      );

      const categoryIds = byCategory.map((c) => c.categoryId);
      const categories = await this.prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      });

      const templatesByCategory = byCategory.map((c) => {
        const cat = categories.find((cc) => cc.id === c.categoryId);
        return { category: cat?.name ?? 'Unknown', count: c._count };
      });

      return {
        totalTemplates,
        totalPurchases,
        purchasesInRange: purchasesInRange.length,
        revenueInRange: Math.round(revenueInRange * 100) / 100,
        bestSelling,
        templatesByCategory,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  // ── GURUS ──────────────────────────────────────────────────

  async getGuruStats(dto: DateRangeDto) {
    const { start, end } = resolveDateRange(dto.startDate, dto.endDate);
    const key = this.cache.buildKey('gurus', dto.startDate, dto.endDate);

    return this.cache.getOrCompute(key, async () => {
      const [
        totalGurus,
        pendingApplications,
        totalBookings,
        bookingsInRange,
        completedBookings,
        totalPayouts,
        pendingPayoutsAmount,
        topRatedGurus,
      ] = await Promise.all([
        this.prisma.guru.count({ where: { status: 'APPROVED' } }),
        this.prisma.guruApplication.count({ where: { status: 'PENDING' } }),
        this.prisma.booking.count(),
        this.prisma.booking.findMany({
          where: { createdAt: { gte: start, lte: end } },
          select: {
            amountUsd: true,
            platformFeeUsd: true,
            guruEarningsUsd: true,
            status: true,
          },
        }),
        this.prisma.booking.count({
          where: { status: BookingStatus.COMPLETED },
        }),
        this.prisma.payout.aggregate({
          where: { status: 'PROCESSED' },
          _sum: { amountUsd: true },
        }),
        this.prisma.booking.aggregate({
          where: { status: BookingStatus.COMPLETED },
          _sum: { guruEarningsUsd: true },
        }),
        this.prisma.guru.findMany({
          where: { status: 'APPROVED', reviewCount: { gt: 0 } },
          orderBy: { rating: 'desc' },
          take: 10,
          select: {
            id: true,
            rating: true,
            reviewCount: true,
            user: { select: { name: true } },
          },
        }),
      ]);

      const totalBookingRevenue = bookingsInRange.reduce(
        (sum, b) => sum + (b.status === 'COMPLETED' ? b.platformFeeUsd : 0),
        0,
      );

      const totalGuruEarningsPaid = totalPayouts._sum.amountUsd ?? 0;
      const totalGuruEarningsAccrued =
        pendingPayoutsAmount._sum.guruEarningsUsd ?? 0;
      const pendingPayoutBalance = Math.max(
        0,
        totalGuruEarningsAccrued - totalGuruEarningsPaid,
      );

      const allGurus = await this.prisma.guru.findMany({
        where: { status: 'APPROVED', reviewCount: { gt: 0 } },
        select: { rating: true },
      });
      const avgRating =
        allGurus.length > 0
          ? Math.round(
              (allGurus.reduce((sum, g) => sum + g.rating, 0) /
                allGurus.length) *
                10,
            ) / 10
          : 0;

      return {
        totalGurus,
        pendingApplications,
        totalBookings,
        bookingsInRange: bookingsInRange.length,
        completedBookings,
        totalBookingRevenueInRange: Math.round(totalBookingRevenue * 100) / 100,
        totalGuruEarningsPaid: Math.round(totalGuruEarningsPaid * 100) / 100,
        pendingPayoutBalance: Math.round(pendingPayoutBalance * 100) / 100,
        averageGuruRating: avgRating,
        topRatedGurus: topRatedGurus.map((g) => ({
          guruId: g.id,
          name: g.user.name,
          rating: g.rating,
          reviewCount: g.reviewCount,
        })),
        generatedAt: new Date().toISOString(),
      };
    });
  }

  // ── BLOG ───────────────────────────────────────────────────

  async getBlogStats(dto: DateRangeDto) {
    const { start, end } = resolveDateRange(dto.startDate, dto.endDate);
    const key = this.cache.buildKey('blog', dto.startDate, dto.endDate);

    return this.cache.getOrCompute(key, async () => {
      const [
        totalPublished,
        pendingReview,
        totalComments,
        totalViewsAgg,
        totalLikesAgg,
        topViewedPosts,
        byCategory,
      ] = await Promise.all([
        this.prisma.blogPost.count({
          where: { status: BlogPostStatus.PUBLISHED },
        }),
        this.prisma.blogPost.count({
          where: { status: BlogPostStatus.PENDING_REVIEW },
        }),
        this.prisma.blogComment.count(),
        this.prisma.blogPost.aggregate({ _sum: { viewCount: true } }),
        this.prisma.blogPost.aggregate({ _sum: { likeCount: true } }),
        this.prisma.blogPost.findMany({
          where: { status: BlogPostStatus.PUBLISHED },
          orderBy: { viewCount: 'desc' },
          take: 10,
          select: {
            id: true,
            title: true,
            slug: true,
            viewCount: true,
            likeCount: true,
          },
        }),
        this.prisma.blogPost.groupBy({
          by: ['categoryId'],
          where: { status: BlogPostStatus.PUBLISHED },
          _count: true,
        }),
      ]);

      const categoryIds = byCategory.map((c) => c.categoryId);
      const categories = await this.prisma.blogCategory.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      });

      const postsByCategory = byCategory.map((c) => {
        const cat = categories.find((cc) => cc.id === c.categoryId);
        return { category: cat?.name ?? 'Unknown', count: c._count };
      });

      return {
        totalPublished,
        pendingReview,
        totalComments,
        totalViews: totalViewsAgg._sum.viewCount ?? 0,
        totalLikes: totalLikesAgg._sum.likeCount ?? 0,
        topViewedPosts,
        postsByCategory,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  // ── SYSTEM ─────────────────────────────────────────────────

  async getSystemStats() {
    const key = this.cache.buildKey('system');

    return this.cache.getOrCompute(key, async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        notificationsSentToday,
        failedNotificationsToday,
        webhookEventsToday,
      ] = await Promise.all([
        this.prisma.notification.count({
          where: { sentAt: { gte: today } },
        }),
        this.prisma.notification.count({
          where: { failedAt: { gte: today } },
        }),
        this.prisma.paddleWebhookEvent.count({
          where: { receivedAt: { gte: today } },
        }),
      ]);

      return {
        notificationsSentToday,
        failedNotificationsToday,
        webhookEventsToday,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  @Cron('*/2 * * * *') // every 2 minutes
  async prewarmCache() {
    this.logger.log('Pre-warming stats cache...');

    try {
      await Promise.all([
        this.getOverview(),
        this.getUserStats({}),
        this.getRevenueStats({}),
        this.getSubscriptionStats({}),
        this.getProposalStats({}),
        this.getTemplateStats({}),
        this.getGuruStats({}),
        this.getBlogStats({}),
        this.getSystemStats(),
      ]);

      this.logger.log('Stats cache pre-warmed successfully.');
    } catch (error) {
      this.logger.error('Failed to pre-warm stats cache', error);
    }
  }
}
