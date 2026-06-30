import { IsString, IsEmail, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCommentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }) => value?.trim())
  name!: string;

  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  @Transform(({ value }) => value?.trim())
  comment!: string;
}
