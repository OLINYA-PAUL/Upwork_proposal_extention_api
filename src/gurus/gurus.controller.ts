import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GurusService } from './gurus.service';
import { ApplyGuruDto } from './dto/apply-guru.dto';
import { RejectGuruDto } from './dto/reject-guru.dto';
import { UpdateGuruProfileDto } from './dto/update-guru-profile.dto';
import { ReviewGuruDto } from './dto/review-guru.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.interface';
import { GuruStatus } from '@prisma/client';

@Controller('gurus')
export class GurusController {
  constructor(private readonly gurusService: GurusService) {}

  // ── PUBLIC ──────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  getPublicGurus(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('specialty') specialty?: string,
  ) {
    return this.gurusService.getPublicGurus(page, limit, specialty);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  getPublicGuru(@Param('id') id: string) {
    return this.gurusService.getPublicGuru(id);
  }

  @Get(':id/reviews')
  @HttpCode(HttpStatus.OK)
  getGuruReviews(
    @Param('id') id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.gurusService.getGuruReviews(id, page, limit);
  }

  // ── USER ────────────────────────────────────────────────

  @Post('apply')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  apply(@Body() dto: ApplyGuruDto, @CurrentUser() user: JwtPayload) {
    return this.gurusService.apply(user.sub, dto);
  }

  @Get('me/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('GURU')
  @HttpCode(HttpStatus.OK)
  getMyProfile(@CurrentUser() user: JwtPayload) {
    return this.gurusService.getMyProfile(user.sub);
  }

  @Patch('me/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('GURU')
  @HttpCode(HttpStatus.OK)
  updateMyProfile(
    @Body() dto: UpdateGuruProfileDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gurusService.updateMyProfile(user.sub, dto);
  }

  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  submitReview(
    @Param('id') id: string,
    @Body() dto: ReviewGuruDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.gurusService.submitReview(id, user.sub, dto);
  }

  // ── ADMIN ────────────────────────────────────────────────

  @Get('admin/applications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminGetApplications(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('status') status?: GuruStatus,
  ) {
    return this.gurusService.adminGetApplications(page, limit, status);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminGetAllGurus(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.gurusService.adminGetAllGurus(page, limit);
  }

  @Patch('admin/applications/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminApproveGuru(@Param('id') id: string, @CurrentUser() admin: JwtPayload) {
    return this.gurusService.adminApproveGuru(id, admin.sub);
  }

  @Patch('admin/applications/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminRejectGuru(
    @Param('id') id: string,
    @Body() dto: RejectGuruDto,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.gurusService.adminRejectGuru(id, dto, admin.sub);
  }

  @Patch('admin/:id/suspend')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminSuspendGuru(@Param('id') id: string, @CurrentUser() admin: JwtPayload) {
    return this.gurusService.adminSuspendGuru(id, admin.sub);
  }

  @Patch('admin/:id/reinstate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminReinstateGuru(
    @Param('id') id: string,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.gurusService.adminReinstateGuru(id, admin.sub);
  }
}
