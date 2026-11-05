import { z } from "../zod";
import { Locale, UserRole } from "../enums";

/**
 * The prefix of a Generated Name in each app locale: "Driver 4821". RU and TK
 * are drafts awaiting a native-speaker pass (#353, slicing answer 4).
 */
export const GENERATED_NAME_PREFIX: Readonly<Record<Locale, string>> = {
  en: "Driver",
  ru: "Водитель",
  tk: "Sürüji",
};

/**
 * Number of car avatars bundled in the app. `avatarIndex` points into this
 * set; the order is fixed and may only grow at the end. An app that receives
 * an index it does not have takes it modulo its own set size.
 */
export const AVATAR_COUNT = 12;

const DEFAULT_LOCALE: Locale = Locale.Ru;

function isLocale(value: string): value is Locale {
  return Object.prototype.hasOwnProperty.call(GENERATED_NAME_PREFIX, value);
}

/**
 * The name to show for a User: their Display Name, trimmed, when they set
 * one; otherwise the Generated Name in the reader's locale. An unknown locale
 * falls back to the app default, Russian.
 */
export function formatDisplayName(
  user: { displayName: string | null; nameNumber: number },
  locale: string,
): string {
  const displayName = user.displayName?.trim() ?? "";
  if (displayName.length > 0) {
    return displayName;
  }
  const prefix = GENERATED_NAME_PREFIX[isLocale(locale) ? locale : DEFAULT_LOCALE];
  return `${prefix} ${user.nameNumber}`;
}

/** Fewest characters a Display Name may have, after normalizing. */
export const DISPLAY_NAME_MIN = 2;
/** Most characters a Display Name may have, after normalizing. */
export const DISPLAY_NAME_MAX = 30;

/**
 * The form a Display Name is stored in: control characters other than
 * whitespace dropped (PostgreSQL text cannot hold NUL), spaces at the ends
 * dropped and runs of whitespace turned into one space. The app counts and
 * saves this form.
 */
