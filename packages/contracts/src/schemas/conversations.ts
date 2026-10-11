import { z } from "zod";

import { ListingStatus, MessageKind } from "../enums";

import { PublicIdentitySchema } from "./identity";

// ── Shared enums as Zod schemas ──

export const ListingStatusSchema = z.nativeEnum(ListingStatus);
export type ListingStatusType = z.infer<typeof ListingStatusSchema>;

export const MessageKindSchema = z.nativeEnum(MessageKind);
export type MessageKindType = z.infer<typeof MessageKindSchema>;

// ── Request DTOs ──

export const OpenConversationRequestSchema = z.object({
  listingId: z.string().uuid(),
});
export type OpenConversationRequest = z.infer<
  typeof OpenConversationRequestSchema
>;

export const SendTextMessageRequestSchema = z.object({
  text: z.string().min(1).max(1000),
});
export type SendTextMessageRequest = z.infer<
  typeof SendTextMessageRequestSchema
>;

// ── Rich message metadata ──

export const ImageMessageMetadataSchema = z.object({
  key: z.string().min(1),
  width: z.number().int().nonnegative().optional(),
  height: z.number().int().nonnegative().optional(),
});
export type ImageMessageMetadata = z.infer<typeof ImageMessageMetadataSchema>;

export const PostRefMessageMetadataSchema = z.object({
  listingId: z.string().uuid(),
  brandId: z.string().uuid(),
  modelId: z.string().uuid(),
  year: z.number().int().min(1900).max(2100).optional(),
  displayPriceTmt: z.number().nonnegative(),
  priceCurrency: z.enum(["TMT", "USD", "AED"]),
  coverMediaKey: z.string().optional(),
  status: ListingStatusSchema,
  available: z.boolean().default(true),
});
export type PostRefMessageMetadata = z.infer<
  typeof PostRefMessageMetadataSchema
>;

export const MessageMetadataSchema = z.union([
  ImageMessageMetadataSchema,
  PostRefMessageMetadataSchema,
]);
export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;

// ── Rich send/receive DTOs ──

export const SendMessageRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal(MessageKind.Text),
    text: z.string().min(1).max(1000),
    clientMessageId: z.string().optional(),
  }),
  z.object({
    kind: z.literal(MessageKind.Image),
    metadata: ImageMessageMetadataSchema,
    clientMessageId: z.string().optional(),
  }),
]);
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const SendMessageSocketRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    conversationId: z.string().uuid(),
    kind: z.literal(MessageKind.Text),
    text: z.string().min(1).max(1000),
    clientMessageId: z.string().optional(),
  }),
  z.object({
    conversationId: z.string().uuid(),
    kind: z.literal(MessageKind.Image),
    metadata: ImageMessageMetadataSchema,
    clientMessageId: z.string().optional(),
  }),
]);
export type SendMessageSocketRequest = z.infer<
  typeof SendMessageSocketRequestSchema
>;

export const SendPostRefMessageRequestSchema = z
  .object({
    metadata: z
      .object({
        listingId: z.string().uuid(),
      })
      .strict(),
    clientMessageId: z.string().optional(),
  })
  .strict();
export type SendPostRefMessageRequest = z.infer<
  typeof SendPostRefMessageRequestSchema
>;

// ── Chat attachment upload ──

export const PresignChatAttachmentRequestSchema = z.object({
  contentType: z.enum(["image/webp"]),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
});
export type PresignChatAttachmentRequest = z.infer<
  typeof PresignChatAttachmentRequestSchema
>;

export const PresignChatAttachmentResponseSchema = z.object({
  uploadUrl: z.string().url(),
  key: z.string(),
  expiresIn: z.number().int().positive(),
  maxSizeBytes: z.number().int().positive(),
});
export type PresignChatAttachmentResponse = z.infer<
  typeof PresignChatAttachmentResponseSchema
>;

// ── Listing card embedded in conversation responses ──

export const ConversationListingCardSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  modelId: z.string().uuid(),
  year: z.number().int().min(1900).max(2100).optional(),
  displayPriceTmt: z.number().nonnegative(),
  priceCurrency: z.enum(["TMT", "USD", "AED"]),
  coverMediaKey: z.string().optional(),
  status: ListingStatusSchema,
});
export type ConversationListingCard = z.infer<
  typeof ConversationListingCardSchema
