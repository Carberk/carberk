import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import {
  ErrorResponseSchema,
  InvalidOtpDetailsSchema,
  RateLimitedDetailsSchema,
} from "./errors";
import { AdminTablePaginationRequestSchema } from "./pagination";
import {
  OtpRequestRequestSchema,
  OtpRequestResponseSchema,
  OtpVerifyRequestSchema,
  OtpVerifyResponseSchema,
  SignInMethodChangeRequestSchema,
  SignInMethodChangeVerifyRequestSchema,
  SignInMethodChangeResponseSchema,
  AccountDeletionRequestSchema,
  AccountDeletionRequestResponseSchema,
  AccountDeletionConfirmRequestSchema,
  RefreshRequestSchema,
  RefreshResponseSchema,
  LogoutRequestSchema,
  AdminTotpStatusResponseSchema,
  AdminTotpEnrollResponseSchema,
  AdminTotpVerifyRequestSchema,
  AdminTotpVerifyResponseSchema,
} from "./schemas/auth";
import {
  BrandSummarySchema,
  BrandDetailSchema,
  ModelSummarySchema,
  ModelDetailSchema,
  GenerationSummarySchema,
  GenerationDetailSchema,
  ColorSummarySchema,
  ColorDetailSchema,
  BodyTypeSummarySchema,
  BodyTypeDetailSchema,
  RegionSummarySchema,
  RegionDetailSchema,
  CitySummarySchema,
  CityDetailSchema,
  CreateBrandRequestSchema,
  UpdateBrandRequestSchema,
  DeleteBrandParamSchema,
  PresignBrandLogoRequestSchema,
  PresignBrandLogoResponseSchema,
  SetBrandLogoRequestSchema,
  SetBrandLogoResponseSchema,
  CreateModelRequestSchema,
  UpdateModelRequestSchema,
  DeleteModelParamSchema,
  CatalogSearchQuerySchema,
  CatalogSearchResultItemSchema,
  CatalogSearchResponseSchema,
} from "./schemas/catalog";
import {
  ListingSummarySchema,
  FeedListingSummarySchema,
  ListingDetailSchema,
  ListingMediaSchema,
  ListingDraftSchema,
  ListingDraftPayloadSchema,
  CreateDraftRequestSchema,
  UpdateDraftRequestSchema,
  PublishListingRequestSchema,
  EditListingRequestSchema,
  AttachMediaRequestSchema,
  ReorderMediaRequestSchema,
  FeedResponseSchema,
  ListingCountQuerySchema,
  ListingCountResponseSchema,
  ListingModelCountQuerySchema,
  ListingModelCountResponseSchema,
  ListingBrandCountQuerySchema,
  ListingBrandCountResponseSchema,
  FeedSortSchema,
  MyListingCountsResponseSchema,
  MyListingsResponseSchema,
  MyDraftsResponseSchema,
  FavoriteListingSummarySchema,
  MyFavoritesResponseSchema,
  VerifiedContactPhoneSchema,
  ContactPhoneCodeRequestSchema,
  ContactPhoneCodeRequestResponseSchema,
  ContactPhoneVerifyRequestSchema,
  ContactPhoneVerifyResponseSchema,
  MyContactPhonesResponseSchema,
  ContactPhoneNotConfirmedDetailsSchema,
} from "./schemas/listings";
import {
  PresignRequestSchema,
  PresignResponseSchema,
} from "./schemas/uploads";
import {
  ExchangeRateSchema,
  ExchangeRatesResponseSchema,
} from "./schemas/exchange-rates";
import {
  CreateReportRequestSchema,
  CreateReportResponseSchema,
  CreateMessageReportRequestSchema,
  ReportListItemSchema,
  ListReportsResponseSchema,
  GetReportDetailResponseSchema,
  MessageReportContextSchema,
  DismissReportRequestSchema,
  DismissReportResponseSchema,
  BanListingRequestSchema,
  BanListingResponseSchema,
  UnbanListingRequestSchema,
  UnbanListingResponseSchema,
  SuspendUserRequestSchema,
  SuspendUserResponseSchema,
  UnsuspendUserRequestSchema,
  UnsuspendUserResponseSchema,
  AuditLogListItemSchema,
  ListAuditEntriesResponseSchema,
} from "./schemas/admin";
import {
  OpenConversationRequestSchema,
  OpenConversationResponseSchema,
  ListConversationsResponseSchema,
  ListConversationsQuerySchema,
  ListMessagesQuerySchema,
  ListMessagesResponseSchema,
  SendTextMessageRequestSchema,
  SendTextMessageResponseSchema,
  SendMessageRequestSchema,
  SendMessageResponseSchema,
  SendPostRefMessageRequestSchema,
  PresignChatAttachmentRequestSchema,
  PresignChatAttachmentResponseSchema,
  ConversationSummarySchema,
  GetConversationResponseSchema,
  SendRestrictionSchema,
  MessageSummarySchema,
  ConversationListingCardSchema,
  ImageMessageMetadataSchema,
  PostRefMessageMetadataSchema,
  MessageMetadataSchema,
  UpdateWatermarkRequestSchema,
  UpdateWatermarkResponseSchema,
  MuteConversationRequestSchema,
  MuteConversationResponseSchema,
  DeleteMessageResponseSchema,
  ChatMessageEventSchema,
  MessageDeletedEventSchema,
  TypingStartRequestSchema,
  TypingStopRequestSchema,
  TypingEventSchema,
  PresenceEventSchema,
  WatermarkEventSchema,
} from "./schemas/conversations";
import {
  RegisterPushTokenRequestSchema,
  RegisterPushTokenResponseSchema,
  NotificationPreferencesSchema,
  UpdateNotificationPreferencesRequestSchema,
  UpdateNotificationPreferencesResponseSchema,
} from "./schemas/notifications";
import {
  CreateInspectionInterestRequestSchema,
  CreateInspectionInterestResponseSchema,
  InspectionInterestCountItemSchema,
  ListInspectionInterestStatsResponseSchema,
} from "./schemas/reports";

