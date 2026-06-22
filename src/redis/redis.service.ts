import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const password = this.configService.get<string>('REDIS_PASSWORD');

    this.client = new Redis({
      host: this.configService.get<string>('REDIS_HOST') || '127.0.0.1',
      port: this.configService.get<number>('REDIS_PORT') || 6379,
      // Only pass password if it actually exists
      ...(password && password.trim() !== '' ? { password } : {}),
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error('Redis error', err));
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('Redis disconnected');
  }

  // Store OTP with TTL in seconds (default: 10 minutes)
  async setOtp(email: string, otp: string, ttlSeconds = 600): Promise<void> {
    await this.client.set(`otp:${email}`, otp, 'EX', ttlSeconds);
  }

  // Retrieve OTP — returns null if expired or not found
  async getOtp(email: string): Promise<string | null> {
    return this.client.get(`otp:${email}`);
  }

  // Delete OTP after successful verification
  async deleteOtp(email: string): Promise<void> {
    await this.client.del(`otp:${email}`);
  }

  // Store refresh token with TTL (default: 7 days)
  async setRefreshToken(
    userId: string,
    token: string,
    ttlSeconds = 604800,
  ): Promise<void> {
    await this.client.set(`refresh:${userId}`, token, 'EX', ttlSeconds);
  }

  // Retrieve refresh token by userId
  async getRefreshToken(userId: string): Promise<string | null> {
    return this.client.get(`refresh:${userId}`);
  }

  // Delete refresh token on logout
  async deleteRefreshToken(userId: string): Promise<void> {
    await this.client.del(`refresh:${userId}`);
  }

  // Generic get/set/del for future use
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}
