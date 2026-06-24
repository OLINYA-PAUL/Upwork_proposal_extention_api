import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import jwtConfig from './config/jwt.config';
import imagekitConfig from './config/imagekit.config';
import openaiConfig from './config/openai.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [jwtConfig, imagekitConfig, openaiConfig],
    }),
    PrismaModule,
    RedisModule,
    MailModule,
    HelpersModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    AiModule,
    ProposalsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
