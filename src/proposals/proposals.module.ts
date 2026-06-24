import { Module } from '@nestjs/common';
import { ProposalsService } from './proposals.service';
import { ProposalsController } from './proposals.controller';
import { AiModule } from '../ai/ai.module';
import { HelpersModule } from '../helpers/helpers.module';
import { SettingsModule } from '../settings/settings.module';
import { UsageLimiterInterceptor } from '../common/interceptors/usage-limiter.interceptor';

@Module({
  imports: [AiModule, HelpersModule, SettingsModule],
  controllers: [ProposalsController],
  providers: [ProposalsService, UsageLimiterInterceptor],
  exports: [ProposalsService],
})
export class ProposalsModule {}
