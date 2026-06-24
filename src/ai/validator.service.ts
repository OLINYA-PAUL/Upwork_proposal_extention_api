import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ValidatorService {
  private readonly logger = new Logger(ValidatorService.name);

  validate(proposalText: string): {
    isValid: boolean;
    reason?: string;
  } {
    if (!proposalText || proposalText.trim().length === 0) {
      this.logger.warn('AI returned empty proposal');
      return { isValid: false, reason: 'empty_response' };
    }

    if (proposalText.trim().length < 100) {
      this.logger.warn('AI returned proposal that is too short');
      return { isValid: false, reason: 'too_short' };
    }

    return { isValid: true };
  }

  buildRetryInstruction(reason: string): string {
    const instructions: Record<string, string> = {
      empty_response:
        'The previous response was empty. Please generate a complete proposal.',
      too_short:
        'The previous response was too short. Please generate a complete and detailed proposal.',
    };

    return instructions[reason] ?? 'Please regenerate the proposal.';
  }
}
