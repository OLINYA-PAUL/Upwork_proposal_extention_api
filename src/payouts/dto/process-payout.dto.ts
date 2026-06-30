import {
  IsMongoId,
  IsString,
  IsDateString,
  IsNumber,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProcessPayoutDto {
  @IsMongoId()
  guruId!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amountUsd!: number;

  @IsString()
  @MinLength(3)
  transactionRef!: string;
}
