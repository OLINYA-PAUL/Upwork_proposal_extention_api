import { IsEnum } from 'class-validator';
import { ProposalStatus } from '@prisma/client';

export class UpdateStatusDto {
  @IsEnum(ProposalStatus, {
    message: `status must be one of: ${Object.values(ProposalStatus).join(', ')}`,
  })
  status!: ProposalStatus;
}
