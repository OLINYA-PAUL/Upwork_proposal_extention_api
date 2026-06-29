import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationType, NotificationChannel, Role } from '@prisma/client';
import { getPaginationParams, paginate } from '../helpers/pagination.helper';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  // ── CREATE AND SEND NOTIFICATION ────────────────────────

  async createAndSend(params: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    channel?: NotificationChannel;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        channel: params.channel ?? NotificationChannel.IN_APP,
        title: params.title,
        body: params.body,
        sentAt: new Date(),
      },
    });

    // Send via WebSocket in real time
    this.gateway.sendToUser(params.userId, {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      read: notification.read,
      createdAt: notification.createdAt,
    });

    return notification;
  }

  // ── NOTIFY ADMINS ────────────────────────────────────────

  async notifyAdmins(params: {
    type: NotificationType;
    title: string;
    body: string;
  }) {
    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, deletedAt: null },
      select: { id: true },
    });

    const adminIds = admins.map((a) => a.id);

    // Create notification for each admin
    await Promise.all(
      adminIds.map((adminId) =>
        this.createAndSend({
          userId: adminId,
          type: params.type,
          title: params.title,
          body: params.body,
        }),
      ),
    );
  }

  // ── GET USER NOTIFICATIONS ───────────────────────────────

  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const { skip, take } = getPaginationParams(page, limit);

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);

    return paginate(notifications, total, page, limit);
  }

  // ── GET UNREAD COUNT ────────────────────────────────────

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    });

    return { unreadCount: count };
  }

  // ── MARK SINGLE AS READ ─────────────────────────────────

  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });

    return { message: 'Notification marked as read.' };
  }

  // ── MARK ALL AS READ ────────────────────────────────────

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    return { message: 'All notifications marked as read.' };
  }

  // ── DELETE NOTIFICATION ─────────────────────────────────

  async deleteNotification(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    return { message: 'Notification deleted successfully.' };
  }

  // ── CRON: DELETE OLD NOTIFICATIONS ─────────────────────
  // Runs every day at midnight — deletes notifications older than 30 days

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async deleteOldNotifications() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.prisma.notification.deleteMany({
      where: {
        createdAt: { lt: thirtyDaysAgo },
      },
    });

    this.logger.log(
      `Cron: deleted ${result.count} notifications older than 30 days`,
    );
  }
}
