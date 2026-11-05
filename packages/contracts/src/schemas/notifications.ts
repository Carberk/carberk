import { DateTimeSchema, z } from "../zod";
import { NotificationCategory, PushPlatform } from "../enums";

export const NotificationCategorySchema = z.nativeEnum(NotificationCategory);
export type NotificationCategoryType = z.infer<
  typeof NotificationCategorySchema
>;

export const PushPlatformSchema = z.nativeEnum(PushPlatform);
export type PushPlatformType = z.infer<typeof PushPlatformSchema>;

export const NotificationSummarySchema = z.object({
  id: z.string().guid(),
  category: NotificationCategorySchema,
  title: z.string(),
  body: z.string(),
  read: z.boolean(),
  createdAt: DateTimeSchema,
});
export type NotificationSummary = z.infer<typeof NotificationSummarySchema>;

// ── Direct-message push-token registration (native FCM/APNS tokens) ──

export const RegisterPushTokenRequestSchema = z.object({
  token: z.string().min(1),
  platform: PushPlatformSchema,
  deviceId: z.string().optional(),
});
export type RegisterPushTokenRequest = z.infer<
  typeof RegisterPushTokenRequestSchema
>;

export const PushTokenSummarySchema = z.object({
  id: z.string().guid(),
  token: z.string(),
  platform: PushPlatformSchema,
  deviceId: z.string().optional(),
  createdAt: DateTimeSchema,
  lastSeenAt: DateTimeSchema,
});
export type PushTokenSummary = z.infer<typeof PushTokenSummarySchema>;

export const RegisterPushTokenResponseSchema = z.object({
  registered: z.boolean(),
  invalidatedPrevious: z.boolean().optional(),
  token: PushTokenSummarySchema,
});
export type RegisterPushTokenResponse = z.infer<
  typeof RegisterPushTokenResponseSchema
>;

export const ListPushTokensResponseSchema = z.object({
  items: z.array(PushTokenSummarySchema),
});
export type ListPushTokensResponse = z.infer<
  typeof ListPushTokensResponseSchema
>;

export const RevokePushTokenResponseSchema = z.object({
  revoked: z.boolean(),
});
export type RevokePushTokenResponse = z.infer<
  typeof RevokePushTokenResponseSchema
>;

// ── Worker direct-message push job payload (API → worker) ──

export const DIRECT_MESSAGE_PUSH_JOB_NAME = "direct-message" as const;

export const DirectMessagePushJobSchema = z.object({
  category: NotificationCategorySchema,
  recipientUserId: z.string().guid(),
  historyId: z.string().guid(),
  title: z.string(),
  body: z.string(),
  deepLink: z.string(),
  data: z.record(z.string(), z.unknown()),
});
export type DirectMessagePushJob = z.infer<typeof DirectMessagePushJobSchema>;

// ── Per-category opt-outs (direct_messages is not globally disableable) ──

export const NotificationPreferenceOptOut = {
  Push: "push",
  Digest: "digest",
  None: "none",
} as const;
export type NotificationPreferenceOptOut =
  (typeof NotificationPreferenceOptOut)[keyof typeof NotificationPreferenceOptOut];

export const NotificationPreferenceOptOutSchema = z.enum(
  Object.values(NotificationPreferenceOptOut) as [
    NotificationPreferenceOptOut,
    ...NotificationPreferenceOptOut[],
  ],
);
export type NotificationPreferenceOptOutType = z.infer<
  typeof NotificationPreferenceOptOutSchema
>;

export const NotificationPreferencesSchema = z.object({
  optOuts: z.partialRecord(NotificationCategorySchema, NotificationPreferenceOptOutSchema),
});
export type NotificationPreferences = z.infer<
  typeof NotificationPreferencesSchema
>;

export const UpdateNotificationPreferencesRequestSchema =
  NotificationPreferencesSchema;
export type UpdateNotificationPreferencesRequest = z.infer<
  typeof UpdateNotificationPreferencesRequestSchema
>;

export const UpdateNotificationPreferencesResponseSchema =
  NotificationPreferencesSchema;
export type UpdateNotificationPreferencesResponse = z.infer<
  typeof UpdateNotificationPreferencesResponseSchema
>;
