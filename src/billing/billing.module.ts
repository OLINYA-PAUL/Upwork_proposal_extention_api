// import { Module } from '@nestjs/common';
// import { BillingService } from './billing.service';
// import { BillingController } from './billing.controller';
// import { NotificationsModule } from '../notifications/notifications.module';

// @Module({
//   imports: [NotificationsModule],
//   controllers: [BillingController],
//   providers: [BillingService],
//   exports: [BillingService],
// })
// export class BillingModule {}

import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { BookingsModule } from 'src/bookings/bookings.module';

@Module({
  imports: [NotificationsModule, BookingsModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
