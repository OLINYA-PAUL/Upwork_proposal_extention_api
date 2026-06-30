import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApplyGuruDto } from './dto/apply-guru.dto';
import { RejectGuruDto } from './dto/reject-guru.dto';
import { UpdateGuruProfileDto } from './dto/update-guru-profile.dto';
import { ReviewGuruDto } from './dto/review-guru.dto';
import { toPublicGuru, toGuruProfile } from './dto/guru-response.dto';
import { getPaginationParams, paginate } from '../helpers/pagination.helper';
import { GuruStatus, NotificationType, Role } from '@prisma/client';

@Injectable()
export class GurusService {
  private readonly logger = new Logger(GurusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  // ── APPLY TO BECOME GURU ────────────────────────────────

  async apply(userId: string, dto: ApplyGuruDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, role: true },
    });

    if (!user) throw new NotFoundException('User not found');

    if (user.role === Role.GURU) {
      throw new ConflictException('You are already a guru');
    }

    if (user.role === Role.ADMIN) {
      throw new ForbiddenException('Admins cannot apply to become a guru');
    }

    // Check for existing pending application
    const existingPending = await this.prisma.guruApplication.findFirst({
      where: { userId, status: GuruStatus.PENDING },
    });

    if (existingPending) {
      throw new ConflictException(
        'You already have a pending application under review',
      );
    }

    // Check 7-day cooldown after rejection
    const lastRejected = await this.prisma.guruApplication.findFirst({
      where: { userId, status: GuruStatus.SUSPENDED },
      orderBy: { rejectedAt: 'desc' },
    });

    if (lastRejected?.rejectedAt) {
      const daysSinceRejection =
        (Date.now() - new Date(lastRejected.rejectedAt).getTime()) /
        (1000 * 60 * 60 * 24);

      if (daysSinceRejection < 7) {
        const daysRemaining = Math.ceil(7 - daysSinceRejection);
        throw new BadRequestException(
          `You must wait ${daysRemaining} more day${daysRemaining > 1 ? 's' : ''} before reapplying`,
        );
      }
    }

    // Create application
    const application = await this.prisma.guruApplication.create({
      data: {
        userId,
        specialty: dto.specialty,
        bio: dto.bio,
        upworkProfileUrl: dto.upworkProfileUrl,
        sessionRate: dto.sessionRate,
        status: GuruStatus.PENDING,
      },
    });

    // Send email + notification
    await this.mail.sendGuruApplicationReceived(
      user.email,
      user.name,
      dto.specialty,
      dto.sessionRate,
    );

    await this.notifications.createAndSend({
      userId,
      type: NotificationType.BOOKING_CONFIRMED,
      title: 'Guru Application Submitted',
      body: 'Your application to become a guru is under review. We will notify you within 2-3 business days.',
    });

    // Notify admins
    await this.notifications.notifyAdmins({
      type: NotificationType.BOOKING_CONFIRMED,
      title: 'New Guru Application',
      body: `${user.name} has applied to become a guru.`,
    });

    this.logger.log(`Guru application submitted — user: ${userId}`);

    return {
      message:
        'Your application has been submitted successfully. We will review it within 2-3 business days.',
      applicationId: application.id,
    };
  }

  // ── GET MY GURU PROFILE ─────────────────────────────────

  async getMyProfile(userId: string) {
    const guru = await this.prisma.guru.findUnique({
      where: { userId },
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
      },
    });

    if (!guru) throw new NotFoundException('Guru profile not found');

    return toGuruProfile(guru);
  }

  // ── UPDATE MY GURU PROFILE ──────────────────────────────

  async updateMyProfile(userId: string, dto: UpdateGuruProfileDto) {
    const guru = await this.prisma.guru.findUnique({ where: { userId } });

    if (!guru) throw new NotFoundException('Guru profile not found');

    const updated = await this.prisma.guru.update({
      where: { userId },
      data: {
        ...(dto.specialty && { specialty: dto.specialty }),
        ...(dto.bio && { bio: dto.bio }),
        ...(dto.upworkProfileUrl && { upworkProfileUrl: dto.upworkProfileUrl }),
        ...(dto.sessionRate !== undefined && { sessionRate: dto.sessionRate }),
      },
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
      },
    });

    return toGuruProfile(updated);
  }

  // ── ADMIN: GET ALL APPLICATIONS ─────────────────────────

  async adminGetApplications(
    page: number = 1,
    limit: number = 20,
    status?: GuruStatus,
  ) {
    const { skip, take } = getPaginationParams(page, limit);
    const where: any = {};
    if (status) where.status = status;

    const [applications, total] = await Promise.all([
      this.prisma.guruApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: { select: { name: true, email: true, avatarUrl: true } },
        },
      }),
      this.prisma.guruApplication.count({ where }),
    ]);

    return paginate(applications, total, page, limit);
  }

  // ── ADMIN: APPROVE GURU ─────────────────────────────────