// exactOptionalPropertyTypes: true in tsconfig conflicts with zod-to-openapi's
// SchemaObject type (Zod nullable() method vs SchemaObject nullable: boolean).
const S = (schema: z.ZodTypeAny) => schema as unknown as Record<string, unknown>;

export function buildOpenApiRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry();

  registry.register("ErrorResponse", ErrorResponseSchema);
  registry.register("RateLimitedDetails", RateLimitedDetailsSchema);
  registry.register("InvalidOtpDetails", InvalidOtpDetailsSchema);

  // Catalog read schemas
  registry.register("BrandSummary", BrandSummarySchema);
  registry.register("BrandDetail", BrandDetailSchema);
  registry.register("ModelSummary", ModelSummarySchema);
  registry.register("ModelDetail", ModelDetailSchema);
  registry.register("GenerationSummary", GenerationSummarySchema);
  registry.register("GenerationDetail", GenerationDetailSchema);
  registry.register("ColorSummary", ColorSummarySchema);
  registry.register("ColorDetail", ColorDetailSchema);
  registry.register("BodyTypeSummary", BodyTypeSummarySchema);
  registry.register("BodyTypeDetail", BodyTypeDetailSchema);
  registry.register("RegionSummary", RegionSummarySchema);
  registry.register("RegionDetail", RegionDetailSchema);
  registry.register("CitySummary", CitySummarySchema);
  registry.register("CityDetail", CityDetailSchema);
  registry.register("CatalogSearchResultItem", CatalogSearchResultItemSchema);
  registry.register("CatalogSearchResponse", CatalogSearchResponseSchema);

  // Catalog admin write schemas
  registry.register("CreateBrandRequest", CreateBrandRequestSchema);
  registry.register("UpdateBrandRequest", UpdateBrandRequestSchema);
  registry.register("DeleteBrandParam", DeleteBrandParamSchema);
  registry.register("PresignBrandLogoRequest", PresignBrandLogoRequestSchema);
  registry.register("PresignBrandLogoResponse", PresignBrandLogoResponseSchema);
  registry.register("SetBrandLogoRequest", SetBrandLogoRequestSchema);
  registry.register("SetBrandLogoResponse", SetBrandLogoResponseSchema);
  registry.register("CreateModelRequest", CreateModelRequestSchema);
  registry.register("UpdateModelRequest", UpdateModelRequestSchema);
  registry.register("DeleteModelParam", DeleteModelParamSchema);

  // Listings schemas
  registry.register("ListingSummary", ListingSummarySchema);
  registry.register("FeedListingSummary", FeedListingSummarySchema);
  registry.register("ListingDetail", ListingDetailSchema);
  registry.register("ListingMedia", ListingMediaSchema);
  registry.register("ListingDraft", ListingDraftSchema);
  registry.register("ListingDraftPayload", ListingDraftPayloadSchema);
  registry.register("CreateDraftRequest", CreateDraftRequestSchema);
  registry.register("UpdateDraftRequest", UpdateDraftRequestSchema);
  registry.register("PublishListingRequest", PublishListingRequestSchema);
  registry.register("EditListingRequest", EditListingRequestSchema);
  registry.register("AttachMediaRequest", AttachMediaRequestSchema);
  registry.register("ReorderMediaRequest", ReorderMediaRequestSchema);
  registry.register("FeedResponse", FeedResponseSchema);
  registry.register("ListingCountQuery", ListingCountQuerySchema);
  registry.register("ListingCountResponse", ListingCountResponseSchema);
  registry.register("ListingModelCountQuery", ListingModelCountQuerySchema);
  registry.register("ListingModelCountResponse", ListingModelCountResponseSchema);
  registry.register("ListingBrandCountQuery", ListingBrandCountQuerySchema);
  registry.register("ListingBrandCountResponse", ListingBrandCountResponseSchema);
  registry.register("FeedSort", FeedSortSchema);
  registry.register("MyListingsResponse", MyListingsResponseSchema);
  registry.register("MyListingCountsResponse", MyListingCountsResponseSchema);
  registry.register("MyDraftsResponse", MyDraftsResponseSchema);
  registry.register("FavoriteListingSummary", FavoriteListingSummarySchema);
  registry.register("MyFavoritesResponse", MyFavoritesResponseSchema);

  // Uploads schemas
  registry.register("PresignRequest", PresignRequestSchema);
  registry.register("PresignResponse", PresignResponseSchema);

  // Exchange-rates schemas
  registry.register("ExchangeRate", ExchangeRateSchema);
  registry.register("ExchangeRatesResponse", ExchangeRatesResponseSchema);

  // Conversation schemas
  registry.register("OpenConversationRequest", OpenConversationRequestSchema);
  registry.register("OpenConversationResponse", OpenConversationResponseSchema);
  registry.register("ListConversationsResponse", ListConversationsResponseSchema);
  registry.register("ListMessagesQuery", ListMessagesQuerySchema);
  registry.register("ListMessagesResponse", ListMessagesResponseSchema);
  registry.register("SendTextMessageRequest", SendTextMessageRequestSchema);
  registry.register("SendTextMessageResponse", SendTextMessageResponseSchema);
  registry.register("SendMessageRequest", SendMessageRequestSchema);
  registry.register("SendMessageResponse", SendMessageResponseSchema);
  registry.register(
    "SendPostRefMessageRequest",
    SendPostRefMessageRequestSchema,
  );
  registry.register(
    "PresignChatAttachmentRequest",
    PresignChatAttachmentRequestSchema,
  );
  registry.register(
    "PresignChatAttachmentResponse",
    PresignChatAttachmentResponseSchema,
  );
  registry.register("ConversationSummary", ConversationSummarySchema);
  registry.register("MessageSummary", MessageSummarySchema);
  registry.register("ConversationListingCard", ConversationListingCardSchema);
  registry.register("ImageMessageMetadata", ImageMessageMetadataSchema);
  registry.register("PostRefMessageMetadata", PostRefMessageMetadataSchema);
  registry.register("MessageMetadata", MessageMetadataSchema);
  registry.register("UpdateWatermarkRequest", UpdateWatermarkRequestSchema);
  registry.register("UpdateWatermarkResponse", UpdateWatermarkResponseSchema);
  registry.register("MuteConversationRequest", MuteConversationRequestSchema);
  registry.register("MuteConversationResponse", MuteConversationResponseSchema);
  registry.register("GetConversationResponse", GetConversationResponseSchema);
  registry.register("SendRestriction", SendRestrictionSchema);
  registry.register("DeleteMessageResponse", DeleteMessageResponseSchema);
  registry.register("ChatMessageEvent", ChatMessageEventSchema);
  registry.register("MessageDeletedEvent", MessageDeletedEventSchema);
  registry.register("TypingStartRequest", TypingStartRequestSchema);
  registry.register("TypingStopRequest", TypingStopRequestSchema);
  registry.register("TypingEvent", TypingEventSchema);
  registry.register("PresenceEvent", PresenceEventSchema);
  registry.register("WatermarkEvent", WatermarkEventSchema);

  // Admin TOTP schemas
  registry.register("AdminTotpStatusResponse", AdminTotpStatusResponseSchema);
  registry.register("AdminTotpEnrollResponse", AdminTotpEnrollResponseSchema);
  registry.register("AdminTotpVerifyRequest", AdminTotpVerifyRequestSchema);
  registry.register("AdminTotpVerifyResponse", AdminTotpVerifyResponseSchema);
  registry.register("SignInMethodChangeRequest", SignInMethodChangeRequestSchema);
  registry.register(
    "SignInMethodChangeVerifyRequest",
    SignInMethodChangeVerifyRequestSchema,
  );
  registry.register("SignInMethodChangeResponse", SignInMethodChangeResponseSchema);
  registry.register("AccountDeletionRequest", AccountDeletionRequestSchema);
  registry.register(
    "AccountDeletionRequestResponse",
    AccountDeletionRequestResponseSchema,
  );
  registry.register(
    "AccountDeletionConfirmRequest",
    AccountDeletionConfirmRequestSchema,
  );

  // Admin report schemas
  registry.register("CreateReportRequest", CreateReportRequestSchema);
  registry.register("CreateReportResponse", CreateReportResponseSchema);
  registry.register("CreateMessageReportRequest", CreateMessageReportRequestSchema);
  registry.register("ReportListItem", ReportListItemSchema);
  registry.register("ListReportsResponse", ListReportsResponseSchema);
  registry.register("GetReportDetailResponse", GetReportDetailResponseSchema);
  registry.register("MessageReportContext", MessageReportContextSchema);

  // Admin moderation schemas
  registry.register("DismissReportRequest", DismissReportRequestSchema);
  registry.register("DismissReportResponse", DismissReportResponseSchema);
  registry.register("BanListingRequest", BanListingRequestSchema);
  registry.register("BanListingResponse", BanListingResponseSchema);
  registry.register("UnbanListingRequest", UnbanListingRequestSchema);
  registry.register("UnbanListingResponse", UnbanListingResponseSchema);
  registry.register("SuspendUserRequest", SuspendUserRequestSchema);
  registry.register("SuspendUserResponse", SuspendUserResponseSchema);
  registry.register("UnsuspendUserRequest", UnsuspendUserRequestSchema);
  registry.register("UnsuspendUserResponse", UnsuspendUserResponseSchema);

  // Admin audit schemas
  registry.register("AuditLogListItem", AuditLogListItemSchema);
  registry.register("ListAuditEntriesResponse", ListAuditEntriesResponseSchema);

  // Reports fake-door schemas
  registry.register(
    "CreateInspectionInterestRequest",
    CreateInspectionInterestRequestSchema,
  );
  registry.register(
    "CreateInspectionInterestResponse",
    CreateInspectionInterestResponseSchema,
  );
  registry.register("InspectionInterestCountItem", InspectionInterestCountItemSchema);
  registry.register(
    "ListInspectionInterestStatsResponse",
    ListInspectionInterestStatsResponseSchema,
  );

  // Notification / push-token schemas
  registry.register("RegisterPushTokenRequest", RegisterPushTokenRequestSchema);
  registry.register("RegisterPushTokenResponse", RegisterPushTokenResponseSchema);
  registry.register("NotificationPreferences", NotificationPreferencesSchema);
  registry.register(
    "UpdateNotificationPreferencesRequest",
    UpdateNotificationPreferencesRequestSchema,
  );
  registry.register(
    "UpdateNotificationPreferencesResponse",
    UpdateNotificationPreferencesResponseSchema,
  );

  registry.registerPath({
    method: "post",
    path: "/api/v1/conversations",
    summary: "Open or create a conversation",
    tags: ["Conversations"],
    request: {
      body: {
        content: {
          "application/json": { schema: S(OpenConversationRequestSchema) },
        },
      },
    },
    responses: {
      200: {
        description: "Conversation opened",
        content: {
          "application/json": { schema: S(OpenConversationResponseSchema) },
        },
      },
      400: {
        description: "Validation error",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
      403: {
        description: "Feature disabled or self-contact not allowed",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/conversations",
    summary: "List my conversations",
    tags: ["Conversations"],
    request: {
      query: ListConversationsQuerySchema,
    },
    responses: {
      200: {
        description: "Conversation list",
        content: {
          "application/json": { schema: S(ListConversationsResponseSchema) },
        },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/conversations/{id}",
    summary: "Read one conversation with the viewer's send restriction",
    tags: ["Conversations"],
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        description:
          "Conversation summary plus sendRestriction (null when a message would be accepted)",
        content: {
          "application/json": { schema: S(GetConversationResponseSchema) },
        },
      },
      400: {
        description: "Validation error (malformed conversation id)",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
      403: {
        description: "Not a participant (reason NOT_A_PARTICIPANT)",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
      404: {
        description: "Conversation not found",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/conversations/{id}/messages",
    summary: "List messages in a conversation",
    tags: ["Conversations"],
    request: {
      params: z.object({ id: z.string().uuid() }),
      query: ListMessagesQuerySchema,
    },
    responses: {
      200: {
        description: "Message list",
        content: {
          "application/json": { schema: S(ListMessagesResponseSchema) },
        },
      },
      404: {
        description: "Conversation not found",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/conversations/{id}/messages",
    summary: "Send a text message",
    tags: ["Conversations"],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          "application/json": { schema: S(SendTextMessageRequestSchema) },
        },
      },
    },
    responses: {
      200: {
        description: "Message sent",
        content: {
          "application/json": { schema: S(SendTextMessageResponseSchema) },
        },
      },
      400: {
        description: "Validation error",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
      403: {
        description: "Feature disabled or not a participant",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
      404: {
        description: "Conversation not found",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/auth/otp/request",
    summary: "Request OTP",
    tags: ["Auth"],
    request: {
      body: { content: { "application/json": { schema: S(OtpRequestRequestSchema) } } },
    },
    responses: {
      200: {
        description: "OTP sent",
        content: {
          "application/json": { schema: S(OtpRequestResponseSchema) },
        },
      },
      400: {
        description:
          "Validation error, or RATE_LIMITED with details (RateLimitedDetails): reason destination_limit, ip_limit or backoff, and retryInSeconds",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/auth/otp/verify",
    summary: "Verify OTP",
    tags: ["Auth"],
    request: {
      body: { content: { "application/json": { schema: S(OtpVerifyRequestSchema) } } },
    },
    responses: {
      200: {
        description: "OTP verified, tokens issued",
        content: {
          "application/json": { schema: S(OtpVerifyResponseSchema) },
        },
      },
      400: {
        description: "Validation error",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/auth/refresh",
    summary: "Refresh tokens",
    tags: ["Auth"],
    request: {
      body: { content: { "application/json": { schema: S(RefreshRequestSchema) } } },
    },
    responses: {
      200: {
        description: "Tokens refreshed",
        content: {
          "application/json": { schema: S(RefreshResponseSchema) },
        },
      },
      401: {
        description: "Invalid or expired refresh token",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/me/sign-in-methods/request",
    summary: "Request a code to add or replace a Sign-in Method",
    tags: ["Identity"],
    request: {
      body: {
        content: {
          "application/json": { schema: S(SignInMethodChangeRequestSchema) },
        },
      },
    },
    responses: {
      201: {
        description: "Sign-in Method code sent",
        content: {
          "application/json": { schema: S(OtpRequestResponseSchema) },
        },
      },
      400: {
        description:
          "Validation error, or RATE_LIMITED with details (RateLimitedDetails): reason destination_limit, ip_limit or backoff, and retryInSeconds",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
      401: {
        description: "Authentication required",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
      404: {
        description: "Signed-in User no longer exists",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/me/sign-in-methods/verify",
    summary: "Confirm and apply a Sign-in Method change",
    tags: ["Identity"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: S(SignInMethodChangeVerifyRequestSchema),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Sign-in Method changed",
        content: {
          "application/json": { schema: S(SignInMethodChangeResponseSchema) },
        },
      },
      400: {
        description: "Invalid, expired, or used code",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
      401: {
        description: "Authentication required",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
      404: {
        description: "Signed-in User no longer exists",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
      409: {
        description: "Sign-in Method belongs to another User",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  // Contact phones for Listings (ADR-0081)
  registry.register("VerifiedContactPhone", VerifiedContactPhoneSchema);
  registry.register(
    "ContactPhoneNotConfirmedDetails",
    ContactPhoneNotConfirmedDetailsSchema,
  );

  const contactPhoneRefusals = {
    401: {
      description: "Authentication required",
      content: { "application/json": { schema: S(ErrorResponseSchema) } },
    },
    403: {
      description:
        "FORBIDDEN: details.reason USER_SUSPENDED, or the account deletion is scheduled",
      content: { "application/json": { schema: S(ErrorResponseSchema) } },
    },
  };

  registry.registerPath({
    method: "post",
    path: "/api/v1/me/contact-phones/request",
    summary: "Request a code to confirm a Listing contact phone",
    description:
      "Answers confirmed, and sends nothing, for the seller's sign-in phone or a number the seller confirmed in the last 7 days. Otherwise sends one SMS code. Counts against the same per-number and per-IP budgets as sign-in.",
    tags: ["Listings"],
    request: {
      body: {
        content: {
          "application/json": { schema: S(ContactPhoneCodeRequestSchema) },
        },
      },
    },
    responses: {
      200: {
        description: "Number already usable, or code sent",
        content: {
          "application/json": { schema: S(ContactPhoneCodeRequestResponseSchema) },
        },
      },
      400: {
        description:
          "VALIDATION_FAILED, or RATE_LIMITED with details (RateLimitedDetails): reason destination_limit, ip_limit or backoff, and retryInSeconds",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
      ...contactPhoneRefusals,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/me/contact-phones/verify",
    summary: "Confirm a Listing contact phone with its code",
    description:
      "Checks the newest contact-phone code this seller requested for the number. A confirmation restarts the 7 days.",
    tags: ["Listings"],
    request: {
      body: {
        content: {
          "application/json": { schema: S(ContactPhoneVerifyRequestSchema) },
        },
      },
    },
    responses: {
      200: {
        description: "Number confirmed for 7 days",
        content: {
          "application/json": { schema: S(ContactPhoneVerifyResponseSchema) },
        },
      },
      400: {
        description:
          "VALIDATION_FAILED, INVALID_OTP with details (InvalidOtpDetails), OTP_LOCKED, OTP_EXPIRED, OTP_ALREADY_USED or OTP_NOT_FOUND",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
      ...contactPhoneRefusals,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/me/contact-phones",
    summary: "List the seller's reusable confirmed contact phones",
    description:
      "Newest confirmation first. Leaves out the sign-in phone, which the app reads from GET /api/v1/me.",
    tags: ["Listings"],
    responses: {
      200: {
        description: "Reusable confirmed numbers",
        content: {
          "application/json": { schema: S(MyContactPhonesResponseSchema) },
        },
      },
      ...contactPhoneRefusals,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/account-deletion/request",
    summary: "Request a code to delete the account holding a phone or email",
    description:
      "Public. Answers the same way whether or not a User holds the value.",
    tags: ["Identity"],
    request: {
      body: {
        content: {
          "application/json": { schema: S(AccountDeletionRequestSchema) },
        },
      },
    },
    responses: {
      201: {
        description: "Deletion code sent",
        content: {
          "application/json": {
            schema: S(AccountDeletionRequestResponseSchema),
          },
        },
      },
      400: {
        description:
          "Validation error, or RATE_LIMITED with details (RateLimitedDetails): reason destination_limit, ip_limit or backoff, and retryInSeconds",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/account-deletion/confirm",
    summary: "Confirm a deletion code and start the 30-day grace period",
    description:
      "Public. A valid code for a value no User holds gets the same 204 and changes nothing.",
    tags: ["Identity"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: S(AccountDeletionConfirmRequestSchema),
          },
        },
      },
    },
    responses: {
      204: { description: "Code accepted" },
      400: {
        description:
          "Validation error, or INVALID_OTP for any wrong, expired, used, locked, or missing code",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/auth/logout",
    summary: "Logout",
    tags: ["Auth"],
    request: {
      body: { content: { "application/json": { schema: S(LogoutRequestSchema) } } },
    },
    responses: {
      200: { description: "Logged out" },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/listings/{id}/inspection-interest",
    summary: "Register inspection interest (fake-door)",
    tags: ["Reports"],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          "application/json": {
            schema: S(CreateInspectionInterestRequestSchema),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Interest created",
        content: {
          "application/json": {
            schema: S(CreateInspectionInterestResponseSchema),
          },
        },
      },
      200: {
        description: "Existing interest returned",
        content: {
          "application/json": {
            schema: S(CreateInspectionInterestResponseSchema),
          },
        },
      },
      400: {
        description: "Validation error",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
      403: {
        description: "Feature disabled or user suspended",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
      404: {
        description: "Listing not found or ineligible",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/admin/inspection-interests",
    summary: "List inspection interest statistics",
    tags: ["Admin", "Reports"],
    request: {
      query: AdminTablePaginationRequestSchema,
    },
    responses: {
      200: {
        description: "Interest statistics",
        content: {
          "application/json": {
            schema: S(ListInspectionInterestStatsResponseSchema),
          },
        },
      },
      400: {
        description: "Validation error",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/catalog/search",
    summary: "Search brands and models in any spelling",
    description:
      "Matches Russian, English and Turkmen spellings with Cyrillic–Latin transliteration and one forgiven typo. Understands year tokens (\"camry 2018\", \"лексус 2014-2019\", \"2018\").",
    tags: ["Catalog"],
    request: {
      query: CatalogSearchQuerySchema,
    },
    responses: {
      200: {
        description: "Ranked brand and model results with the parsed year range",
        content: {
          "application/json": { schema: S(CatalogSearchResponseSchema) },
        },
      },
      400: {
        description: "Validation error",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/listings/count",
    summary: "Count listings matching public feed filters",
    tags: ["Listings"],
    request: {
      query: ListingCountQuerySchema,
    },
    responses: {
      200: {
        description: "Total matching listings",
        content: {
          "application/json": { schema: S(ListingCountResponseSchema) },
        },
      },
      400: {
        description: "Validation error",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/listings/filter-options/models",
    summary: "Model-level counts for a selected brand",
    tags: ["Listings"],
    request: {
      query: ListingModelCountQuerySchema,
    },
    responses: {
      200: {
        description: "Models with feed-eligible listing counts",
        content: {
          "application/json": { schema: S(ListingModelCountResponseSchema) },
        },
      },
      400: {
        description: "Validation error",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/listings/filter-options/brands",
    summary: "Brand-level listing counts for the current filters",
    tags: ["Listings"],
    request: {
      query: ListingBrandCountQuerySchema,
    },
    responses: {
      200: {
        description: "Brands with feed-eligible listing counts",
        content: {
          "application/json": { schema: S(ListingBrandCountResponseSchema) },
        },
      },
      400: {
        description: "Validation error",
        content: { "application/json": { schema: S(ErrorResponseSchema) } },
      },
    },
  });

  return registry;
}

export function generateOpenApiDocument(): object {
  const registry = buildOpenApiRegistry();
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "AutoTM API",
      version: "0.1.0",
      description: "AutoTM Marketplace API — Phase 1",
    },
    servers: [{ url: "https://api.auto.tm" }],
  });
}
