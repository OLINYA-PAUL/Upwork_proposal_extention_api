import {
  IsString,
  IsUrl,
  IsOptional,
  IsArray,
  ValidateNested,
  MinLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

class ScreeningQuestionDto {
  @IsString()
  @MinLength(3)
  question!: string;
}

export class GenerateProposalDto {
  @IsString()
  @MinLength(3)
  @Transform(({ value }) => value?.trim())
  jobTitle!: string;

  @IsUrl({}, { message: 'jobUrl must be a valid URL' })
  jobUrl!: string;

  @IsString()
  @MinLength(20, { message: 'Job description is too short' })
  @Transform(({ value }) => value?.trim())
  jobDescription!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScreeningQuestionDto)
  screeningQuestions?: ScreeningQuestionDto[];
}
