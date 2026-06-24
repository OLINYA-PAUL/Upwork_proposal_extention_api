import { IsBoolean } from 'class-validator';

export class UpdateTrialSettingDto {
  @IsBoolean()
  enabled!: boolean;
}