>;

// ── Message summary ──

export const MessageDeliveryStatusSchema = z.enum([
  "pending",
  "sent",
  "failed",
]);
export type MessageDeliveryStatus = z.infer<
  typeof MessageDeliveryStatusSchema
>;

export const MessageSummarySchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderId: z.string().uuid(),
  kind: MessageKindSchema.default(MessageKind.Text),
  text: z.string().nullable(),
  metadata: MessageMetadataSchema.optional(),
  createdAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
  clientMessageId: z.string().optional(),
  deliveryStatus: MessageDeliveryStatusSchema.optional(),
});
export type MessageSummary = z.infer<typeof MessageSummarySchema>;

export const DeleteMessageResponseSchema = z.object({
  messageId: z.string().uuid(),
  deletedAt: z.string().datetime(),
});
export type DeleteMessageResponse = z.infer<typeof DeleteMessageResponseSchema>;

// ── Watermarks / mute ──

export const UpdateWatermarkRequestSchema = z
  .object({
    lastReadAt: z.string().datetime().optional(),
    lastDeliveredAt: z.string().datetime().optional(),
  })
  .refine(
    (data) => data.lastReadAt !== undefined || data.lastDeliveredAt !== undefined,
    {
      message: "At least one watermark timestamp is required",
      path: [],
    },
  );
export type UpdateWatermarkRequest = z.infer<
  typeof UpdateWatermarkRequestSchema
>;

export const UpdateWatermarkResponseSchema = z.object({
  conversationId: z.string().uuid(),
  lastReadAt: z.string().datetime().optional(),
  lastDeliveredAt: z.string().datetime().optional(),
});
export type UpdateWatermarkResponse = z.infer<
  typeof UpdateWatermarkResponseSchema
>;

export const MuteConversationRequestSchema = z.object({
  muted: z.boolean(),
});
export type MuteConversationRequest = z.infer<
  typeof MuteConversationRequestSchema
>;

export const MuteConversationResponseSchema = z.object({
  conversationId: z.string().uuid(),
  mutedAt: z.string().datetime().nullable(),
});
export type MuteConversationResponse = z.infer<
  typeof MuteConversationResponseSchema
>;

// ── Conversation summary ──

export const ParticipantRoleSchema = z.enum(["buyer", "seller"]);
export type ParticipantRole = z.infer<typeof ParticipantRoleSchema>;

/** The other participant: id and public identity; no Sign-in Method data. */
export const ConversationPeerSchema = PublicIdentitySchema.extend({
  id: z.string().uuid(),
});
export type ConversationPeer = z.infer<typeof ConversationPeerSchema>;

export const ConversationSummarySchema = z.object({
  id: z.string().uuid(),
  listing: ConversationListingCardSchema.nullable(),
  buyerId: z.string().uuid(),
  sellerId: z.string().uuid(),
  myRole: ParticipantRoleSchema,
  peer: ConversationPeerSchema,
  /** True when the viewer blocked the other participant. The reverse is not exposed. */
  blockedByMe: z.boolean(),
  lastMessage: MessageSummarySchema.optional(),
  updatedAt: z.string().datetime(),
  unreadCount: z.number().int().nonnegative().default(0),
  peerLastReadAt: z.string().datetime().optional(),
  peerLastDeliveredAt: z.string().datetime().optional(),
  mutedAt: z.string().datetime().nullable().optional(),
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

// ── One Conversation, with the viewer's send restriction ──

export const ConversationIdParamSchema = z.object({
  id: z.string().uuid(),
});
export type ConversationIdParam = z.infer<typeof ConversationIdParamSchema>;

/**
 * Why the viewer's next Message would be refused, or null when it would be
 * accepted. Reported in this order when several apply: `blocked_by_me` first
 * so the app can offer Unblock. `participant_unavailable` covers a suspended
 * participant and the other participant having blocked the viewer; it does
 * not say which. History stays readable in every case.
 */
export const SendRestrictionSchema = z.enum([
  "blocked_by_me",
  "listing_unavailable",
  "chat_disabled",
  "participant_unavailable",
]);
export type SendRestriction = z.infer<typeof SendRestrictionSchema>;

export const GetConversationResponseSchema = ConversationSummarySchema.extend({
  sendRestriction: SendRestrictionSchema.nullable(),
});
export type GetConversationResponse = z.infer<
  typeof GetConversationResponseSchema
>;

// ── Pagination ──

export const ListMessagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;

export const ListConversationsQuerySchema = ListMessagesQuerySchema;
export type ListConversationsQuery = ListMessagesQuery;

export const ListMessagesResponseSchema = z.object({
  items: z.array(MessageSummarySchema),
  nextCursor: z.string().nullable(),
});
export type ListMessagesResponse = z.infer<typeof ListMessagesResponseSchema>;

// ── Total unread Messages ──

/**
 * Messages from other participants that are not deleted and are newer than
 * the viewer's read watermark, summed over all the viewer's Conversations.
 * Muted Conversations count, so the Messages tab and the list rows agree.
 */
export const UnreadCountResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});
export type UnreadCountResponse = z.infer<typeof UnreadCountResponseSchema>;

