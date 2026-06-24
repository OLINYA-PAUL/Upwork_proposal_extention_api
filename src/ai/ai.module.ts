import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { PromptBuilder } from './prompt.builder';
import { ValidatorService } from './validator.service';

@Module({
  providers: [AiService, PromptBuilder, ValidatorService],
  exports: [AiService],
})
export class AiModule {}
