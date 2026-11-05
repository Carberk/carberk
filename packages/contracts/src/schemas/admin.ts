import { DateTimeSchema, z } from "../zod";
import { UserRole } from "../enums";

// ── Constants ──

export const ReportReason = {
  Spam: "spam",
  Scam: "scam",
  Misleading: "misleading",
  WrongCategory: "wrong_category",
  Harassment: "harassment",
  Other: "other",
} as const;
export type ReportReason = (typeof ReportReason)[keyof typeof ReportReason];

export const MessageReportReason = {
  Spam: "spam",
  Scam: "scam",
  Misleading: "misleading",
  Harassment: "harassment",
  Other: "other",
} as const;
export type MessageReportReason =
  (typeof MessageReportReason)[keyof typeof MessageReportReason];

export const ContentReportStatus = {
  Pending: "pending",
  Actioned: "actioned",
  Dismissed: "dismissed",
} as const;
export type ContentReportStatus =
  (typeof ContentReportStatus)[keyof typeof ContentReportStatus];

export const AdminAuditAction = {
  AdminBootstrapPromote: "ADMIN_BOOTSTRAP_PROMOTE",
  ListingBan: "LISTING_BAN",
  ListingUnban: "LISTING_UNBAN",
  UserSuspend: "USER_SUSPEND",
  UserUnsuspend: "USER_UNSUSPEND",
  UserPhotoRemove: "USER_PHOTO_REMOVE",
  ContentReportResolve: "CONTENT_REPORT_RESOLVE",
  ReportedMessageRead: "REPORTED_MESSAGE_READ",
  ReviewerOtpBypassLogin: "REVIEWER_OTP_BYPASS_LOGIN",
} as const;
export type AdminAuditAction =
  (typeof AdminAuditAction)[keyof typeof AdminAuditAction];

export const AdminErrorReason = {
  ReportTargetNotReportable: "REPORT_TARGET_NOT_REPORTABLE",
  SelfReportNotAllowed: "SELF_REPORT_NOT_ALLOWED",
  TotpAlreadyEnrolled: "TOTP_ALREADY_ENROLLED",
  ReportTargetMismatch: "REPORT_TARGET_MISMATCH",
  ReportAlreadyResolved: "REPORT_ALREADY_RESOLVED",
  ReportTargetNotActionable: "REPORT_TARGET_NOT_ACTIONABLE",
  ModerationTargetStateConflict: "MODERATION_TARGET_STATE_CONFLICT",
  AdminTargetNotModeratable: "ADMIN_TARGET_NOT_MODERATABLE",
  SelfModerationNotAllowed: "SELF_MODERATION_NOT_ALLOWED",
  UserSuspended: "USER_SUSPENDED",
  FeatureDisabled: "FEATURE_DISABLED",
} as const;
export type AdminErrorReason =
  (typeof AdminErrorReason)[keyof typeof AdminErrorReason];

/** Shared refusal details for a suspended User's authenticated actions. */
export const UserSuspendedDetailsSchema = z.object({
  reason: z.literal(AdminErrorReason.UserSuspended),
});
export type UserSuspendedDetails = z.infer<typeof UserSuspendedDetailsSchema>;

export const ReportTargetType = {
  Listing: "listing",
  User: "user",
  Message: "message",
  ContentReport: "content_report",
} as const;
export type ReportTargetType =
  (typeof ReportTargetType)[keyof typeof ReportTargetType];

// ── Shared summary DTOs ──

export const TargetSummarySchema = z.object({
  available: z.boolean(),
  label: z.string(),
  targetType: z.nativeEnum(ReportTargetType),
  targetId: z.string(),
});
export type TargetSummary = z.infer<typeof TargetSummarySchema>;

export const ActorSummarySchema = z.object({
  id: z.string().guid().optional(),
  label: z.string(),
});
export type ActorSummary = z.infer<typeof ActorSummarySchema>;

// ── Report creation ──

const CreateReportBaseSchema = z.object({
  reason: z.nativeEnum(ReportReason),
  details: z.string().trim().max(1000).optional(),
});

const requireDetailsWhenOther = (
  data: z.infer<typeof CreateReportBaseSchema>,
) => {
  if (data.reason === ReportReason.Other) {
    return typeof data.details === "string" && data.details.trim().length > 0;
  }
  return true;
};

export const CreateReportRequestSchema = CreateReportBaseSchema.refine(
  requireDetailsWhenOther,
  { message: "Details required when reason is other", path: ["details"] },
);
export type CreateReportRequest = z.infer<typeof CreateReportRequestSchema>;

