import { Module } from '@nestjs/common';
import { GurusService } from './gurus.service';
import { GurusController } from './gurus.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [GurusController],
  providers: [GurusService],
  exports: [GurusService],
})
export class GurusModule {}
