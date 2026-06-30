import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.interface';
import { ProcessPayoutDto } from './dto/process-payout.dto';

@Controller('payouts')
@UseGuards(JwtAuthGuard)
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('my-payouts')
  @UseGuards(RolesGuard)
  @Roles('GURU')
  @HttpCode(HttpStatus.OK)
  getMyPayouts(
    @CurrentUser() user: JwtPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.payoutsService.getMyPayouts(user.sub, page, limit);
  }

  @Get('admin/pending')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminGetPendingPayouts() {
    return this.payoutsService.adminGetPendingPayouts();
  }

  @Post('admin/process')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  adminProcessPayout(
    @Body() dto: ProcessPayoutDto,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.payoutsService.adminProcessPayout(dto, admin.sub);
  }
}
