import { IsString, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateCommentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  @Transform(({ value }) => value?.trim())
  comment!: string;
}
