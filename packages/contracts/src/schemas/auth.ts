import { z } from "zod";

import { Locale, SignInCodePurpose, UserRole } from "../enums";

export const PhoneTm = z.string().regex(
  /^\+993[67]\d{7}$/,
  "Phone must be +993[6-7]XXXXXXX (TM mobile)",
);

export const EmailAddress = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

export const OtpRequestRequestSchema = z.union([
  z.object({ phone: PhoneTm }).strict(),
  z.object({ email: EmailAddress }).strict(),
]);
export type OtpRequestRequest = z.infer<typeof OtpRequestRequestSchema>;

export const OtpRequestResponseSchema = z.object({
  requestId: z.string().uuid(),
  resendInSeconds: z.number().int(),
  testCode: z.string().optional(),
});
export type OtpRequestResponse = z.infer<typeof OtpRequestResponseSchema>;

const OtpVerifyFields = {
  code: z.string().regex(/^\d{6}$/),
  deviceLabel: z.string().max(200).optional(),
};

export const OtpVerifyRequestSchema = z.union([
  z.object({ phone: PhoneTm, ...OtpVerifyFields }).strict(),
  z.object({ email: EmailAddress, ...OtpVerifyFields }).strict(),
]);
export type OtpVerifyRequest = z.infer<typeof OtpVerifyRequestSchema>;

export const OtpVerifyResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    phone: PhoneTm.nullable(),
    email: z.string().email().nullable(),
    displayName: z.string().nullable(),
    role: z.nativeEnum(UserRole),
    deletionScheduledAt: z.string().datetime().nullable().optional(),
  }),
});
export type OtpVerifyResponse = z.infer<typeof OtpVerifyResponseSchema>;

export const SignInMethodChangeRequestSchema = OtpRequestRequestSchema;
export type SignInMethodChangeRequest = z.infer<
  typeof SignInMethodChangeRequestSchema
>;

export const SignInMethodChangeVerifyRequestSchema = z.union([
  z.object({ phone: PhoneTm, code: OtpVerifyFields.code }).strict(),
  z.object({ email: EmailAddress, code: OtpVerifyFields.code }).strict(),
]);
export type SignInMethodChangeVerifyRequest = z.infer<
  typeof SignInMethodChangeVerifyRequestSchema
>;

// Public web deletion request (ADR-0054). Both endpoints answer the same way
// whether or not a User holds the value.
export const AccountDeletionRequestSchema = OtpRequestRequestSchema;
export type AccountDeletionRequest = z.infer<typeof AccountDeletionRequestSchema>;

export const AccountDeletionRequestResponseSchema = OtpRequestResponseSchema;
export type AccountDeletionRequestResponse = z.infer<
  typeof AccountDeletionRequestResponseSchema
>;

export const AccountDeletionConfirmRequestSchema =
  SignInMethodChangeVerifyRequestSchema;
export type AccountDeletionConfirmRequest = z.infer<
  typeof AccountDeletionConfirmRequestSchema
>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string(),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const LogoutRequestSchema = z.object({
  refreshToken: z.string(),
});
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

// No request body — uses bearer access token
export const LogoutAllResponseSchema = z.object({});

export const MeResponseSchema = z.object({
  id: z.string().uuid(),
  // Sign-in Methods (ADR-0054): each is optional; phoneVerified reflects a stored verified phone.
  phone: PhoneTm.nullable(),
  email: z.string().email().nullable(),
  phoneVerified: z.boolean(),
  displayName: z.string().nullable(),
  role: z.nativeEnum(UserRole),
  avatarUrl: z.string().nullable(),
  locale: z.string().nullable(),
  createdAt: z.string().datetime(),
  deletionScheduledAt: z.string().datetime().nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const SignInMethodChangeResponseSchema = MeResponseSchema;
export type SignInMethodChangeResponse = z.infer<
  typeof SignInMethodChangeResponseSchema
>;

// `POST /me/restore` has no request body, uses the bearer access token, and
// answers with the updated `/me`. Calling it with no scheduled deletion
// changes nothing and succeeds.
export const RestoreAccountResponseSchema = MeResponseSchema;
export type RestoreAccountResponse = z.infer<typeof RestoreAccountResponseSchema>;

// `details.reason` of the 403 a session gets for a marketplace change while
// its User's deletion is scheduled (ADR-0032). The session may still read
// `/me`, restore the account, and log out.
export const ACCOUNT_DELETION_PENDING_REASON = "ACCOUNT_DELETION_PENDING" as const;

// No request body — uses bearer access token; returns 204
export const DeleteMeResponseSchema = z.object({});

// ── Admin TOTP schemas (S7) ──

export const AdminTotpStatusResponseSchema = z
  .object({
    enrolled: z.boolean(),
    elevated: z.boolean(),
    adminTotpExpiresAt: z.string().datetime().optional(),
  })
  .strict();
export type AdminTotpStatusResponse = z.infer<
  typeof AdminTotpStatusResponseSchema
>;

export const AdminTotpEnrollResponseSchema = z
  .object({
    qrCodeUrl: z.string(),
    secret: z.string(),
  })
  .strict();
export type AdminTotpEnrollResponse = z.infer<
  typeof AdminTotpEnrollResponseSchema
>;

export const AdminTotpVerifyRequestSchema = z.object({
  code: z.string().min(1),
});
export type AdminTotpVerifyRequest = z.infer<
  typeof AdminTotpVerifyRequestSchema
>;

// First enrollment verify returns backupCodes (exactly 10); later verify does not.
export const AdminTotpVerifyResponseSchema = z
  .object({
    adminTotpExpiresAt: z.string().datetime(),
    backupCodes: z.array(z.string()).length(10).optional(),
  })
  .strict();
export type AdminTotpVerifyResponse = z.infer<
  typeof AdminTotpVerifyResponseSchema
>;

// ── Worker sign-in code email job payload (API → worker, ADR-0055) ──

export const EMAIL_CODE_QUEUE = "email-code" as const;
export const EMAIL_CODE_JOB_NAME = "sign-in-code" as const;

/**
 * The job ID is the Resend idempotency key, so the producer must give every
 * job a globally unique `jobId` (for example the code request's UUID), not
 * BullMQ's per-queue counter.
 */
export const EmailCodeJobSchema = z.object({
  to: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  locale: z.nativeEnum(Locale),
  purpose: z.nativeEnum(SignInCodePurpose),
});
export type EmailCodeJob = z.infer<typeof EmailCodeJobSchema>;