// ── Conversation list response ──

export const ListConversationsResponseSchema = z.object({
  items: z.array(ConversationSummarySchema),
  nextCursor: z.string().nullable(),
});
export type ListConversationsResponse = z.infer<
  typeof ListConversationsResponseSchema
>;

// ── Open conversation response ──

export const OpenConversationResponseSchema = ConversationSummarySchema;
export type OpenConversationResponse = z.infer<
  typeof OpenConversationResponseSchema
>;

// ── Send message response ──

export const SendTextMessageResponseSchema = MessageSummarySchema;
export type SendTextMessageResponse = z.infer<
  typeof SendTextMessageResponseSchema
>;

export const SendMessageResponseSchema = MessageSummarySchema;
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;

// ── Socket event payloads ──

export const ChatMessageEventSchema = z.object({
  message: MessageSummarySchema,
});
export type ChatMessageEvent = z.infer<typeof ChatMessageEventSchema>;

export const DeleteMessageSocketRequestSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
});
export type DeleteMessageSocketRequest = z.infer<
  typeof DeleteMessageSocketRequestSchema
>;

export const MessageDeletedEventSchema = z.object({
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
  deletedAt: z.string().datetime(),
});
export type MessageDeletedEvent = z.infer<typeof MessageDeletedEventSchema>;

export const TypingStartRequestSchema = z.object({
  conversationId: z.string().uuid(),
});
export type TypingStartRequest = z.infer<typeof TypingStartRequestSchema>;

export const TypingStopRequestSchema = z.object({
  conversationId: z.string().uuid(),
});
export type TypingStopRequest = z.infer<typeof TypingStopRequestSchema>;

export const TypingEventSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
  isTyping: z.boolean(),
});
export type TypingEvent = z.infer<typeof TypingEventSchema>;

export const PresenceEventSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
  online: z.boolean(),
  lastSeenAt: z.string().datetime().optional(),
});
export type PresenceEvent = z.infer<typeof PresenceEventSchema>;

export const WatermarkEventSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
  lastReadAt: z.string().datetime().optional(),
  lastDeliveredAt: z.string().datetime().optional(),
});
export type WatermarkEvent = z.infer<typeof WatermarkEventSchema>;

// ── Socket room join/leave ──

export const JoinConversationRequestSchema = z.object({
  conversationId: z.string().uuid(),
});
export type JoinConversationRequest = z.infer<
  typeof JoinConversationRequestSchema
>;

export const JoinConversationResponseSchema = z.object({
  ok: z.literal(true),
  conversationId: z.string().uuid(),
  room: z.string().min(1),
});
export type JoinConversationResponse = z.infer<
  typeof JoinConversationResponseSchema
>;

export const LeaveConversationRequestSchema = z.object({
  conversationId: z.string().uuid(),
});
export type LeaveConversationRequest = z.infer<
  typeof LeaveConversationRequestSchema
>;

export const LeaveConversationResponseSchema = z.object({
  ok: z.literal(true),
  conversationId: z.string().uuid(),
  room: z.string().min(1),
});
export type LeaveConversationResponse = z.infer<
  typeof LeaveConversationResponseSchema
>;

export const ConversationSocketErrorSchema = z.object({
  ok: z.literal(false),
  code: z.string(),
  message: z.string(),
});
export type ConversationSocketError = z.infer<
  typeof ConversationSocketErrorSchema
>;
