/** One-way storage for high-entropy random refresh tokens, never passwords. */
export interface RefreshTokenHasherPort {
  hash(plaintext: string): Promise<string>;
}
