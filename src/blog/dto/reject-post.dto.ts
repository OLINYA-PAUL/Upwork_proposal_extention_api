import { IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class RejectPostDto {
  @IsString()
  @MinLength(10, { message: 'Please provide a reason for rejection' })
  @Transform(({ value }) => value?.trim())
  reason!: string;
}
