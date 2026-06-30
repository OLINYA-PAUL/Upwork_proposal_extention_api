import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const CACHE_TTL_SECONDS = 120; // 2 minutes

@Injectable()
export class StatsCacheHelper {
  constructor(private readonly redis: RedisService) {}

  async getOrCompute<T>(key: string, computeFn: () => Promise<T>): Promise<T> {
    const cached = await this.redis.get(key);

    if (cached) {
      return JSON.parse(cached) as T;
    }

    const result = await computeFn();
    await this.redis.set(key, JSON.stringify(result), CACHE_TTL_SECONDS);

    return result;
  }

  buildKey(prefix: string, startDate?: string, endDate?: string): string {
    if (startDate && endDate) {
      return `stats:${prefix}:${startDate}:${endDate}`;
    }
    return `stats:${prefix}:default`;
  }
}
