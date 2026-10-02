/**
 * The only identity imports other API modules may use, besides `IdentityModule`
 * itself. It mirrors the providers `IdentityModule` exports; lint enforces it.
 */
import { IDENTITY_TOKENS } from "./identity.tokens";

export { accountDeletionPendingException } from "./application/accountDeletionPendingException";
export type { ClockPort } from "./domain/ports/ClockPort";
export type { IdentityCheckPort } from "./domain/ports/IdentityCheckPort";
export type { Session } from "./domain/Session";
export type { SessionRepository } from "./domain/ports/SessionRepository";
export {
  IDENTITY_ADMIN_PORT,
  type IdentityAdminPort,
} from "./domain/ports/IdentityAdminPort";
export {
  IDENTITY_READ_PORT,
  type IdentityReadPort,
  type IdentityUserSummary,
} from "./domain/ports/IdentityReadPort";
export {
  SELLER_PROFILE_READ_PORT,
  type SellerProfile,
  type SellerProfileReadPort,
} from "./domain/ports/SellerProfileReadPort";

export const IDENTITY_CHECK_PORT = IDENTITY_TOKENS.IdentityCheckPort;
export const IDENTITY_SESSION_REPOSITORY = IDENTITY_TOKENS.SessionRepository;
export const IDENTITY_CLOCK_PORT = IDENTITY_TOKENS.ClockPort;
