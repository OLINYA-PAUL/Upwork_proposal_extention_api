import {
  IsString,
  IsArray,
  IsUrl,
  IsNumber,
  MinLength,
  MaxLength,
  Min,
  Max,
  ArrayMinSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ApplyGuruDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  specialty!: string[];

  @IsString()
  @MinLength(50, { message: 'Bio must be at least 50 characters' })
  @MaxLength(1000)
  @Transform(({ value }) => value?.trim())
  bio!: string;

  @IsUrl({}, { message: 'Please provide a valid Upwork profile URL' })
  upworkProfileUrl!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(5, { message: 'Session rate must be at least $5' })
  @Max(500, { message: 'Session rate cannot exceed $500' })
  sessionRate!: number;
}
