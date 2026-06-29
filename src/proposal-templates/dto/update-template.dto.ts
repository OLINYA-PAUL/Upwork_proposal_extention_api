import {
  IsString,
  IsMongoId,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TemplateStatus } from '@prisma/client';

export class UpdateTemplateDto {
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  priceUsd?: number;

  @IsOptional()
  @IsEnum(TemplateStatus)
  status?: TemplateStatus;
}
