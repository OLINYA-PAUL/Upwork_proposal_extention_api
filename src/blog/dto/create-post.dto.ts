import {
  IsString,
  IsMongoId,
  IsOptional,
  IsArray,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePostDto {
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  title!: string;

  @IsString()
  @MinLength(100, { message: 'Content must be at least 100 characters' })
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  excerpt?: string;

  @IsMongoId()
  categoryId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(70)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  metaDescription?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  metaKeywords?: string[];
}
