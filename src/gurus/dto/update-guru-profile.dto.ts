import {
  IsString,
  IsArray,
  IsUrl,
  IsNumber,
  IsOptional,
  MinLength,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateGuruProfileDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialty?: string[];

  @IsOptional()
  @IsString()
  @MinLength(50)
  @MaxLength(1000)
  @Transform(({ value }) => value?.trim())
  bio?: string;

  @IsOptional()
  @IsUrl()
  upworkProfileUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(5)
  @Max(500)
  sessionRate?: number;
}
