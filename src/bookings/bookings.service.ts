import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { getPaginationParams, paginate } from '../helpers/pagination.helper';
import {
  BookingStatus,
  CancellationStatus,
  DisputeStatus,
  GuruStatus,
  NotificationType,
} from '@prisma/client';
import { Paddle, Environment } from '@paddle/paddle-node-sdk';
import { AddMeetingLinkDto } from './dto/add-meeting-link.dto';
import { CancellationRequestDto } from './dto/cancellation-request.dto';
import { DisputeRequestDto } from './dto/dispute-request.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

const PLATFORM_FEE_PERCENT = 0.3; // 30%
const GURU_EARNINGS_PERCENT = 0.7; // 70%

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  private readonly paddle: Paddle;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {
    this.paddle = new Paddle(this.config.get<string>('PADDLE_API_KEY')!, {
      environment: Environment.sandbox,
    });
  }

  // ── CREATE BOOKING + PADDLE CHECKOUT ───────────────────

  async createBooking(
    userId: string,
    userEmail: string,
    dto: CreateBookingDto,
  ): Promise<{ checkoutUrl: string }> {
    const guru = await this.prisma.guru.findUnique({
      where: { id: dto.guruId },
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    if (!guru) throw new NotFoundException('Guru not found');

    if (guru.status !== GuruStatus.APPROVED) {
      throw new BadRequestException(
        'This guru is not currently accepting bookings',
      );
    }

    // Prevent guru from booking themselves
    if (guru.userId === userId) {
      throw new ForbiddenException('You cannot book a session with yourself');
    }

    // Validate scheduled time is in the future
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt <= new Date()) {
      throw new BadRequestException('Scheduled time must be in the future');
    }

    // Calculate amounts
    const amountUsd = guru.sessionRate;
    const platformFeeUsd =
      Math.round(amountUsd * PLATFORM_FEE_PERCENT * 100) / 100;
    const guruEarningsUsd =
      Math.round(amountUsd * GURU_EARNINGS_PERCENT * 100) / 100;

    // Get or create Paddle customer
    let customerId = await this.getPaddleCustomerId(userId);
    if (!customerId) {
      customerId = await this.createPaddleCustomer(userId, userEmail);
    }

    try {
      const transaction = await this.paddle.transactions.create({
        items: [
          {
            price: {
              description: `GeniusBid Coaching Session — ${dto.sessionType}`,
              taxMode: 'account_setting',
              unitPrice: {
                amount: String(Math.round(amountUsd * 100)),
                currencyCode: 'USD',
              },
              product: {
                name: 'GeniusBid Coaching Session',
                taxCategory: 'saas',
              },
            },
            quantity: 1,
          },
        ],
        customerId,
        customData: {
          type: 'booking',
          userId,
          guruId: dto.guruId,
          sessionType: dto.sessionType,
          scheduledAt: dto.scheduledAt,
          amountUsd,
          platformFeeUsd,
          guruEarningsUsd,
        },
      });

      const checkoutUrl = transaction.checkout?.url;

      if (!checkoutUrl) {
        throw new InternalServerErrorException(
          'Failed to generate checkout URL',
        );
      }

      this.logger.log(
        `Booking checkout created — user: ${userId} guru: ${dto.guruId}`,
      );

      return { checkoutUrl };
    } catch (error) {
      this.logger.error(`Failed to create booking checkout`, error);
      throw new InternalServerErrorException(
        'Failed to create booking. Please try again.',
      );
    }
  }

  // ── CONFIRM BOOKING AFTER PAYMENT ──────────────────────

  async confirmBookingAfterPayment(data: any): Promise<void> {
    const {
      userId,
      guruId,
      sessionType,
      scheduledAt,
      amountUsd,
      platformFeeUsd,
      guruEarningsUsd,
    } = data.customData;

    const [user, guru] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      }),
      this.prisma.guru.findUnique({
        where: { id: guruId },
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);

    if (!user || !guru) return;

    // Create booking
    const booking = await this.prisma.booking.create({
      data: {
        userId,
        guruId,
        sessionType,
        scheduledAt: new Date(scheduledAt),
        amountUsd,
        platformFeeUsd,
        guruEarningsUsd,
        paddleTransactionId: data.id,
        status: BookingStatus.PAID,
      },
    });

    // Send emails
    await Promise.all([
      this.mail.sendBookingConfirmation(
        user.email,
        user.name,
        guru.user.name,
        sessionType,
        new Date(scheduledAt).toDateString(),
        amountUsd,
      ),
      this.mail.sendNewBookingToGuru(
        guru.user.email,
        guru.user.name,
        user.name,
        sessionType,
        new Date(scheduledAt).toDateString(),
        guruEarningsUsd,
      ),
    ]);

    // Send in-app notifications
    await Promise.all([
      this.notifications.createAndSend({
        userId,
        type: NotificationType.BOOKING_CONFIRMED,
        title: 'Booking Confirmed',
        body: `Your session with ${guru.user.name} has been confirmed for ${new Date(scheduledAt).toDateString()}.`,
      }),
      this.notifications.createAndSend({
        userId: guru.userId,
        type: NotificationType.BOOKING_CONFIRMED,
        title: 'New Booking',
        body: `${user.name} has booked a ${sessionType} session with you for ${new Date(scheduledAt).toDateString()}.`,
      }),
    ]);

    this.logger.log(`Booking confirmed — booking: ${booking.id}`);
  }

  // ── GET USER BOOKINGS ───────────────────────────────────

  async getUserBookings(userId: string, page: number = 1, limit: number = 10) {
    const { skip, take } = getPaginationParams(page, limit);

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          guru: {
            include: { user: { select: { name: true, avatarUrl: true } } },
          },
        },
      }),
      this.prisma.booking.count({ where: { userId } }),
    ]);

    return paginate(bookings, total, page, limit);
  }

  // ── GET GURU BOOKINGS ───────────────────────────────────

  async getGuruBookings(userId: string, page: number = 1, limit: number = 10) {
    const guru = await this.prisma.guru.findUnique({ where: { userId } });
    if (!guru) throw new NotFoundException('Guru profile not found');

    const { skip, take } = getPaginationParams(page, limit);

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where: { guruId: guru.id },
        orderBy: { scheduledAt: 'asc' },
        skip,
        take,
        include: {
          user: { select: { name: true, email: true, avatarUrl: true } },
        },
      }),
      this.prisma.booking.count({ where: { guruId: guru.id } }),
    ]);

    return paginate(bookings, total, page, limit);
  }

  // ── ADD MEETING LINK ────────────────────────────────────

  async addMeetingLink(
    bookingId: string,
    userId: string,
    dto: AddMeetingLinkDto,
  ) {
    const guru = await this.prisma.guru.findUnique({ where: { userId } });
    if (!guru) throw new NotFoundException('Guru profile not found');

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.guruId !== guru.id) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    if (booking.status !== BookingStatus.PAID) {
      throw new BadRequestException(
        'Meeting link can only be added to paid bookings',
      );
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { meetingLink: dto.meetingLink },
    });

    // Send email + notification to user
    await this.mail.sendMeetingLinkAdded(
      booking.user.email,
      booking.user.name,
      booking.sessionType,
      booking.scheduledAt.toDateString(),
      dto.meetingLink,
    );

    await this.notifications.createAndSend({
      userId: booking.userId,
      type: NotificationType.BOOKING_CONFIRMED,
      title: 'Meeting Link Added',
      body: `Your guru has added a meeting link for your session on ${booking.scheduledAt.toDateString()}.`,
    });

    this.logger.log(`Meeting link added — booking: ${bookingId}`);

    return { message: 'Meeting link added successfully.' };
  }

  // ── MARK SESSION COMPLETED ──────────────────────────────

  async markCompleted(bookingId: string, userId: string, isAdmin: boolean) {
    const guru = isAdmin
      ? null
      : await this.prisma.guru.findUnique({ where: { userId } });

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    if (!isAdmin && guru && booking.guruId !== guru.id) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    if (booking.status !== BookingStatus.PAID) {
      throw new BadRequestException(
        'Only paid bookings can be marked as completed',
      );
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.COMPLETED },
    });

    // Notify user to leave a review
    await this.notifications.createAndSend({
      userId: booking.userId,
      type: NotificationType.BOOKING_CONFIRMED,
      title: 'Session Completed',
      body: 'Your session has been marked as completed. Please leave a review for your guru.',
    });

    this.logger.log(`Booking completed — booking: ${bookingId}`);

    return { message: 'Session marked as completed.' };
  }

  // ── REQUEST CANCELLATION ────────────────────────────────

  async requestCancellation(
    bookingId: string,
    userId: string,
    dto: CancellationRequestDto,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== userId) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    if (booking.status !== BookingStatus.PAID) {
      throw new BadRequestException('Only paid bookings can be canceled');
    }

    if (booking.cancellationStatus === CancellationStatus.PENDING) {
      throw new ConflictException('A cancellation request is already pending');
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        cancellationReason: dto.reason,
        cancellationStatus: CancellationStatus.PENDING,
        canceledBy: userId,
        canceledAt: new Date(),
      },
    });

    // Notify admins
    await this.notifications.notifyAdmins({
      type: NotificationType.BOOKING_CANCELLED,
      title: 'Cancellation Request',
      body: `A user has requested cancellation for booking ${bookingId}.`,
    });

    this.logger.log(`Cancellation requested — booking: ${bookingId}`);

    return {
      message: 'Cancellation request submitted. Admin will review it shortly.',
    };
  }

  // ── ADMIN: APPROVE CANCELLATION ─────────────────────────

  async adminApproveCancellation(bookingId: string, adminId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    if (booking.cancellationStatus !== CancellationStatus.PENDING) {
      throw new BadRequestException('No pending cancellation request found');
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationStatus: CancellationStatus.APPROVED,
      },
    });

    await this.notifications.createAndSend({
      userId: booking.userId,
      type: NotificationType.BOOKING_CANCELLED,
      title: 'Cancellation Approved',
      body: 'Your cancellation request has been approved. A full refund will be processed manually.',
    });

    this.logger.log(
      `Cancellation approved — booking: ${bookingId} by admin: ${adminId}`,
    );

    return {
      message:
        'Cancellation approved. Please process the refund manually via Paddle.',
    };
  }

  // ── ADMIN: REJECT CANCELLATION ──────────────────────────

  async adminRejectCancellation(bookingId: string, adminId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    if (booking.cancellationStatus !== CancellationStatus.PENDING) {
      throw new BadRequestException('No pending cancellation request found');
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { cancellationStatus: CancellationStatus.REJECTED },
    });

    await this.notifications.createAndSend({
      userId: booking.userId,
      type: NotificationType.BOOKING_CANCELLED,
      title: 'Cancellation Rejected',
      body: 'Your cancellation request has been reviewed and rejected. The session will proceed as scheduled.',
    });

    this.logger.log(
      `Cancellation rejected — booking: ${bookingId} by admin: ${adminId}`,
    );

    return { message: 'Cancellation request rejected.' };
  }

  // ── SUBMIT DISPUTE ──────────────────────────────────────

  async submitDispute(
    bookingId: string,
    userId: string,
    dto: DisputeRequestDto,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== userId) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    if (booking.disputeStatus === DisputeStatus.PENDING) {
      throw new BadRequestException(
        'A dispute is already pending for this booking',
      );
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        disputeReason: dto.reason,
        disputeStatus: DisputeStatus.PENDING,
        disputeRaisedAt: new Date(),
      },
    });

    await this.notifications.notifyAdmins({
      type: NotificationType.BOOKING_CANCELLED,
      title: 'New Dispute',
      body: `A user has raised a dispute for booking ${bookingId}.`,
    });

    this.logger.log(`Dispute submitted — booking: ${bookingId}`);

    return { message: 'Dispute submitted. Admin will review it shortly.' };
  }

  // ── ADMIN: RESOLVE DISPUTE ──────────────────────────────

  async adminResolveDispute(
    bookingId: string,
    resolution: 'REFUNDED' | 'REJECTED',
    adminId: string,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    if (booking.disputeStatus !== DisputeStatus.PENDING) {
      throw new BadRequestException(
        'No pending dispute found for this booking',
      );
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        disputeStatus: resolution as DisputeStatus,
        ...(resolution === 'REFUNDED' && { status: BookingStatus.CANCELLED }),
      },
    });

    const message =
      resolution === 'REFUNDED'
        ? 'Your dispute has been resolved in your favour. A full refund will be processed manually.'
        : 'Your dispute has been reviewed. The decision was made in favour of the guru.';

    await this.notifications.createAndSend({
      userId: booking.userId,
      type: NotificationType.BOOKING_CONFIRMED,
      title: 'Dispute Resolved',
      body: message,
    });

    this.logger.log(
      `Dispute resolved — booking: ${bookingId} resolution: ${resolution} by admin: ${adminId}`,
    );

    return {
      message: `Dispute resolved as ${resolution}.${resolution === 'REFUNDED' ? ' Please process the refund manually via Paddle.' : ''}`,
    };
  }

  // ── ADMIN: GET ALL BOOKINGS ─────────────────────────────

  async adminGetAllBookings(page: number = 1, limit: number = 20) {
    const { skip, take } = getPaginationParams(page, limit);

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: { select: { name: true, email: true } },
          guru: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      }),
      this.prisma.booking.count(),
    ]);

    return paginate(bookings, total, page, limit);
  }

  // ── PRIVATE HELPERS ─────────────────────────────────────

  private async getPaddleCustomerId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { paddleCustomerId: true },
    });
    return user?.paddleCustomerId ?? null;
  }

  private async createPaddleCustomer(
    userId: string,
    email: string,
  ): Promise<string> {
    const customer = await this.paddle.customers.create({
      email,
      customData: { userId },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { paddleCustomerId: customer.id },
    });
    return customer.id;
  }
}
