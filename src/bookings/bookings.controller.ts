import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.interface';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancellationRequestDto } from './dto/cancellation-request.dto';
import { DisputeRequestDto } from './dto/dispute-request.dto';
import { AddMeetingLinkDto } from './dto/add-meeting-link.dto';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // ── USER ────────────────────────────────────────────────

  @Post('create')
  @HttpCode(HttpStatus.OK)
  createBooking(
    @Body() dto: CreateBookingDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bookingsService.createBooking(user.sub, user.email, dto);
  }

  @Get('my-bookings')
  @HttpCode(HttpStatus.OK)
  getUserBookings(
    @CurrentUser() user: JwtPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.bookingsService.getUserBookings(user.sub, page, limit);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  requestCancellation(
    @Param('id') id: string,
    @Body() dto: CancellationRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bookingsService.requestCancellation(id, user.sub, dto);
  }

  @Post(':id/dispute')
  @HttpCode(HttpStatus.OK)
  submitDispute(
    @Param('id') id: string,
    @Body() dto: DisputeRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bookingsService.submitDispute(id, user.sub, dto);
  }

  // ── GURU ────────────────────────────────────────────────

  @Get('guru-bookings')
  @UseGuards(RolesGuard)
  @Roles('GURU')
  @HttpCode(HttpStatus.OK)
  getGuruBookings(
    @CurrentUser() user: JwtPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.bookingsService.getGuruBookings(user.sub, page, limit);
  }

  @Patch(':id/meeting-link')
  @UseGuards(RolesGuard)
  @Roles('GURU')
  @HttpCode(HttpStatus.OK)
  addMeetingLink(
    @Param('id') id: string,
    @Body() dto: AddMeetingLinkDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bookingsService.addMeetingLink(id, user.sub, dto);
  }

  @Patch(':id/complete')
  @UseGuards(RolesGuard)
  @Roles('GURU', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  markCompleted(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const isAdmin = user.role === 'ADMIN';
    return this.bookingsService.markCompleted(id, user.sub, isAdmin);
  }

  // ── ADMIN ────────────────────────────────────────────────

  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminGetAllBookings(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.bookingsService.adminGetAllBookings(page, limit);
  }

  @Patch('admin/:id/cancel/approve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminApproveCancellation(
    @Param('id') id: string,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.bookingsService.adminApproveCancellation(id, admin.sub);
  }

  @Patch('admin/:id/cancel/reject')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminRejectCancellation(
    @Param('id') id: string,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.bookingsService.adminRejectCancellation(id, admin.sub);
  }

  @Patch('admin/:id/dispute/refund')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminRefundDispute(
    @Param('id') id: string,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.bookingsService.adminResolveDispute(id, 'REFUNDED', admin.sub);
  }

  @Patch('admin/:id/dispute/reject')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminRejectDispute(
    @Param('id') id: string,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.bookingsService.adminResolveDispute(id, 'REJECTED', admin.sub);
  }
}
