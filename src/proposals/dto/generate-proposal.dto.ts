import { IsString, IsOptional, IsUrl } from 'class-validator';
import { Transform } from 'class-transformer';

export class GenerateProposalDto {
  @IsString()
  @Transform(({ value }) => value?.trim())
  jobTitle!: string;

  @IsUrl()
  jobUrl!: string;

  @IsString()
  jobDescription!: string;

  @IsOptional()
  @IsString()
  jobBudget?: string;

  @IsOptional()
  @IsString()
  clientLocation?: string;

  @IsOptional()
  @IsString()
  clientHireRate?: string;

  @IsOptional()
  @IsString()
  clientTotalSpent?: string;

  @IsOptional()
  screeningQuestions?: { question: string }[];
}