async adminApproveGuru(applicationId: string, adminId: string) {
  const application = await this.prisma.guruApplication.findUnique({
    where: { id: applicationId },
    include: { user: true },
  });

  if (!application) {
    throw new NotFoundException('Application not found');
  }

  if (application.status !== GuruStatus.PENDING) {
    throw new BadRequestException('This application has already been processed');
  }

  const existingGuru = await this.prisma.guru.findUnique({
    where: { userId: application.userId },
  });

  if (existingGuru) {
    throw new BadRequestException('This user already has a guru profile');
  }

  await this.prisma.$transaction(async (tx) => {
    await tx.guru.create({
      data: {
        userId: application.userId,
        specialty: application.specialty,
        bio: application.bio,
        upworkProfileUrl: application.upworkProfileUrl,
        sessionRate: application.sessionRate,
        status: GuruStatus.APPROVED,
      },
    });

    await tx.guruApplication.update({
      where: { id: applicationId },
      data: { status: GuruStatus.APPROVED },
    });

    await tx.user.update({
      where: { id: application.userId },
      data: { role: Role.GURU },
    });
  });

  await this.mail.sendGuruApplicationApproved(
    application.user.email,
    application.user.name,
  );

  await this.notifications.createAndSend({
    userId: application.userId,
    type: NotificationType.BOOKING_CONFIRMED,
    title: 'Guru Application Approved',
    body: 'Congratulations! Your guru application has been approved. Your profile is now live on the marketplace.',
  });

  this.logger.log(
    `Guru approved — application: ${applicationId} by admin: ${adminId}`,
  );

  return { message: 'Guru application approved successfully.' };
}

  // ── ADMIN: REJECT GURU ──────────────────────────────────

  async adminRejectGuru(
    applicationId: string,
    dto: RejectGuruDto,
    adminId: string,
  ) {
    const application = await this.prisma.guruApplication.findUnique({
      where: { id: applicationId },
      include: { user: true },
    });

    if (!application) throw new NotFoundException('Application not found');

    if (application.status !== GuruStatus.PENDING) {
      throw new BadRequestException(
        'This application has already been processed',
      );
    }

    await this.prisma.guruApplication.update({
      where: { id: applicationId },
      data: {
        status: GuruStatus.SUSPENDED,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
      },
    });

    await this.mail.sendGuruApplicationRejected(
      application.user.email,
      application.user.name,
      dto.reason,
    );

    await this.notifications.createAndSend({
      userId: application.userId,
      type: NotificationType.BOOKING_CANCELLED,
      title: 'Guru Application Update',
      body: 'Your guru application was not approved at this time. You may reapply after 7 days.',
    });

    this.logger.log(
      `Guru rejected — application: ${applicationId} by admin: ${adminId}`,
    );

    return { message: 'Guru application rejected.' };
  }

  // ── ADMIN: SUSPEND GURU ─────────────────────────────────

  async adminSuspendGuru(guruId: string, adminId: string) {
    const guru = await this.prisma.guru.findUnique({
      where: { id: guruId },
      include: { user: true },
    });

    if (!guru) throw new NotFoundException('Guru not found');

    if (guru.status === GuruStatus.SUSPENDED) {
      throw new BadRequestException('Guru is already suspended');
    }

    await this.prisma.guru.update({
      where: { id: guruId },
      data: { status: GuruStatus.SUSPENDED },
    });

    await this.notifications.createAndSend({
      userId: guru.userId,
      type: NotificationType.BOOKING_CANCELLED,
      title: 'Guru Account Suspended',
      body: 'Your guru profile has been suspended. Existing bookings will be honoured but no new bookings will be accepted.',
    });

    this.logger.log(`Guru suspended — guru: ${guruId} by admin: ${adminId}`);

    return { message: 'Guru has been suspended successfully.' };
  }

  // ── ADMIN: REINSTATE GURU ───────────────────────────────

  async adminReinstateGuru(guruId: string, adminId: string) {
    const guru = await this.prisma.guru.findUnique({ where: { id: guruId } });

    if (!guru) throw new NotFoundException('Guru not found');

    if (guru.status === GuruStatus.APPROVED) {
      throw new BadRequestException('Guru is already active');
    }

    await this.prisma.guru.update({
      where: { id: guruId },
      data: { status: GuruStatus.APPROVED },
    });

    this.logger.log(`Guru reinstated — guru: ${guruId} by admin: ${adminId}`);

    return { message: 'Guru has been reinstated successfully.' };
  }

  // ── ADMIN: GET ALL GURUS ────────────────────────────────

  async adminGetAllGurus(page: number = 1, limit: number = 20) {
    const { skip, take } = getPaginationParams(page, limit);

    const [gurus, total] = await Promise.all([
      this.prisma.guru.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: { select: { name: true, email: true, avatarUrl: true } },
        },
      }),
      this.prisma.guru.count(),
    ]);

    return paginate(gurus.map(toGuruProfile), total, page, limit);
  }

  // ── PUBLIC: GET ALL APPROVED GURUS ─────────────────────

  async getPublicGurus(
    page: number = 1,
    limit: number = 20,
    specialty?: string,
  ) {
    const { skip, take } = getPaginationParams(page, limit);

    const where: any = { status: GuruStatus.APPROVED };
    if (specialty) {
      where.specialty = { has: specialty };
    }

    const [gurus, total] = await Promise.all([
      this.prisma.guru.findMany({
        where,
        orderBy: { rating: 'desc' },
        skip,
        take,
        include: {
          user: { select: { name: true, avatarUrl: true } },
        },
      }),
      this.prisma.guru.count({ where }),
    ]);

    return paginate(gurus.map(toPublicGuru), total, page, limit);
  }

  // ── PUBLIC: GET SINGLE GURU ─────────────────────────────

  async getPublicGuru(guruId: string) {
    const guru = await this.prisma.guru.findUnique({
      where: { id: guruId },
      include: {
        user: { select: { name: true, avatarUrl: true } },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            user: { select: { name: true, avatarUrl: true } },
          },
        },
      },
    });

    if (!guru || guru.status !== GuruStatus.APPROVED) {
      throw new NotFoundException('Guru not found');
    }

    return {
      ...toPublicGuru(guru),
      reviews: guru.reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        user: r.user,
        createdAt: r.createdAt,
      })),
    };
  }

  // ── SUBMIT REVIEW ───────────────────────────────────────

  async submitReview(guruId: string, userId: string, dto: ReviewGuruDto) {
    const guru = await this.prisma.guru.findUnique({ where: { id: guruId } });

    if (!guru || guru.status !== GuruStatus.APPROVED) {
      throw new NotFoundException('Guru not found');
    }

    // Check user has a completed booking with this guru
    const completedBooking = await this.prisma.booking.findFirst({
      where: {
        userId,
        guruId,
        status: 'COMPLETED',
      },
    });

    if (!completedBooking) {
      throw new ForbiddenException(
        'You can only review a guru after completing a session with them',
      );
    }

    // Check for existing review
    const existingReview = await this.prisma.review.findUnique({
      where: { userId_guruId: { userId, guruId } },
    });

    if (existingReview) {
      throw new ConflictException('You have already reviewed this guru');
    }

    // Create review
    await this.prisma.review.create({
      data: { userId, guruId, rating: dto.rating, comment: dto.comment },
    });

    // Recalculate guru rating
    const allReviews = await this.prisma.review.findMany({
      where: { guruId },
      select: { rating: true },
    });

    const avgRating =
      allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

    await this.prisma.guru.update({
      where: { id: guruId },
      data: {
        rating: Math.round(avgRating * 10) / 10,
        reviewCount: allReviews.length,
      },
    });

    this.logger.log(`Review submitted — guru: ${guruId} by user: ${userId}`);

    return { message: 'Review submitted successfully.' };
  }

  // ── GET GURU REVIEWS ────────────────────────────────────

  async getGuruReviews(guruId: string, page: number = 1, limit: number = 10) {
    const { skip, take } = getPaginationParams(page, limit);

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { guruId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: { select: { name: true, avatarUrl: true } },
        },
      }),
      this.prisma.review.count({ where: { guruId } }),
    ]);

    return paginate(reviews, total, page, limit);
  }
}
