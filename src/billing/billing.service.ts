import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationType, Plan } from '@prisma/client';
import { Paddle, Environment } from '@paddle/paddle-node-sdk';
import { CheckoutPlan } from './dto/create-checkout.dto';
import { NotificationsService } from 'src/notifications/notifications.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly paddle: Paddle;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {
    this.paddle = new Paddle(this.config.get<string>('PADDLE_API_KEY')!, {
      environment: Environment.sandbox,
    });
  }

  // ── GET PLANS ───────────────────────────────────────────

  getPlans() {
    return {
      plans: [
        {
          name: 'FREE',
          price: 0,
          features: [
            '14-day free trial',
            '1 proposal per 24 hours after trial',
          ],
        },
        {
          name: 'STARTER',
          price: 5,
          priceId: this.config.get<string>('PADDLE_STARTER_PRICE_ID'),
          features: [
            '30 proposals per month',
            'Screening question automation',
            'Proposal history',
          ],
        },
        {
          name: 'PRO',
          price: 10,
          priceId: this.config.get<string>('PADDLE_PRO_PRICE_ID'),
          features: [
            'Unlimited proposals',
            'Screening question automation',
            'Proposal history',
            'Priority support',
          ],
        },
      ],
    };
  }

  // ── CREATE CHECKOUT ─────────────────────────────────────

  async createCheckout(
    userId: string,
    userEmail: string,
    plan: CheckoutPlan,
  ): Promise<{ checkoutUrl: string }> {
    const priceId =
      plan === Plan.STARTER
        ? this.config.get<string>('PADDLE_STARTER_PRICE_ID')
        : this.config.get<string>('PADDLE_PRO_PRICE_ID');

    if (!priceId) {
      throw new InternalServerErrorException('Plan price ID not configured');
    }

    try {
      // Get or create Paddle customer
      let customerId = await this.getPaddleCustomerId(userId);

      if (!customerId) {
        customerId = await this.createPaddleCustomer(userId, userEmail);
      }

      // Create transaction
      const transaction = await this.paddle.transactions.create({
        items: [
          {
            priceId,
            quantity: 1,
          },
        ],
        customerId,
        customData: {
          userId,
          plan,
        },
      });

      // Get checkout URL
      const checkoutUrl = transaction.checkout?.url;

      if (!checkoutUrl) {
        throw new InternalServerErrorException(
          'Failed to generate checkout URL',
        );
      }

      this.logger.log(`Checkout created for user: ${userId} plan: ${plan}`);

      return { checkoutUrl };
    } catch (error) {
      this.logger.error(`Failed to create checkout for user: ${userId}`, error);
      throw new InternalServerErrorException(
        'Failed to create checkout session. Please try again.',
      );
    }
  }

  // ── GET SUBSCRIPTION ────────────────────────────────────

  async getSubscription(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        plan: true,
        paddleSubId: true,
        paddleCustomerId: true,
        trialStartedAt: true,
        trialExpiresAt: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    let subscriptionDetails: {
      status: string;
      nextBilledAt: string | null;
      startedAt: string | null;
    } | null = null;

    if (user.paddleSubId) {
      try {
        const subscription = await this.paddle.subscriptions.get(
          user.paddleSubId,
        );

        subscriptionDetails = {
          status: subscription.status,
          nextBilledAt: subscription.nextBilledAt ?? null,
          startedAt: subscription.startedAt ?? null,
        };
      } catch (error) {
        this.logger.error(
          `Failed to fetch subscription details for user: ${userId}`,
          error,
        );
      }
    }

    return {
      plan: user.plan,
      trialStartedAt: user.trialStartedAt,
      trialExpiresAt: user.trialExpiresAt,
      subscription: subscriptionDetails,
    };
  }

  // ── CANCEL SUBSCRIPTION ─────────────────────────────────

  async cancelSubscription(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        paddleSubId: true,
        plan: true,
        name: true,
        email: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.paddleSubId) {
      throw new BadRequestException('No active subscription found');
    }

    if (user.plan === Plan.FREE) {
      throw new BadRequestException('You are already on the FREE plan');
    }

    try {
      // Cancel immediately on Paddle
      await this.paddle.subscriptions.cancel(user.paddleSubId, {
        effectiveFrom: 'immediately',
      });

      // Downgrade to FREE immediately
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          plan: Plan.FREE,
          paddleSubId: null,
        },
      });

      // Send cancellation email
      await this.mail.sendSubscriptionCanceled(
        user.email,
        user.name,
        user.plan,
      );

      this.logger.log(`Subscription canceled for user: ${userId}`);

      return {
        message:
          'Your subscription has been canceled. Your account has been downgraded to the FREE plan.',
      };
    } catch (error) {
      this.logger.error(
        `Failed to cancel subscription for user: ${userId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to cancel subscription. Please try again.',
      );
    }
  }

  // ── GET INVOICES ────────────────────────────────────────

  async getInvoices(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { paddleCustomerId: true },
    });

    if (!user?.paddleCustomerId) {
      return { invoices: [] };
    }

    try {
      const invoices: any[] = [];

      const transactions = this.paddle.transactions.list({
        customerId: [user.paddleCustomerId],
        status: ['completed'],
      });

      for await (const transaction of transactions) {
        // Fetch invoice PDF URL separately — expires after 1 hour
        let invoiceUrl: string | null = null;

        try {
          const invoicePdf = await this.paddle.transactions.getInvoicePDF(
            transaction.id,
          );
          invoiceUrl = invoicePdf.url ?? null;
        } catch {
          // Invoice may not be available for all transactions
          invoiceUrl = null;
        }

        invoices.push({
          id: transaction.id,
          amount: transaction.details?.totals?.total,
          currency: transaction.currencyCode,
          status: transaction.status,
          createdAt: transaction.createdAt,
          invoiceUrl,
        });
      }

      return { invoices };
    } catch (error) {
      this.logger.error(`Failed to fetch invoices for user: ${userId}`, error);
      throw new InternalServerErrorException(
        'Failed to fetch invoices. Please try again.',
      );
    }
  }
  // ── HANDLE WEBHOOK ──────────────────────────────────────

  async handleWebhook(
    rawBody: string,
    signature: string,
  ): Promise<{ received: boolean }> {
    let event: any;

    // Verify webhook signature
    try {
      event = this.paddle.webhooks.unmarshal(
        rawBody,
        this.config.get<string>('PADDLE_WEBHOOK_SECRET')!,
        signature,
      );
    } catch (error) {
      this.logger.error('Invalid Paddle webhook signature', error);
      throw new BadRequestException('Invalid webhook signature');
    }

    // Check for duplicate event
    const existing = await this.prisma.paddleWebhookEvent.findUnique({
      where: { paddleEventId: event.eventId },
    });

    if (existing) {
      this.logger.warn(`Duplicate webhook event ignored: ${event.eventId}`);
      return { received: true };
    }

    // Log webhook event before processing
    await this.prisma.paddleWebhookEvent.create({
      data: {
        paddleEventId: event.eventId,
        eventType: event.eventType,
        payload: JSON.stringify(event),
        processed: false,
      },
    });

    // Process event
    try {
      await this.processWebhookEvent(event);

      // Mark as processed
      await this.prisma.paddleWebhookEvent.update({
        where: { paddleEventId: event.eventId },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to process webhook event: ${event.eventId}`,
        error,
      );
    }

    return { received: true };
  }

  // ── PROCESS WEBHOOK EVENT ───────────────────────────────

  private async processWebhookEvent(event: any): Promise<void> {
    this.logger.log(`Processing webhook event: ${event.eventType}`);

    switch (event.eventType) {
      case 'transaction.completed':
        await this.handleTransactionCompleted(event.data);
        break;

      case 'subscription.activated':
        await this.handleSubscriptionActivated(event.data);
        break;

      case 'subscription.updated':
        await this.handleSubscriptionUpdated(event.data);
        break;

      case 'subscription.canceled':
        await this.handleSubscriptionCanceled(event.data);
        break;

      case 'transaction.payment_failed':
        await this.handlePaymentFailed(event.data);
        break;
      case 'transaction.completed':
        // Check if it is a template purchase or subscription
        if (event.data.customData?.type === 'template_purchase') {
          await this.handleTemplatePurchaseCompleted(event.data);
        } else {
          await this.handleTransactionCompleted(event.data);
        }
        break;

      default:
        this.logger.log(`Unhandled webhook event type: ${event.eventType}`);
    }
  }

  // ── WEBHOOK HANDLERS ────────────────────────────────────

  private async handleTransactionCompleted(data: any): Promise<void> {
    const userId = data.customData?.userId;
    const plan = data.customData?.plan;

    if (!userId || !plan) {
      this.logger.warn('Transaction completed missing userId or plan');
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    if (!user) return;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        plan: plan,
        paddleCustomerId: data.customerId,
      },
    });

    // Send email
    const amount = plan === 'STARTER' ? 9 : 29;
    await this.mail.sendSubscriptionActivated(
      user.email,
      user.name,
      plan,
      amount,
      new Date().toDateString(),
    );

    // In-app notification — user
    await this.notifications.createAndSend({
      userId,
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'Subscription Activated',
      body: `Your ${plan} plan is now active. Enjoy unlimited proposals.`,
    });

    // In-app notification — admins
    await this.notifications.notifyAdmins({
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'New Subscription',
      body: `${user.name} subscribed to the ${plan} plan.`,
    });

    this.logger.log(`Transaction completed — user: ${userId} plan: ${plan}`);
  }

  private async handleSubscriptionActivated(data: any): Promise<void> {
    const userId = data.customData?.userId;

    if (!userId) {
      this.logger.warn('Subscription activated missing userId');
      return;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        paddleSubId: data.id,
        paddleCustomerId: data.customerId,
      },
    });

    this.logger.log(`Subscription activated — user: ${userId}`);
  }

  private async handleSubscriptionUpdated(data: any): Promise<void> {
    const userId = data.customData?.userId;

    if (!userId) {
      this.logger.warn('Subscription updated missing userId');
      return;
    }

    // Determine new plan from price ID
    const priceId = data.items?.[0]?.price?.id;
    const starterPriceId = this.config.get<string>('PADDLE_STARTER_PRICE_ID');
    const proPriceId = this.config.get<string>('PADDLE_PRO_PRICE_ID');

    let newPlan: Plan = Plan.FREE;

    if (priceId === starterPriceId) {
      newPlan = Plan.STARTER;
    } else if (priceId === proPriceId) {
      newPlan = Plan.PRO;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { plan: newPlan },
    });

    this.logger.log(
      `Subscription updated — user: ${userId} new plan: ${newPlan}`,
    );
  }

  private async handleSubscriptionCanceled(data: any): Promise<void> {
    const userId = data.customData?.userId;

    if (!userId) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, plan: true },
    });

    if (!user) return;

    await this.prisma.user.update({
      where: { id: userId },
      data: { plan: Plan.FREE, paddleSubId: null },
    });

    await this.mail.sendSubscriptionCanceled(user.email, user.name, user.plan);

    // In-app notification — user
    await this.notifications.createAndSend({
      userId,
      type: NotificationType.BOOKING_CANCELLED,
      title: 'Subscription Canceled',
      body: 'Your subscription has been canceled. You are now on the FREE plan.',
    });

    // In-app notification — admins
    await this.notifications.notifyAdmins({
      type: NotificationType.BOOKING_CANCELLED,
      title: 'Subscription Canceled',
      body: `${user.name} canceled their subscription.`,
    });

    this.logger.log(`Subscription canceled — user: ${userId}`);
  }

  private async handlePaymentFailed(data: any): Promise<void> {
    const userId = data.customData?.userId;

    if (!userId) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, plan: true },
    });

    if (!user) return;

    await this.prisma.user.update({
      where: { id: userId },
      data: { plan: Plan.FREE, paddleSubId: null },
    });

    await this.mail.sendPaymentFailed(user.email, user.name, user.plan);

    // In-app notification — user
    await this.notifications.createAndSend({
      userId,
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'Payment Failed',
      body: 'Your payment failed. Your account has been downgraded to the FREE plan.',
    });

    // In-app notification — admins
    await this.notifications.notifyAdmins({
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'Payment Failed',
      body: `Payment failed for user ${user.name}. Account downgraded to FREE.`,
    });

    this.logger.log(`Payment failed — user: ${userId}`);
  }

  // ── PRIVATE HELPERS ─────────────────────────────────────

  private async getPaddleCustomerId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { paddleCustomerId: true },
    });

    return user?.paddleCustomerId ?? null;
  }

  private async createPaddleCustomer(
    userId: string,
    email: string,
  ): Promise<string> {
    const customer = await this.paddle.customers.create({
      email,
      customData: { userId },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { paddleCustomerId: customer.id },
    });

    return customer.id;
  }

  private async handleTemplatePurchaseCompleted(data: any): Promise<void> {
    const { userId, templateId } = data.customData;

    if (!userId || !templateId) return;

    const [template, user] = await Promise.all([
      this.prisma.template.findUnique({
        where: { id: templateId },
        include: { category: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      }),
    ]);

    if (!template || !user) return;

    // Grant access
    await this.prisma.purchasedTemplate.create({
      data: {
        userId,
        templateId,
        paddleTransactionId: data.id,
        amountPaidUsd: template.priceUsd,
      },
    });

    // Increment purchase count
    await this.prisma.template.update({
      where: { id: templateId },
      data: { purchaseCount: { increment: 1 } },
    });

    // Send email
    await this.mail.sendTemplatePurchased(
      user.email,
      user.name,
      template.jobTitle,
      template.category.name,
      template.priceUsd,
    );

    // In-app notification — user
    await this.notifications.createAndSend({
      userId,
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'Template Purchased',
      body: `You have successfully purchased the template "${template.jobTitle}". View it in your library.`,
    });

    // In-app notification — admins
    await this.notifications.notifyAdmins({
      type: NotificationType.PAYMENT_RECEIVED,
      title: 'Template Purchased',
      body: `${user.name} purchased the template "${template.jobTitle}" for $${template.priceUsd}.`,
    });

    this.logger.log(
      `Template purchased — user: ${userId} template: ${templateId}`,
    );
  }
}
