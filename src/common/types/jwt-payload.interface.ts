export interface JwtPayload {
  sub: string;
  email: string;
  plan: string;
  role: string;
  type: 'access' | 'refresh';
}
