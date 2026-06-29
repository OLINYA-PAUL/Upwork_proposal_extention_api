import {
  IsString,
  IsMongoId,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateTemplateDto {
  @IsMongoId()
  proposalId!: string;

  @IsMongoId()
  categoryId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  priceUsd?: number;
}
