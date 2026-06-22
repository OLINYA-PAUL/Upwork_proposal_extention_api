import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.interface';
import { ConfigService } from '@nestjs/config';

class ResendOtpDto {
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  // ── COOKIE HELPER ───────────────────────────────────────

  private setTokenCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    // Access token cookie — 15 minutes
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes in ms
    });

    // Refresh token cookie — 7 days
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
      path: '/api/v1/auth/refresh', // Only sent to refresh endpoint
    });
  }

  private clearTokenCookies(res: Response): void {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    res.clearCookie('access_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
    });

    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/api/v1/auth/refresh',
    });
  }

  // ── REGISTER ────────────────────────────────────────────

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ── VERIFY OTP ──────────────────────────────────────────

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyOtp(dto);

    this.setTokenCookies(
      res,
      result.tokens.accessToken,
      result.tokens.refreshToken,
    );

    return {
      message: result.message,
      user: result.user,
    };
  }

  // ── RESEND OTP ──────────────────────────────────────────

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto.email);
  }

  // ── LOGIN ───────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);

    this.setTokenCookies(
      res,
      result.tokens.accessToken,
      result.tokens.refreshToken,
    );

    return {
      message: result.message,
      user: result.user,
    };
  }

  // ── REFRESH TOKEN ───────────────────────────────────────

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token;
    const userId = req.cookies?.access_token
      ? this.extractUserIdFromExpiredToken(req.cookies.access_token)
      : null;

    if (!refreshToken || !userId) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    const result = await this.authService.refreshToken(userId, refreshToken);

    this.setTokenCookies(
      res,
      result.tokens.accessToken,
      result.tokens.refreshToken,
    );

    return { message: result.message };
  }

  // ── LOGOUT ──────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    // 1. Clear Redis refresh token — kills all sessions
    await this.authService.logout(user.sub);

    // 2. Clear both cookies — prevents reuse of old tokens
    this.clearTokenCookies(res);

    return { message: 'Logged out successfully.' };
  }

  // ── FORGOT PASSWORD ─────────────────────────────────────

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  // ── RESET PASSWORD ──────────────────────────────────────

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.resetPassword(dto);

    // Clear all cookies — force fresh login after password reset
    this.clearTokenCookies(res);

    return result;
  }

  // ── PRIVATE HELPERS ─────────────────────────────────────

  private extractUserIdFromExpiredToken(token: string): string | null {
    try {
      // Decode without verification to get userId from expired token
      const decoded = require('jsonwebtoken').decode(token) as JwtPayload;
      return decoded?.sub || null;
    } catch {
      return null;
    }
  }
}