export function normalizeDisplayName(raw: string): string {
  return raw
    .replace(/(?!\s)\p{Cc}/gu, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Why a Display Name is refused; sent as `details.reason` on INVALID_DISPLAY_NAME. */
export const DisplayNameProblem = {
  Empty: "empty",
  TooShort: "too_short",
  TooLong: "too_long",
} as const;
export type DisplayNameProblem =
  (typeof DisplayNameProblem)[keyof typeof DisplayNameProblem];

export const InvalidDisplayNameDetailsSchema = z.object({
  reason: z.nativeEnum(DisplayNameProblem),
});
export type InvalidDisplayNameDetails = z.infer<typeof InvalidDisplayNameDetailsSchema>;

/** Number of characters as a reader counts them: Unicode code points. */
export function displayNameLength(raw: string): number {
  return Array.from(normalizeDisplayName(raw)).length;
}

/**
 * The one Display Name rule, shared by the API and the app: 2 to 30 code
 * points after normalizing. Any script, digit or emoji passes; names are not
 * unique and are not moderated. Answers nothing for an acceptable name.
 */
export function displayNameProblem(raw: string): DisplayNameProblem | undefined {
  const length = displayNameLength(raw);
  if (length === 0) return DisplayNameProblem.Empty;
  if (length < DISPLAY_NAME_MIN) return DisplayNameProblem.TooShort;
  if (length > DISPLAY_NAME_MAX) return DisplayNameProblem.TooLong;
  return undefined;
}

/**
 * Body of `PATCH /api/v1/me`. Only the name can change; other fields are
 * dropped. The rule itself is checked by the server, which answers
 * INVALID_DISPLAY_NAME with the reason.
 */
export const UpdateMeRequestSchema = z.object({
  displayName: z.string(),
});
export type UpdateMeRequest = z.infer<typeof UpdateMeRequestSchema>;

/**
 * Body of `PUT /api/v1/me/photo`. `key` is the key the image presign
 * (`POST /api/v1/uploads/presign` with `kind: "image"` and `writeProtocol:
 * "conditional-v1"`) answered, after the file reached storage with the
 * presign's required headers. The protocol is required: an upload presigned
 * without it is refused, because its file could never be deleted. Other fields
 * are dropped. The answer is the `/me` shape with `avatarKey` set;
 * `DELETE /api/v1/me/photo` takes no body and answers `/me` with
 * `avatarKey: null`.
 */
export const SetProfilePhotoRequestSchema = z.object({
  key: z.string().min(1).max(512),
});
export type SetProfilePhotoRequest = z.infer<typeof SetProfilePhotoRequestSchema>;

/**
 * Why `PUT /api/v1/me/photo` refuses an upload. The values are the Listing
 * upload codes, whose meaning is the same (declared here because the Listings
 * schemas import this file):
 * - `UPLOAD_NOT_AVAILABLE` (400): the key is not this User's unused image
 *   upload. A made-up key, another User's key, a video key and a removed
 *   photo's key all answer this.
 * - `UPLOAD_OBJECT_INVALID` (400): storage holds no file for the upload, or
 *   one that is empty, over 5 MB or of another type than presigned.
 * - `UPLOAD_ALREADY_ATTACHED` (409): this User's upload is already in use.
 *   `details.reason` (`ProfilePhotoConflictReason`) says how.
 * After a 400 the app presigns again.
 */
export const ProfilePhotoErrorCode = {
  UploadNotAvailable: "UPLOAD_NOT_AVAILABLE",
  UploadAlreadyAttached: "UPLOAD_ALREADY_ATTACHED",
  UploadObjectInvalid: "UPLOAD_OBJECT_INVALID",
} as const;
export type ProfilePhotoErrorCode =
  (typeof ProfilePhotoErrorCode)[keyof typeof ProfilePhotoErrorCode];

/**
 * `details.reason` of a 409 from `PUT /api/v1/me/photo`. Both are about the
 * caller's own upload; another User's key answers `UPLOAD_NOT_AVAILABLE`.
 * - `UPLOAD_PREPARING`: another request for this key is still setting it as
 *   the photo. The app waits and sends the same key again; that answers the
 *   photo once the first request finished, or `UPLOAD_NOT_AVAILABLE` if it
 *   failed. A request that died holds the key for up to 10 minutes.
 * - `UPLOAD_ATTACHED_TO_LISTING`: the upload belongs to a Listing. The app
 *   presigns another file.
 */
export const ProfilePhotoConflictReason = {
  UploadPreparing: "UPLOAD_PREPARING",
  UploadAttachedToListing: "UPLOAD_ATTACHED_TO_LISTING",
} as const;
export type ProfilePhotoConflictReason =
  (typeof ProfilePhotoConflictReason)[keyof typeof ProfilePhotoConflictReason];

export const ProfilePhotoConflictDetailsSchema = z.object({
  reason: z.enum([
    ProfilePhotoConflictReason.UploadPreparing,
    ProfilePhotoConflictReason.UploadAttachedToListing,
  ]),
});
export type ProfilePhotoConflictDetails = z.infer<typeof ProfilePhotoConflictDetailsSchema>;

/**
 * What one User may see of another (#644): the name they set or null, the
 * number and car avatar index for their Generated Name and Assigned Avatar,
 * and the Profile Photo key, null when the User has none. `deleted` is true for a
 * User purged after account deletion: no name and no photo, and the app keeps
 * its deleted-User wording and person icon. Never carries a Sign-in Method,
 * the role or an upload id. Compose the name with `formatDisplayName`.
 */
export const PublicIdentitySchema = z.object({
  displayName: z.string().nullable(),
  nameNumber: z.number().int().min(1000).max(9999),
  avatarIndex: z.number().int().nonnegative(),
  avatarKey: z.string().nullable(),
  deleted: z.boolean(),
});
export type PublicIdentity = z.infer<typeof PublicIdentitySchema>;

export const UserSummarySchema = z.object({
  id: z.string().guid(),
  phone: z.string(),
  displayName: z.string().nullable(),
  role: z.nativeEnum(UserRole),
});
export type UserSummary = z.infer<typeof UserSummarySchema>;

export const BlockUserRequestSchema = z.object({
  userId: z.string().guid(),
});
export type BlockUserRequest = z.infer<typeof BlockUserRequestSchema>;

export const BlockUserResponseSchema = z.object({
  blocked: z.literal(true),
});
export type BlockUserResponse = z.infer<typeof BlockUserResponseSchema>;

export const UnblockUserResponseSchema = z.object({
  unblocked: z.literal(true),
});
export type UnblockUserResponse = z.infer<typeof UnblockUserResponseSchema>;

export const IsBlockedResponseSchema = z.object({
  blocked: z.boolean(),
});
export type IsBlockedResponse = z.infer<typeof IsBlockedResponseSchema>;
