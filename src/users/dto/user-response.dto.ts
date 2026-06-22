export class UserResponseDto {
  id!: string;
  name!: string;
  email!: string;
  role!: string;
  plan!: string;
  avatarUrl!: string | null;
  emailVerified!: boolean;
  createdAt!: Date;
}

export class AdminUserResponseDto extends UserResponseDto {
  proposalsThisMonth!: number;
  proposalsToday!: number;
  lastLoginAt!: Date | null;
  deletedAt!: Date | null;
  restricted!: boolean;
  referredById!: string | null;
}

export function toUserResponse(user: any): UserResponseDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.plan,
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}

export function toAdminUserResponse(user: any): AdminUserResponseDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.plan,
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    proposalsThisMonth: user.proposalsThisMonth,
    proposalsToday: user.proposalsToday,
    lastLoginAt: user.lastLoginAt ?? null,
    deletedAt: user.deletedAt ?? null,
    restricted: user.restricted ?? false,
    referredById: user.referredById ?? null,
  };
}
