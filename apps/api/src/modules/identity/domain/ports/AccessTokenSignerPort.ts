export interface AccessTokenClaims {
  sub: string;
  sid: string;
  phone: string | null;
  email: string | null;
  role: string;
}

export interface AccessTokenSignerPort {
  sign(claims: AccessTokenClaims): string;
}
