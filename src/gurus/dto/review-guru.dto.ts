import { IsInt, IsString, Min, Max, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class ReviewGuruDto {
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Rating must be between 1 and 5' })
  @Max(5, { message: 'Rating must be between 1 and 5' })
  rating!: number;

  @IsString()
  @MinLength(10, { message: 'Please provide a detailed review' })
  comment!: string;
}
