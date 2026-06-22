import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { Role, Plan } from '@prisma/client';

export class AdminUpdateRoleDto {
  @IsEnum(Role)
  role!: Role;
}

export class AdminUpdatePlanDto {
  @IsEnum(Plan)
  plan!: Plan;
}

export class AdminRestrictUserDto {
  @IsBoolean()
  restricted!: boolean;
}
