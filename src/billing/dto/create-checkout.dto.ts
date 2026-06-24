import { IsEnum } from 'class-validator';

export enum CheckoutPlan {
  STARTER = 'STARTER',
  PRO = 'PRO',
}

export class CreateCheckoutDto {
  @IsEnum(CheckoutPlan, {
    message: 'Plan must be either STARTER or PRO',
  })
  plan!: CheckoutPlan;
}
