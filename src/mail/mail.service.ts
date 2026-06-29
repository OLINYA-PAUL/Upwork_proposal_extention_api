import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as ejs from 'ejs';
import * as path from 'path';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT'),
      service: this.configService.get<string>('SMTP_SERVICE'),
      secure: true,
      auth: {
        user: this.configService.get<string>('SMTP_MAIL'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
    });
  }

  async sendOtp(
    to: string,
    name: string,
    otp: string,
    purpose: 'verification' | 'password-reset',
  ): Promise<void> {
    const subject =
      purpose === 'verification'
        ? 'Verify Your Email — Upwork Proposal AI'
        : 'Reset Your Password — Upwork Proposal AI';

    const title =
      purpose === 'verification' ? 'Verify Your Email' : 'Reset Your Password';

    const message =
      purpose === 'verification'
        ? 'Thank you for registering. Use the OTP below to verify your email address.'
        : 'You requested a password reset. Use the OTP below to reset your password.';

    const templatePath = path.join(
      __dirname,
      'templates',
      'otp-email.template.ejs',
    );

    const html = await ejs.renderFile(templatePath, {
      name,
      otp,
      title,
      message,
      year: new Date().getFullYear(),
    });

    try {
      await this.transporter.sendMail({
        from: `"Upwork Proposal AI" <${this.configService.get<string>('SMTP_MAIL')}>`,
        to,
        subject,
        html,
      });

      this.logger.log(`OTP email sent to ${to} for ${purpose}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${to}`, error);
      throw new InternalServerErrorException(
        'Failed to send OTP email. Please try again.',
      );
    }
  }

  async sendBookingConfirmation(
    to: string,
    name: string,
    guruName: string,
    sessionType: string,
    scheduledAt: string,
    amountUsd: number,
    meetingLink?: string,
  ): Promise<void> {
    const templatePath = path.join(
      __dirname,
      'templates',
      'booking-confirmation.template.ejs',
    );

    const html = await ejs.renderFile(templatePath, {
      name,
      guruName,
      sessionType,
      scheduledAt,
      amountUsd,
      meetingLink: meetingLink || null,
      year: new Date().getFullYear(),
    });

    try {
      await this.transporter.sendMail({
        from: `"Upwork Proposal AI" <${this.configService.get<string>('SMTP_MAIL')}>`,
        to,
        subject: 'Booking Confirmed — Upwork Proposal AI',
        html,
      });

      this.logger.log(`Booking confirmation sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send booking confirmation to ${to}`, error);
      throw new InternalServerErrorException(
        'Failed to send booking confirmation email.',
      );
    }
  }
  async sendAccountRestricted(to: string, name: string): Promise<void> {
    const templatePath = path.join(
      __dirname,
      'templates',
      'account-restricted.template.ejs',
    );

    const html = await ejs.renderFile(templatePath, {
      name,
      year: new Date().getFullYear(),
    });

    try {
      await this.transporter.sendMail({
        from: `"Upwork Proposal AI" <${this.configService.get<string>('SMTP_MAIL')}>`,
        to,
        subject: 'Your Account Has Been Restricted — Upwork Proposal AI',
        html,
      });
      this.logger.log(`Account restricted email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send account restricted email to ${to}`,
        error,
      );
    }
  }

  async sendAccountUnrestricted(to: string, name: string): Promise<void> {
    const templatePath = path.join(
      __dirname,
      'templates',
      'account-unrestricted.template.ejs',
    );

    const html = await ejs.renderFile(templatePath, {
      name,
      year: new Date().getFullYear(),
    });

    try {
      await this.transporter.sendMail({
        from: `"Upwork Proposal AI" <${this.configService.get<string>('SMTP_MAIL')}>`,
        to,
        subject:
          'Your Account Restriction Has Been Lifted — Upwork Proposal AI',
        html,
      });
      this.logger.log(`Account unrestricted email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send account unrestricted email to ${to}`,
        error,
      );
    }
  }

  async sendAccountDeactivated(to: string, name: string): Promise<void> {
    const templatePath = path.join(
      __dirname,
      'templates',
      'account-deactivated.template.ejs',
    );

    const html = await ejs.renderFile(templatePath, {
      name,
      year: new Date().getFullYear(),
    });

    try {
      await this.transporter.sendMail({
        from: `"Upwork Proposal AI" <${this.configService.get<string>('SMTP_MAIL')}>`,
        to,
        subject: 'Your Account Has Been Deactivated — Upwork Proposal AI',
        html,
      });
      this.logger.log(`Account deactivated email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send account deactivated email to ${to}`,
        error,
      );
    }
  }

  async sendAccountRestored(to: string, name: string): Promise<void> {
    const templatePath = path.join(
      __dirname,
      'templates',
      'account-restored.template.ejs',
    );

    const html = await ejs.renderFile(templatePath, {
      name,
      year: new Date().getFullYear(),
    });

    try {
      await this.transporter.sendMail({
        from: `"Upwork Proposal AI" <${this.configService.get<string>('SMTP_MAIL')}>`,
        to,
        subject: 'Your Account Has Been Restored — Upwork Proposal AI',
        html,
      });
      this.logger.log(`Account restored email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send account restored email to ${to}`,
        error,
      );
    }
  }
  async sendPaymentFailed(
    to: string,
    name: string,
    plan: string,
  ): Promise<void> {
    const templatePath = path.join(
      __dirname,
      'templates',
      'payment-failed.template.ejs',
    );

    const html = await ejs.renderFile(templatePath, {
      name,
      plan,
      dashboardUrl: this.configService.get<string>('FRONTEND_URL'),
      year: new Date().getFullYear(),
    });

    try {
      await this.transporter.sendMail({
        from: `"GeniusBid" <${this.configService.get<string>('SMTP_MAIL')}>`,
        to,
        subject: 'Payment Failed — Your Account Has Been Downgraded',
        html,
      });
      this.logger.log(`Payment failed email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send payment failed email to ${to}`, error);
    }
  }

  async sendSubscriptionCanceled(
    to: string,
    name: string,
    plan: string,
  ): Promise<void> {
    const templatePath = path.join(
      __dirname,
      'templates',
      'subscription-canceled.template.ejs',
    );

    const html = await ejs.renderFile(templatePath, {
      name,
      plan,
      dashboardUrl: this.configService.get<string>('FRONTEND_URL'),
      year: new Date().getFullYear(),
    });

    try {
      await this.transporter.sendMail({
        from: `"GeniusBid" <${this.configService.get<string>('SMTP_MAIL')}>`,
        to,
        subject: 'Subscription Canceled — GeniusBid',
        html,
      });
      this.logger.log(`Subscription canceled email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send subscription canceled email to ${to}`,
        error,
      );
    }
  }
  async sendTemplatePurchased(
    to: string,
    name: string,
    templateTitle: string,
    category: string,
    amountPaid: number,
  ): Promise<void> {
    const templatePath = path.join(
      __dirname,
      'templates',
      'template-purchased.template.ejs',
    );

    const html = await ejs.renderFile(templatePath, {
      name,
      templateTitle,
      category,
      amountPaid,
      dashboardUrl: this.configService.get<string>('FRONTEND_URL'),
      year: new Date().getFullYear(),
    });

    try {
      await this.transporter.sendMail({
        from: `"GeniusBid" <${this.configService.get<string>('SMTP_MAIL')}>`,
        to,
        subject: 'Template Purchase Successful — GeniusBid',
        html,
      });
      this.logger.log(`Template purchased email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send template purchased email to ${to}`,
        error,
      );
    }
  }

  async sendSubscriptionActivated(
    to: string,
    name: string,
    plan: string,
    amount: number,
    startedAt: string,
  ): Promise<void> {
    const templatePath = path.join(
      __dirname,
      'templates',
      'subscription-activated.template.ejs',
    );

    const html = await ejs.renderFile(templatePath, {
      name,
      plan,
      amount,
      startedAt,
      dashboardUrl: this.configService.get<string>('FRONTEND_URL'),
      year: new Date().getFullYear(),
    });

    try {
      await this.transporter.sendMail({
        from: `"GeniusBid" <${this.configService.get<string>('SMTP_MAIL')}>`,
        to,
        subject: `Your ${plan} Plan is Now Active — GeniusBid`,
        html,
      });
      this.logger.log(`Subscription activated email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send subscription activated email to ${to}`,
        error,
      );
    }
  }
}
