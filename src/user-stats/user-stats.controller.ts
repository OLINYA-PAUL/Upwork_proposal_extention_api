import {
  Controller,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UserStatsService } from './user-stats.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.interface';

@Controller('user-stats')
@UseGuards(JwtAuthGuard)
export class UserStatsController {
  constructor(private readonly userStatsService: UserStatsService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  getMyStats(@CurrentUser() user: JwtPayload) {
    return this.userStatsService.getMyStats(user.sub);
  }
}
