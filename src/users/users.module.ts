import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { HelpersModule } from '../helpers/helpers.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [HelpersModule, NotificationsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
