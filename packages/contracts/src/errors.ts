import { DateTimeSchema, z } from "./zod";

export const ErrorCode = {
  ValidationFailed: "VALIDATION_FAILED",
  Unauthorized: "UNAUTHORIZED",
  Forbidden: "FORBIDDEN",
  NotFound: "NOT_FOUND",
  UserNotFound: "USER_NOT_FOUND",
  Conflict: "CONFLICT",
  RateLimited: "RATE_LIMITED",
  OtpExpired: "OTP_EXPIRED",
  OtpAlreadyUsed: "OTP_ALREADY_USED",
  InvalidOtp: "INVALID_OTP",
  OtpLocked: "OTP_LOCKED",
  OtpNotFound: "OTP_NOT_FOUND",
  SignInMethodTaken: "SIGN_IN_METHOD_TAKEN",
  InvalidDisplayName: "INVALID_DISPLAY_NAME",
  Internal: "INTERNAL",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// Why a Sign-in Code request was refused (ADR-0054 "Codes and limits"). Sent
// as `details` on a RATE_LIMITED error from the three code-request endpoints.
// The reason depends only on the destination and IP counts, never on whether a
// User holds the destination.
export const RateLimitReason = {
  DestinationLimit: "destination_limit",
  IpLimit: "ip_limit",
  Backoff: "backoff",
} as const;
export type RateLimitReason =
  (typeof RateLimitReason)[keyof typeof RateLimitReason];

export const RateLimitReasonSchema = z.nativeEnum(RateLimitReason);

export const RateLimitedDetailsSchema = z.object({
  reason: RateLimitReasonSchema,
  // Remaining wait for `backoff`; 0 for the limits, which clear with a window.
  retryInSeconds: z.number().int().nonnegative(),
});
export type RateLimitedDetails = z.infer<typeof RateLimitedDetailsSchema>;

// Sent as `details` on INVALID_OTP while the code still has tries (ADR-0081).
// The fifth wrong code answers OTP_LOCKED instead, so the count is 1 to 4.
export const InvalidOtpDetailsSchema = z.object({
  attemptsLeft: z.number().int().min(1).max(4),
});
export type InvalidOtpDetails = z.infer<typeof InvalidOtpDetailsSchema>;

export const ErrorResponseSchema = z.object({
  statusCode: z.number().int(),
  code: z.nativeEnum(ErrorCode),
  message: z.string(),
  details: z.unknown().optional(),
  timestamp: DateTimeSchema,
  requestId: z.string().guid(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** UPLOAD_OBJECT_INVALID identifies a client-known key, and the draft photo when publishing. */
export const UploadObjectInvalidDetailsSchema = z.object({
  key: z.string().min(1),
  photoId: z.string().guid().optional(),
}).strict();
export type UploadObjectInvalidDetails = z.infer<typeof UploadObjectInvalidDetailsSchema>;

export const UploadObjectInvalidResponseSchema = ErrorResponseSchema.extend({
  code: z.literal("UPLOAD_OBJECT_INVALID"),
  details: UploadObjectInvalidDetailsSchema,
});
export type UploadObjectInvalidResponse = z.infer<typeof UploadObjectInvalidResponseSchema>;
