import { IsMongoId, IsEnum, IsDateString } from 'class-validator';
import { SessionType } from '@prisma/client';

export class CreateBookingDto {
  @IsMongoId()
  guruId!: string;

  @IsEnum(SessionType, {
    message: 'Session type must be PROPOSAL_REVIEW or COACHING',
  })
  sessionType!: SessionType;

  @IsDateString()
  scheduledAt!: string;
}
