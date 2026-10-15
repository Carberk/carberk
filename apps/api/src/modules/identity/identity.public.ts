/**
 * The only identity imports other API modules may use, besides `IdentityModule`
 * itself. It mirrors the providers `IdentityModule` exports; lint enforces it.
 */
import { IDENTITY_TOKENS } from "./identity.tokens";

export { accountDeletionPendingException } from "./application/accountDeletionPendingException";
export { contactPhoneCodeException } from "./presentation/contactPhoneCodeException";
export type { ClockPort } from "./domain/ports/ClockPort";
export type { IdentityCheckPort } from "./domain/ports/IdentityCheckPort";
export type {
  ContactPhoneCodePort,
  ContactPhoneCodeSent,
} from "./domain/ports/ContactPhoneCodePort";
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
  PROFILE_PHOTO_PORT,
  type ProfilePhotoPort,
} from "./domain/ports/ProfilePhotoPort";
export type { PublicIdentity } from "./domain/ports/PublicIdentity";
export {
  SELLER_PROFILE_READ_PORT,
  type SellerProfile,
  type SellerProfileReadPort,
} from "./domain/ports/SellerProfileReadPort";

export const IDENTITY_CHECK_PORT = IDENTITY_TOKENS.IdentityCheckPort;
export const CONTACT_PHONE_CODE_PORT = IDENTITY_TOKENS.ContactPhoneCodePort;
export const IDENTITY_SESSION_REPOSITORY = IDENTITY_TOKENS.SessionRepository;
export const IDENTITY_CLOCK_PORT = IDENTITY_TOKENS.ClockPort;

export { STAFF_AUTHORITY_PORT, StaffAuthorityDenied, type StaffAuthorityPort, type StaffSubject, type StaffSummary } from "./domain/ports/StaffAuthorityPort";

export { BUSINESS_AUTHORITY_PORT, BusinessAuthorityDenied, type BusinessAuthorityPort, type BusinessSubject, type BusinessPrincipal } from "./domain/ports/BusinessAuthorityPort";
