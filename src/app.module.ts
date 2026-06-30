import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HelpersModule } from './helpers/helpers.module';
import { SettingsModule } from './settings/settings.module';
import { AiModule } from './ai/ai.module';
import { ProposalsModule } from './proposals/proposals.module';
import { BillingModule } from './billing/billing.module';
import { CategoriesModule } from './categories/categories.module';
import { TemplatesModule } from './proposal-templates/templates.module';
import { NotificationsModule } from './notifications/notifications.module';
import { GurusModule } from './gurus/gurus.module';
import { BookingsModule } from './bookings/bookings.module';
import { PayoutsModule } from './payouts/payouts.module';
import { BlogModule } from './blog/blog.module';
import { BlogCategoriesModule } from './blog-categories/blog-categories.module';
import { AdminStatsModule } from './admin-stats/admin-stats.module';
import jwtConfig from './config/jwt.config';
import imagekitConfig from './config/imagekit.config';
import imagekitBlogConfig from './config/imagekit-blog.config';
import openaiConfig from './config/openai.config';
import paddleConfig from './config/paddle.config';
import { UserStatsModule } from './user-stats/user-stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        jwtConfig,
        imagekitConfig,
        imagekitBlogConfig,
        openaiConfig,
        paddleConfig,
      ],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    MailModule,
    HelpersModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    AiModule,
    ProposalsModule,
    BillingModule,
    CategoriesModule,
    TemplatesModule,
    NotificationsModule,
    GurusModule,
    BookingsModule,
    PayoutsModule,
    BlogModule,
    BlogCategoriesModule,
    AdminStatsModule,
    UserStatsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
