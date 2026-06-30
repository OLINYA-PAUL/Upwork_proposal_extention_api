export function toPublicGuru(guru: any) {
  return {
    id: guru.id,
    name: guru.user?.name,
    avatarUrl: guru.user?.avatarUrl ?? null,
    specialty: guru.specialty,
    bio: guru.bio,
    upworkProfileUrl: guru.upworkProfileUrl,
    sessionRate: guru.sessionRate,
    rating: guru.rating,
    reviewCount: guru.reviewCount,
    status: guru.status,
  };
}

export function toGuruProfile(guru: any) {
  return {
    id: guru.id,
    userId: guru.userId,
    name: guru.user?.name,
    email: guru.user?.email,
    avatarUrl: guru.user?.avatarUrl ?? null,
    specialty: guru.specialty,
    bio: guru.bio,
    upworkProfileUrl: guru.upworkProfileUrl,
    sessionRate: guru.sessionRate,
    rating: guru.rating,
    reviewCount: guru.reviewCount,
    status: guru.status,
    createdAt: guru.createdAt,
  };
}
