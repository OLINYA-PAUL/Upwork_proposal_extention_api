// import { Module } from '@nestjs/common';
// import { ConfigModule } from '@nestjs/config';
// import { AppController } from './app.controller';
// import { AppService } from './app.service';
// import { PrismaModule } from './prisma/prisma.module';
// import { RedisModule } from './redis/redis.module';
// import { MailModule } from './mail/mail.module';
// import { AuthModule } from './auth/auth.module';
// import jwtConfig from './config/jwt.config';

// @Module({
//   imports: [
//     ConfigModule.forRoot({
//       isGlobal: true,
//       load: [jwtConfig],
//     }),
//     PrismaModule,
//     RedisModule,
//     MailModule,
//     AuthModule,
//   ],
//   controllers: [AppController],
//   providers: [AppService],
// })
// export class AppModule {}

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
import jwtConfig from './config/jwt.config';
import imagekitConfig from './config/imagekit.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [jwtConfig, imagekitConfig],
    }),
    PrismaModule,
    RedisModule,
    MailModule,
    HelpersModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
