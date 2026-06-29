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
import jwtConfig from './config/jwt.config';
import imagekitConfig from './config/imagekit.config';
import openaiConfig from './config/openai.config';
import paddleConfig from './config/paddle.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [jwtConfig, imagekitConfig, openaiConfig, paddleConfig],
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
