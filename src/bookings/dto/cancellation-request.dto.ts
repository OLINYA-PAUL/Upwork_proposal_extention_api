import { IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CancellationRequestDto {
  @IsString()
  @MinLength(20, {
    message: 'Please provide a detailed reason for cancellation',
  })
  @Transform(({ value }) => value?.trim())
  reason!: string;
}
