import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  RawBodyRequest,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BillingService } from './billing.service';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.interface';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // ── GET PLANS ───────────────────────────────────────────

  @Get('plans')
  @HttpCode(HttpStatus.OK)
  getPlans() {
    return this.billingService.getPlans();
  }

  // ── CREATE CHECKOUT ─────────────────────────────────────

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  createCheckout(
    @Body() dto: CreateCheckoutDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.billingService.createCheckout(user.sub, user.email, dto.plan);
  }

  // ── GET SUBSCRIPTION ────────────────────────────────────

  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  getSubscription(@CurrentUser() user: JwtPayload) {
    return this.billingService.getSubscription(user.sub);
  }

  // ── CANCEL SUBSCRIPTION ─────────────────────────────────

  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  cancelSubscription(@CurrentUser() user: JwtPayload) {
    return this.billingService.cancelSubscription(user.sub);
  }

  // ── GET INVOICES ────────────────────────────────────────

  @Get('invoices')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  getInvoices(@CurrentUser() user: JwtPayload) {
    return this.billingService.getInvoices(user.sub);
  }

  // ── WEBHOOK ─────────────────────────────────────────────
  // Raw body required for signature verification

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('paddle-signature') signature: string,
  ) {
    const rawBody = req.rawBody?.toString() ?? '';
    return this.billingService.handleWebhook(rawBody, signature);
  }
}
