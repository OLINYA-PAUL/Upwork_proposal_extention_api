import { IsEnum } from 'class-validator';
import { ProposalStatus } from '@prisma/client';

export class UpdateStatusDto {
  @IsEnum(ProposalStatus)
  status!: ProposalStatus;
}
