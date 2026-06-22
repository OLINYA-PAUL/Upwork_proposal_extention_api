import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { JwtPayload } from '../common/types/jwt-payload.interface';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignOptions } from 'jsonwebtoken';
import { FingerprintHelper } from '../helpers/fingerprint.helper';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 12;
  private readonly OTP_TTL = 600;
  private readonly RESET_RATE_LIMIT_TTL = 3600;
  private readonly MAX_RESET_REQUESTS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly fingerprintHelper: FingerprintHelper,
  ) {}

  // ── REGISTER ────────────────────────────────────────────

  async register(dto: RegisterDto) {
    // Check if email already exists
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      if (existing.deletedAt) {
        throw new ForbiddenException(
          'This account has been deactivated. Please contact support to reactivate.',
        );
      }
      throw new ConflictException('An account with this email already exists');
    }

    // ── FINGERPRINT CHECK ──────────────────────────────────
    let hashedFingerprint: string | null = null;

    if (dto.userAgent && dto.platform) {
      hashedFingerprint = this.fingerprintHelper.hash({
        userAgent: dto.userAgent,
        language: dto.language || '',
        timezone: dto.timezone || '',
        screenResolution: dto.screenResolution || '',
        platform: dto.platform,
        colorDepth: dto.colorDepth || '',
        extensionId: dto.extensionId,
      });

      // Check if this device already used a trial
      const existingFingerprint =
        await this.prisma.deviceFingerprint.findUnique({
          where: { fingerprint: hashedFingerprint },
        });

      if (existingFingerprint) {
        // Device already registered — allow registration but
        // flag them — no trial will be given on first use
        this.logger.warn(
          `Device fingerprint already exists for new registration: ${hashedFingerprint}`,
        );
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);
    const otp = this.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, this.SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        emailVerified: false,
        // Store fingerprint on user for later trial check
        ...(hashedFingerprint && { fingerprint: hashedFingerprint }),
      },
    });

    await this.redis.setOtp(dto.email, hashedOtp, this.OTP_TTL);
    await this.mail.sendOtp(dto.email, dto.name, otp, 'verification');

    this.logger.log(`New user registered: ${dto.email}`);

    return {
      message:
        'Registration successful. Please check your email for the OTP verification code.',
      email: user.email,
    };
  }

  // ── VERIFY OTP ──────────────────────────────────────────

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.findActiveUser(dto.email);

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    await this.validateOtp(dto.email, dto.otp);

    await this.prisma.user.update({
      where: { email: dto.email },
      data: { emailVerified: true },
    });

    await this.redis.deleteOtp(dto.email);

    const tokens = await this.generateAndStoreTokens(
      user.id,
      user.email,
      user.plan,
      user.role,
    );

    this.logger.log(`Email verified for: ${dto.email}`);

    return {
      message: 'Email verified successfully.',
      tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
      },
    };
  }

  // ── RESEND OTP ──────────────────────────────────────────

  async resendOtp(email: string) {
    const user = await this.findActiveUser(email);

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    const otp = this.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, this.SALT_ROUNDS);

    await this.redis.setOtp(email, hashedOtp, this.OTP_TTL);
    await this.mail.sendOtp(email, user.name, otp, 'verification');

    this.logger.log(`OTP resent to: ${email}`);

    return { message: 'A new OTP has been sent to your email.' };
  }

  // ── LOGIN ───────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.findActiveUser(dto.email);

    if (!user.emailVerified) {
      const otp = this.generateOtp();
      const hashedOtp = await bcrypt.hash(otp, this.SALT_ROUNDS);
      await this.redis.setOtp(dto.email, hashedOtp, this.OTP_TTL);
      await this.mail.sendOtp(dto.email, user.name, otp, 'verification');

      throw new UnauthorizedException(
        'Email not verified. A new OTP has been sent to your email.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateAndStoreTokens(
      user.id,
      user.email,
      user.plan,
      user.role,
    );

    this.logger.log(`User logged in: ${dto.email}`);

    return {
      message: 'Login successful.',
      tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
      },
    };
  }

  // ── REFRESH TOKEN ───────────────────────────────────────

  async refreshToken(userId: string, incomingRefreshToken: string) {
    const storedHash = await this.redis.getRefreshToken(userId);

    if (!storedHash) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    const isValid = await bcrypt.compare(incomingRefreshToken, storedHash);
    if (!isValid) {
      await this.redis.deleteRefreshToken(userId);
      throw new UnauthorizedException(
        'Invalid refresh token. Please log in again.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        plan: true,
        deletedAt: true,
        role: true,
      },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User not found or account deactivated.');
    }

    await this.redis.deleteRefreshToken(userId);
    const tokens = await this.generateAndStoreTokens(
      user.id,
      user.email,
      user.plan,
      user.role,
    );

    return {
      message: 'Token refreshed successfully.',
      tokens,
    };
  }

  // ── LOGOUT ──────────────────────────────────────────────

  async logout(userId: string) {
    await this.redis.deleteRefreshToken(userId);
    this.logger.log(`User logged out: ${userId}`);
    return { message: 'Logged out successfully.' };
  }

  // ── FORGOT PASSWORD ─────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.findActiveUser(dto.email);

    const rateLimitKey = `reset_rate:${dto.email}`;
    const attempts = await this.redis.get(rateLimitKey);
    const currentAttempts = attempts ? parseInt(attempts) : 0;

    if (currentAttempts >= this.MAX_RESET_REQUESTS) {
      throw new BadRequestException(
        'Too many password reset requests. Please try again in 1 hour.',
      );
    }

    await this.redis.set(
      rateLimitKey,
      String(currentAttempts + 1),
      this.RESET_RATE_LIMIT_TTL,
    );

    const otp = this.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, this.SALT_ROUNDS);
    const resetKey = `reset_otp:${dto.email}`;
    await this.redis.set(resetKey, hashedOtp, this.OTP_TTL);

    await this.mail.sendOtp(dto.email, user.name, otp, 'password-reset');

    this.logger.log(`Password reset OTP sent to: ${dto.email}`);

    return {
      message: 'Password reset OTP has been sent to your email.',
    };
  }

  // ── RESET PASSWORD ──────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto) {
    const existingUser = await this.findActiveUser(dto.email);

    const resetKey = `reset_otp:${dto.email}`;
    const storedHash = await this.redis.get(resetKey);

    if (!storedHash) {
      throw new BadRequestException(
        'OTP has expired. Please request a new one.',
      );
    }

    const isValid = await bcrypt.compare(dto.otp, storedHash);

    if (!isValid) {
      throw new BadRequestException('Invalid OTP. Please check and try again.');
    }

    // Prevent reusing current password
    const isSamePassword = await bcrypt.compare(
      dto.newPassword,
      existingUser.passwordHash,
    );

    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from your current password.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, this.SALT_ROUNDS);

    const user = await this.prisma.user.update({
      where: { email: dto.email },
      data: { passwordHash },
    });

    await this.redis.del(resetKey);
    await this.redis.del(`reset_rate:${dto.email}`);
    await this.redis.deleteRefreshToken(user.id);

    this.logger.log(`Password reset successful for: ${dto.email}`);

    return {
      message:
        'Password reset successful. Please log in with your new password.',
    };
  }

  // ── PRIVATE HELPERS ─────────────────────────────────────

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async findActiveUser(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('No account found with this email address');
    }

    if (user.deletedAt) {
      throw new ForbiddenException(
        'This account has been deactivated. Please contact support to reactivate.',
      );
    }

    return user;
  }

  private async validateOtp(email: string, otp: string): Promise<void> {
    const storedHash = await this.redis.getOtp(email);

    if (!storedHash) {
      throw new BadRequestException(
        'OTP has expired. Please request a new one.',
      );
    }

    const isValid = await bcrypt.compare(otp, storedHash);
    if (!isValid) {
      throw new BadRequestException('Invalid OTP. Please check and try again.');
    }
  }

  async generateAndStoreTokens(
    userId: string,
    email: string,
    plan: string,
    role: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessPayload: JwtPayload = {
      sub: userId,
      email,
      plan,
      role,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
      sub: userId,
      email,
      plan,
      role,
      type: 'refresh',
    };

    const accessToken = jwt.sign(
      accessPayload,
      this.config.get<string>('JWT_ACCESS_SECRET')!,
      {
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m',
      } as SignOptions,
    );

    const refreshToken = jwt.sign(
      refreshPayload,
      this.config.get<string>('JWT_REFRESH_SECRET')!,
      {
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
      } as SignOptions,
    );

    const hashedRefreshToken = await bcrypt.hash(
      refreshToken,
      this.SALT_ROUNDS,
    );
    await this.redis.setRefreshToken(userId, hashedRefreshToken);

    return { accessToken, refreshToken };
  }
}
