import { IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class DisputeRequestDto {
  @IsString()
  @MinLength(20, {
    message: 'Please provide a detailed reason for your dispute',
  })
  @Transform(({ value }) => value?.trim())
  reason!: string;
}
