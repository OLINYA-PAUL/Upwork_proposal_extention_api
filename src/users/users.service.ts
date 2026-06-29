import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ImageKitHelper } from '../helpers/imagekit.helper';
import { UpdateUserDto } from './dto/update-user.dto';
import { AdminQueryDto } from './dto/admin-query.dto';
import {
  AdminUpdateRoleDto,
  AdminUpdatePlanDto,
} from './dto/admin-update-user.dto';
import { toUserResponse, toAdminUserResponse } from './dto/user-response.dto';
import { paginate, getPaginationParams } from '../helpers/pagination.helper';
import { Role, Plan } from '@prisma/client';
import { MailService } from 'src/mail/mail.service';
import { NotificationsService } from 'src/notifications/notifications.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly imagekitHelper: ImageKitHelper,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── GET CURRENT USER ────────────────────────────────────

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    return toUserResponse(user);
  }

  // ── UPDATE CURRENT USER ─────────────────────────────────

  async updateMe(
    userId: string,
    dto: UpdateUserDto,
    file?: Express.Multer.File,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    let avatarUrl = user.avatarUrl;
    let fileId = user.fileId;

    // Handle avatar upload if file is provided
    if (file) {
      // Delete old avatar from ImageKit if exists
      if (user.fileId) {
        await this.imagekitHelper.deleteAvatar(user.fileId);
      }

      // Upload new avatar
      const uploaded = await this.imagekitHelper.uploadAvatar(file, userId);
      avatarUrl = uploaded.avatarUrl;
      fileId = uploaded.fileId;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(file && { avatarUrl, fileId }),
      },
    });

    this.logger.log(`User updated: ${userId}`);

    return toUserResponse(updated);
  }

  // ── SOFT DELETE CURRENT USER ────────────────────────────

  async deleteMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });

    // Clear all sessions
    await this.redis.deleteRefreshToken(userId);

    this.logger.log(`User soft deleted: ${userId}`);

    return { message: 'Your account has been deactivated successfully.' };
  }

  // ── ADMIN: GET ALL USERS ────────────────────────────────

  async adminGetAllUsers(query: AdminQueryDto) {
    const { skip, take } = getPaginationParams(query.page, query.limit);

    const where: any = {};

    // Filter by role
    if (query.role) {
      where.role = query.role;
    }

    // Filter by plan
    if (query.plan) {
      where.plan = query.plan;
    }

    // Filter by status
    if (query.status === 'deleted') {
      where.deletedAt = { not: null };
    } else if (query.status === 'restricted') {
      where.restricted = true;
      where.deletedAt = null;
    } else if (query.status === 'active') {
      where.restricted = false;
      where.deletedAt = null;
    }

    // Search by name or email
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(
      users.map(toAdminUserResponse),
      total,
      query.page ?? 1,
      query.limit ?? 10,
    );
  }

  // ── ADMIN: GET SINGLE USER ──────────────────────────────

  async adminGetUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return toAdminUserResponse(user);
  }

  // ── ADMIN: RESTRICT USER ────────────────────────────────

  async adminRestrictUser(userId: string, adminId: string) {
    const user = await this.findUserForAdmin(userId);

    if (user.role === Role.ADMIN) {
      throw new ForbiddenException('Cannot restrict an admin account');
    }

    if (user.restricted) {
      throw new BadRequestException('User is already restricted');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { restricted: true },
    });

    // Force logout
    await this.redis.deleteRefreshToken(userId);

    // Notify user via email
    await this.mail.sendAccountRestricted(user.email, user.name);

    this.logger.log(`User restricted by admin ${adminId}: ${userId}`);

    return { message: 'User has been restricted successfully.' };
  }

  // ── ADMIN: UNRESTRICT USER ──────────────────────────────

  async adminUnrestrictUser(userId: string, adminId: string) {
    const user = await this.findUserForAdmin(userId);

    if (!user.restricted) {
      throw new BadRequestException('User is not restricted');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { restricted: false },
    });

    // Notify user via email
    await this.mail.sendAccountUnrestricted(user.email, user.name);

    this.logger.log(`User unrestricted by admin ${adminId}: ${userId}`);

    return { message: 'User restriction has been lifted successfully.' };
  }

  // ── ADMIN: SOFT DELETE USER ─────────────────────────────

  async adminSoftDeleteUser(userId: string, adminId: string) {
    const user = await this.findUserForAdmin(userId);

    if (user.role === Role.ADMIN) {
      throw new ForbiddenException('Cannot delete an admin account');
    }

    if (user.deletedAt) {
      throw new BadRequestException('User is already deleted');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });

    // Force logout
    await this.redis.deleteRefreshToken(userId);

    // Notify user via email
    await this.mail.sendAccountDeactivated(user.email, user.name);

    this.logger.log(`User soft deleted by admin ${adminId}: ${userId}`);

    return { message: 'User has been deleted successfully.' };
  }

  // ── ADMIN: RESTORE USER ─────────────────────────────────

  async adminRestoreUser(userId: string, adminId: string) {
    const user = await this.findUserForAdmin(userId);

    if (!user.deletedAt) {
      throw new BadRequestException('User is not deleted');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: null },
    });

    // Notify user via email
    await this.mail.sendAccountRestored(user.email, user.name);

    this.logger.log(`User restored by admin ${adminId}: ${userId}`);

    return { message: 'User has been restored successfully.' };
  }

  // ── ADMIN: CHANGE USER ROLE ─────────────────────────────

  async adminChangeRole(
    userId: string,
    dto: AdminUpdateRoleDto,
    adminId: string,
  ) {
    const user = await this.findUserForAdmin(userId);

    if (user.id === adminId) {
      throw new ForbiddenException('Cannot change your own role');
    }

    if (user.role === dto.role) {
      throw new BadRequestException(`User already has the ${dto.role} role`);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { role: dto.role },
    });

    // Force re-login so new role is reflected in JWT
    await this.redis.deleteRefreshToken(userId);

    this.logger.log(
      `User role changed to ${dto.role} by admin ${adminId}: ${userId}`,
    );

    return { message: `User role updated to ${dto.role} successfully.` };
  }

  // ── ADMIN: CHANGE USER PLAN ─────────────────────────────

  async adminChangePlan(
    userId: string,
    dto: AdminUpdatePlanDto,
    adminId: string,
  ) {
    const user = await this.findUserForAdmin(userId);

    if (user.plan === dto.plan) {
      throw new BadRequestException(`User already has the ${dto.plan} plan`);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { plan: dto.plan },
    });

    this.logger.log(
      `User plan changed to ${dto.plan} by admin ${adminId}: ${userId}`,
    );

    return { message: `User plan updated to ${dto.plan} successfully.` };
  }

  // ── ADMIN: FORCE LOGOUT USER ────────────────────────────

  async adminForceLogout(userId: string, adminId: string) {
    await this.findUserForAdmin(userId);

    await this.redis.deleteRefreshToken(userId);

    this.logger.log(`User force logged out by admin ${adminId}: ${userId}`);

    return { message: 'User has been logged out from all devices.' };
  }

  // ── ADMIN: EXPORT USERS CSV ─────────────────────────────

  async adminExportUsers(): Promise<string> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
      'ID',
      'Name',
      'Email',
      'Role',
      'Plan',
      'Email Verified',
      'Restricted',
      'Deleted',
      'Created At',
      'Last Login',
    ];

    const rows = users.map((user) => [
      user.id,
      user.name,
      user.email,
      user.role,
      user.plan,
      user.emailVerified ? 'Yes' : 'No',
      (user as any).restricted ? 'Yes' : 'No',
      user.deletedAt ? 'Yes' : 'No',
      user.createdAt.toISOString(),
      user.lastLoginAt ? user.lastLoginAt.toISOString() : 'Never',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    return csv;
  }

  // ── ADMIN: PERMANENT DELETE USER ───────────────────────────

  async adminPermanentDeleteUser(userId: string, adminId: string) {
    const user = await this.findUserForAdmin(userId);

    if (user.role === Role.ADMIN) {
      throw new ForbiddenException(
        'Cannot permanently delete an admin account',
      );
    }

    // Force logout first
    await this.redis.deleteRefreshToken(userId);

    // Delete avatar from ImageKit if exists
    if (user.fileId) {
      await this.imagekitHelper.deleteAvatar(user.fileId);
    }

    // Hard delete — removes all cascaded data
    // (proposals, bookings, reviews, notifications, purchasedTemplates)
    await this.prisma.user.delete({
      where: { id: userId },
    });

    this.logger.log(`User permanently deleted by admin ${adminId}: ${userId}`);

    return {
      message: 'User and all associated data have been permanently deleted.',
    };
  }

  // ── PRIVATE HELPERS ─────────────────────────────────────

  private async findUserForAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