export const CreateReportResponseSchema = z.object({
  reportId: z.string().guid(),
  status: z.nativeEnum(ContentReportStatus),
  createdAt: DateTimeSchema,
  reusedExisting: z.boolean(),
});
export type CreateReportResponse = z.infer<typeof CreateReportResponseSchema>;

export const CreateMessageReportRequestSchema = z
  .object({
    reason: z.nativeEnum(MessageReportReason),
    details: z.string().trim().max(1000).optional(),
  })
  .refine(
    (data) => {
      if (data.reason === MessageReportReason.Other) {
        return typeof data.details === "string" && data.details.trim().length > 0;
      }
      return true;
    },
    { message: "Details required when reason is other", path: ["details"] },
  );
export type CreateMessageReportRequest = z.infer<
  typeof CreateMessageReportRequestSchema
>;

// ── Report list ──

export const ReportListItemSchema = z.object({
  id: z.string().guid(),
  status: z.nativeEnum(ContentReportStatus),
  createdAt: DateTimeSchema,
  reason: z.nativeEnum(ReportReason),
  targetType: z.nativeEnum(ReportTargetType),
  targetId: z.string(),
  targetSummary: TargetSummarySchema,
});
export type ReportListItem = z.infer<typeof ReportListItemSchema>;

export const ListReportsResponseSchema = z.object({
  items: z.array(ReportListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalPages: z.number().int().nonnegative(),
});
export type ListReportsResponse = z.infer<typeof ListReportsResponseSchema>;

// ── Report detail ──

export const ReporterSummarySchema = z.object({
  available: z.boolean(),
  label: z.string(),
  userId: z.string().guid().optional(),
});
export type ReporterSummary = z.infer<typeof ReporterSummarySchema>;

export const ReportDetailTargetSchema = z.object({
  targetType: z.nativeEnum(ReportTargetType),
  available: z.boolean(),
  label: z.string(),
  targetId: z.string(),
  title: z.string().optional(),
  year: z.number().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  status: z.string().optional(),
  role: z.string().optional(),
  avatarKey: z.string().nullable().optional(),
  avatarIndex: z.number().int().nonnegative().optional(),
  conversationId: z.string().guid().optional(),
  listingId: z.string().guid().optional(),
  senderId: z.string().guid().optional(),
  messageCreatedAt: DateTimeSchema.optional(),
  messageBody: z.string().optional(),
  messageDeletedAt: DateTimeSchema.nullish(),
  messageHasAttachment: z.boolean().optional(),
  sender: z.object({
    available: z.boolean(),
    label: z.string(),
    userId: z.string().guid().optional(),
    role: z.nativeEnum(UserRole).optional(),
  }).optional(),
});
export type ReportDetailTarget = z.infer<typeof ReportDetailTargetSchema>;

export const GetReportDetailResponseSchema = z.object({
  id: z.string().guid(),
  status: z.nativeEnum(ContentReportStatus),
  reason: z.nativeEnum(ReportReason),
  details: z.string().optional(),
  createdAt: DateTimeSchema,
  reviewedAt: DateTimeSchema.optional(),
  reporter: ReporterSummarySchema,
  reviewer: ReporterSummarySchema.optional(),
  target: ReportDetailTargetSchema,
  targetModerationState: z
    .object({
      status: z.string().optional(),
      suspendedAt: DateTimeSchema.nullable().optional(),
      suspendedById: z.string().guid().nullable().optional(),
      suspensionReason: z.string().nullable().optional(),
    })
    .optional(),
  reportsSubmittedByReporterCount: z.number().int().nonnegative().optional(),
  pendingReportsOnTargetCount: z.number().int().nonnegative(),
});
export type GetReportDetailResponse = z.infer<
  typeof GetReportDetailResponseSchema
>;

// ── Moderation commands ──

const AdminActionReasonSchema = z.string().trim().min(1).max(1000);

export const DismissReportRequestSchema = z.object({
  reason: AdminActionReasonSchema,
});
export type DismissReportRequest = z.infer<typeof DismissReportRequestSchema>;

export const DismissReportResponseSchema = z.object({
  reportId: z.string().guid(),
  status: z.literal(ContentReportStatus.Dismissed),
  reviewedAt: DateTimeSchema,
  auditLogId: z.string().guid(),
});
export type DismissReportResponse = z.infer<typeof DismissReportResponseSchema>;

export const BanListingRequestSchema = z.object({
  reason: AdminActionReasonSchema,
  reportId: z.string().guid().optional(),
});
export type BanListingRequest = z.infer<typeof BanListingRequestSchema>;

export const BanListingResponseSchema = z.object({
  targetId: z.string().guid(),
  targetState: z.object({
    status: z.string().optional(),
    suspendedAt: DateTimeSchema.nullable().optional(),
    suspendedById: z.string().guid().nullable().optional(),
    suspensionReason: z.string().nullable().optional(),
  }),
  reportId: z.string().guid().optional(),
  reportStatus: z.literal(ContentReportStatus.Actioned).optional(),
  auditLogId: z.string().guid(),
});
export type BanListingResponse = z.infer<typeof BanListingResponseSchema>;

export const UnbanListingRequestSchema = z
  .object({
    reason: AdminActionReasonSchema,
  })
  .strict();
export type UnbanListingRequest = z.infer<typeof UnbanListingRequestSchema>;

export const UnbanListingResponseSchema = z.object({
  targetId: z.string().guid(),
  targetState: z.object({
    status: z.string().optional(),
    suspendedAt: DateTimeSchema.nullable().optional(),
    suspendedById: z.string().guid().nullable().optional(),
    suspensionReason: z.string().nullable().optional(),
  }),
  auditLogId: z.string().guid(),
});
export type UnbanListingResponse = z.infer<typeof UnbanListingResponseSchema>;

export const SuspendUserRequestSchema = z.object({
  reason: AdminActionReasonSchema,
  reportId: z.string().guid().optional(),
});
export type SuspendUserRequest = z.infer<typeof SuspendUserRequestSchema>;

export const SuspendUserResponseSchema = z.object({
  targetId: z.string().guid(),
  targetState: z.object({
    status: z.string().optional(),
    suspendedAt: DateTimeSchema.nullable().optional(),
    suspendedById: z.string().guid().nullable().optional(),
    suspensionReason: z.string().nullable().optional(),
  }),
  reportId: z.string().guid().optional(),
  reportStatus: z.literal(ContentReportStatus.Actioned).optional(),
  auditLogId: z.string().guid(),
});
export type SuspendUserResponse = z.infer<typeof SuspendUserResponseSchema>;

export const UnsuspendUserRequestSchema = z
  .object({
    reason: AdminActionReasonSchema,
  })
  .strict();
export type UnsuspendUserRequest = z.infer<typeof UnsuspendUserRequestSchema>;

export const UnsuspendUserResponseSchema = z.object({
  targetId: z.string().guid(),
  targetState: z.object({
    status: z.string().optional(),
    suspendedAt: DateTimeSchema.nullable().optional(),
    suspendedById: z.string().guid().nullable().optional(),
    suspensionReason: z.string().nullable().optional(),
  }),
  auditLogId: z.string().guid(),
});
export type UnsuspendUserResponse = z.infer<typeof UnsuspendUserResponseSchema>;

/**
 * `POST /api/v1/admin/users/{id}/remove-photo`: a moderator removes a User's
 * Profile Photo, which shows their Assigned Avatar again. With `reportId`, a
 * pending report on that User becomes actioned in the same transaction. A User
 * with no photo answers 409 `MODERATION_TARGET_STATE_CONFLICT`.
 */
export const RemoveUserPhotoRequestSchema = z.object({
  reason: AdminActionReasonSchema,
  reportId: z.string().guid().optional(),
});
export type RemoveUserPhotoRequest = z.infer<typeof RemoveUserPhotoRequestSchema>;

export const RemoveUserPhotoResponseSchema = z.object({
  targetId: z.string().guid(),
  targetState: z.object({
    avatarKey: z.null(),
    avatarIndex: z.number().int().nonnegative(),
  }),
  reportId: z.string().guid().optional(),
  reportStatus: z.literal(ContentReportStatus.Actioned).optional(),
  auditLogId: z.string().guid(),
});
export type RemoveUserPhotoResponse = z.infer<typeof RemoveUserPhotoResponseSchema>;

// ── Audit ──

export const AuditLogListItemSchema = z.object({
  id: z.string().guid(),
  createdAt: DateTimeSchema,
  action: z.nativeEnum(AdminAuditAction),
  actorSummary: ActorSummarySchema,
  targetType: z.string(),
  targetId: z.string(),
  targetLabel: z.string().optional(),
  reasonPreview: z.string().optional(),
});
export type AuditLogListItem = z.infer<typeof AuditLogListItemSchema>;

export const ListAuditEntriesResponseSchema = z.object({
  items: z.array(AuditLogListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalPages: z.number().int().nonnegative(),
});
export type ListAuditEntriesResponse = z.infer<
  typeof ListAuditEntriesResponseSchema
>;

// ── Config ──

export const ConfigResponseSchema = z.object({
  reportEntryEnabled: z.boolean(),
  adminModerationActionsEnabled: z.boolean(),
  inspectionInterestEnabled: z.boolean(),
});
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>;
