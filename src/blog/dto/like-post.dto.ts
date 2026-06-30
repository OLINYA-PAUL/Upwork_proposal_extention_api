import { IsString, IsOptional } from 'class-validator';

export class LikePostDto {
  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  screenResolution?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  colorDepth?: string;
}
