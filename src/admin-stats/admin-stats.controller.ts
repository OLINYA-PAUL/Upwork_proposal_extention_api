import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminStatsService } from './admin-stats.service';
import { DateRangeDto } from './dto/date-range.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin/stats')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminStatsController {
  constructor(private readonly statsService: AdminStatsService) {}

  @Get('overview')
  @HttpCode(HttpStatus.OK)
  getOverview() {
    return this.statsService.getOverview();
  }

  @Get('users')
  @HttpCode(HttpStatus.OK)
  getUserStats(@Query() dto: DateRangeDto) {
    return this.statsService.getUserStats(dto);
  }

  @Get('revenue')
  @HttpCode(HttpStatus.OK)
  getRevenueStats(@Query() dto: DateRangeDto) {
    return this.statsService.getRevenueStats(dto);
  }

  @Get('subscriptions')
  @HttpCode(HttpStatus.OK)
  getSubscriptionStats(@Query() dto: DateRangeDto) {
    return this.statsService.getSubscriptionStats(dto);
  }

  @Get('proposals')
  @HttpCode(HttpStatus.OK)
  getProposalStats(@Query() dto: DateRangeDto) {
    return this.statsService.getProposalStats(dto);
  }

  @Get('templates')
  @HttpCode(HttpStatus.OK)
  getTemplateStats(@Query() dto: DateRangeDto) {
    return this.statsService.getTemplateStats(dto);
  }

  @Get('gurus')
  @HttpCode(HttpStatus.OK)
  getGuruStats(@Query() dto: DateRangeDto) {
    return this.statsService.getGuruStats(dto);
  }

  @Get('blog')
  @HttpCode(HttpStatus.OK)
  getBlogStats(@Query() dto: DateRangeDto) {
    return this.statsService.getBlogStats(dto);
  }

  @Get('system')
  @HttpCode(HttpStatus.OK)
  getSystemStats() {
    return this.statsService.getSystemStats();
  }
}
