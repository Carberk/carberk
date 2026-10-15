import {
  Controller,
  Optional,
  Get,
  Post,
  Delete,
  Body,
  Req,
  Query,
  Param,
  BadRequestException,
  Inject,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import { ConversationsSchemas } from "@auto-tm/contracts";

import type {
  ListingSummary,
  ListingsReadPort,
} from "../../listings/domain/ports/ListingsReadPort";
import { LISTINGS_READ_PORT } from "../../listings/domain/ports/ListingsReadPort";
import { Public } from "../../../common/public.decorator";
import { OpenConversation } from "../application/OpenConversation";
import { ListMyConversations } from "../application/ListMyConversations";
import { CountMyUnreadMessages } from "../application/CountMyUnreadMessages";
import type { ConversationPeer } from "../application/ConversationPeers";
import { GetConversation } from "../application/GetConversation";
import { ListMessages } from "../application/ListMessages";
import { SendTextMessage } from "../application/SendTextMessage";
import { SendMessage } from "../application/SendMessage";
import { SendPostRefMessage } from "../application/SendPostRefMessage";
import { PresignChatAttachmentUpload } from "../application/PresignChatAttachmentUpload";
import { UpdateWatermark } from "../application/UpdateWatermark";
import { MuteConversation } from "../application/MuteConversation";
import { DeleteMessage } from "../application/DeleteMessage";
import type { Conversation } from "../domain/Conversation";
import { BUSINESS_ENQUIRY_REPOSITORY, type BusinessEnquiryRepository } from "../domain/ports/BusinessEnquiryRepository";
import type { Message } from "../domain/Message";
import type { PostRefMessageMetadata } from "../domain/types";
import { availabilityMapForListingSummaries } from "../infrastructure/PostRefSnapshotMapper";

type AuthenticatedRequest = FastifyRequest & { user?: { sub?: string; sid?: string } };

@Controller("api/v1/conversations")
export class ConversationsController {
  constructor(
    @Inject(OpenConversation)
    private readonly openConversationUC: OpenConversation,
    @Inject(ListMyConversations)
    private readonly listMyConversationsUC: ListMyConversations,
    @Inject(GetConversation)
    private readonly getConversationUC: GetConversation,
    @Inject(ListMessages)
    private readonly listMessagesUC: ListMessages,
    @Inject(SendTextMessage)
    private readonly sendTextMessageUC: SendTextMessage,
    @Inject(SendMessage)
    private readonly sendMessageUC: SendMessage,
    @Inject(SendPostRefMessage)
    private readonly sendPostRefMessageUC: SendPostRefMessage,
    @Inject(PresignChatAttachmentUpload)
    private readonly presignChatAttachmentUploadUC: PresignChatAttachmentUpload,
    @Inject(UpdateWatermark)
    private readonly updateWatermarkUC: UpdateWatermark,
    @Inject(MuteConversation)
    private readonly muteConversationUC: MuteConversation,
    @Inject(DeleteMessage)
    private readonly deleteMessageUC: DeleteMessage,
    @Inject(LISTINGS_READ_PORT)
    private readonly listings: ListingsReadPort,
    @Inject(CountMyUnreadMessages)
    private readonly countMyUnreadMessagesUC: CountMyUnreadMessages,
    @Inject(BUSINESS_ENQUIRY_REPOSITORY)
    @Optional()
    private readonly businessEnquiries?: BusinessEnquiryRepository,
  ) {}

  @Public()
  @Get("ping")
  ping(): { context: "conversations"; status: "ok" } {
    return { context: "conversations", status: "ok" };
  }

  @Post()
  async openConversation(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    const userId = this.userId(req);
    const parsed = this.parseOrThrow(
      ConversationsSchemas.OpenConversationRequestSchema,
      body,
    );

    const result = await this.openConversationUC.execute({
      buyerId: userId,
      listingId: parsed.listingId,
      ...(this.actor(req).businessId ? { actor: this.actor(req) } : {}),
    });

    return this.toConversationSummaryResponse(
      result.conversation,
      result.listing,
      userId,
      { peer: result.peer, blockedByMe: result.blockedByMe },
    );
  }

  @Get()
  async listMyConversations(
    @Query() query: unknown,
    @Req() req: FastifyRequest,
  ) {
    const userId = this.userId(req);
    const parsed = this.parseOrThrow(
      ConversationsSchemas.ListConversationsQuerySchema,
      query,
    );

    const result = await this.listMyConversationsUC.execute({
      userId,
      ...(parsed.cursor ? { cursor: parsed.cursor } : {}),
      limit: parsed.limit,
      ...(this.actor(req).businessId ? { actor: this.actor(req) } : {}),
    });

    const availabilityMap = await this.buildPostRefAvailabilityMap(
      result.items
        .map((item) => item.lastMessage)
        .filter((m): m is Message => m !== null && m !== undefined),
    );

    return {
      items: result.items.map((item) =>
        this.toConversationSummaryResponse(
          item.conversation,
          item.listing,
          userId,
          { peer: item.peer, blockedByMe: item.blockedByMe },
          item.lastMessage,
          item.unreadCount,
          availabilityMap,
          item.peerLastReadAt,
          item.peerLastDeliveredAt,
          item.mutedAt,
        ),
      ),
      nextCursor: result.nextCursor,
    };
  }

  @Get("business/:businessId")
  async listBusinessEnquiries(@Param("businessId") businessId: string, @Query("cursor") cursor: string | undefined, @Req() req: FastifyRequest) {
    const actor = { ...this.actor(req), businessId };
    if (!this.businessEnquiries) throw new BadRequestException("Business enquiries unavailable");
    const result = await this.businessEnquiries.list(actor, cursor);
    return { businessId, unanswered: result.unanswered, nextCursor: result.nextCursor, items: result.items.map(enquiry => ({ id: enquiry.id, listingId: enquiry.listingId, buyerId: enquiry.buyerId, createdBy: enquiry.sellerId, assigneeId: enquiry.assigneeId, status: enquiry.enquiryState, version: enquiry.version, updatedAt: enquiry.updatedAt.toISOString() })) };
  }

  @Post("business/:businessId/:id/:action")
  async changeBusinessEnquiry(@Param("businessId") businessId: string, @Param("id") conversationId: string, @Param("action") action: "claim" | "reassign" | "close" | "reopen", @Body() body: unknown, @Req() req: FastifyRequest) {
    const parsed = typeof body === "object" && body !== null ? body as { expectedVersion?: number; assigneeId?: string | null } : {};
    if (!Number.isInteger(parsed.expectedVersion)) throw new BadRequestException({ code: "VALIDATION_FAILED", message: "expectedVersion is required" });
    if (!this.businessEnquiries) throw new BadRequestException("Business enquiries unavailable");
    const result = await this.businessEnquiries.change({ actor: { ...this.actor(req), businessId }, conversationId, expectedVersion: parsed.expectedVersion as number, action, ...(parsed.assigneeId !== undefined ? { assigneeId: parsed.assigneeId } : {}) });
    return { id: result.id, assigneeId: result.assigneeId, status: result.enquiryState, version: result.version };
  }

  @Get("unread-count")
  async unreadCount(
    @Req() req: FastifyRequest,
  ): Promise<ConversationsSchemas.UnreadCountResponse> {
    return this.countMyUnreadMessagesUC.execute({ userId: this.userId(req) });
  }

  // Declared after `ping` and the collection routes: `:id` must never claim them.
  @Get(":id")
  async getConversation(
    @Param() params: unknown,
    @Req() req: FastifyRequest,
  ) {
    const userId = this.userId(req);
    const { id } = this.parseOrThrow(
      ConversationsSchemas.ConversationIdParamSchema,
      params,
    );

    const result = await this.getConversationUC.execute({
      userId,
      conversationId: id,
    });

    const availabilityMap = await this.buildPostRefAvailabilityMap(
      result.lastMessage ? [result.lastMessage] : [],
    );

    // Typed against the contract so a restriction the wire does not know about
    // cannot be returned.
    const sendRestriction: ConversationsSchemas.GetConversationResponse["sendRestriction"] =
      result.sendRestriction;

    return {
      ...this.toConversationSummaryResponse(
        result.conversation,
        result.listing,
        userId,
        { peer: result.peer, blockedByMe: result.blockedByMe },
        result.lastMessage,
        result.unreadCount,
        availabilityMap,
        result.peerLastReadAt,
        result.peerLastDeliveredAt,
        result.mutedAt,
      ),
      sendRestriction,
    };
  }

  @Get(":id/messages")
  async listMessages(
    @Param("id") conversationId: string,
    @Query() query: unknown,
    @Req() req: FastifyRequest,
  ) {
    const userId = this.userId(req);
    const parsed = this.parseOrThrow(
      ConversationsSchemas.ListMessagesQuerySchema,
      query,
    );

    const result = await this.listMessagesUC.execute({
      userId,
      conversationId,
      ...(parsed.cursor ? { cursor: parsed.cursor } : {}),
      limit: parsed.limit,
    });

    const availabilityMap = await this.buildPostRefAvailabilityMap(result.items);

    return {
      items: result.items.map((m) => this.toMessageSummary(m, availabilityMap)),
      nextCursor: result.nextCursor,
    };
  }

  @Post(":id/messages")
  async sendTextMessage(
    @Param("id") conversationId: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    const userId = this.userId(req);
    const parsed = this.parseOrThrow(
      ConversationsSchemas.SendTextMessageRequestSchema,
      body,
    );

    const result = await this.sendTextMessageUC.execute({
      senderId: userId,
      conversationId,
      text: parsed.text,
      ...(this.actor(req).businessId ? { actor: this.actor(req) } : {}),
    });

    return this.toMessageSummary(result.message);
  }

  @Post(":id/messages/rich")
  async sendMessage(
    @Param("id") conversationId: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    const userId = this.userId(req);
    const parsed = this.parseOrThrow(
      ConversationsSchemas.SendMessageRequestSchema,
      body,
    );

    const result = await this.sendMessageUC.execute({
      senderId: userId,
      conversationId,
      ...parsed,
      ...(this.actor(req).businessId ? { actor: this.actor(req) } : {}),
    });

    return this.toMessageSummary(result.message);
  }

  @Post(":id/messages/post-ref")
  async sendPostRefMessage(
    @Param("id") conversationId: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    const userId = this.userId(req);
    const parsed = this.parseOrThrow(
      ConversationsSchemas.SendPostRefMessageRequestSchema,
      body,
    );

    const result = await this.sendPostRefMessageUC.execute({
      senderId: userId,
      conversationId,
      metadata: parsed.metadata,
      clientMessageId: parsed.clientMessageId,
      ...(this.actor(req).businessId ? { actor: this.actor(req) } : {}),
    });

    const availabilityMap = await this.buildPostRefAvailabilityMap([
      result.message,
    ]);

    return this.toMessageSummary(result.message, availabilityMap);
  }

  @Post(":id/attachments/presign")
  async presignChatAttachment(
    @Param("id") conversationId: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    const userId = this.userId(req);
    const parsed = this.parseOrThrow(
      ConversationsSchemas.PresignChatAttachmentRequestSchema,
      body,
    );

    const result = await this.presignChatAttachmentUploadUC.execute({
      userId,
      conversationId,
      contentType: parsed.contentType,
      sizeBytes: parsed.sizeBytes,
      ...(this.actor(req).businessId ? { actor: this.actor(req) } : {}),
    });

    return {
      uploadUrl: result.uploadUrl,
      key: result.key,
      expiresIn: result.expiresIn,
      maxSizeBytes: result.maxSizeBytes,
    };
  }

  @Post(":id/watermark")
  async updateWatermark(
    @Param("id") conversationId: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    const userId = this.userId(req);
    const parsed = this.parseOrThrow(
      ConversationsSchemas.UpdateWatermarkRequestSchema,
      body,
    );

    const result = await this.updateWatermarkUC.execute({
      userId,
      conversationId,
      ...(parsed.lastReadAt ? { lastReadAt: parsed.lastReadAt } : {}),
      ...(parsed.lastDeliveredAt
        ? { lastDeliveredAt: parsed.lastDeliveredAt }
        : {}),
    });

    return {
      conversationId: result.conversationId,
      lastReadAt: result.lastReadAt?.toISOString(),
      lastDeliveredAt: result.lastDeliveredAt?.toISOString(),
    };
  }

  @Post(":id/mute")
  async muteConversation(
    @Param("id") conversationId: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    const userId = this.userId(req);
    const parsed = this.parseOrThrow(
      ConversationsSchemas.MuteConversationRequestSchema,
      body,
    );

    const result = await this.muteConversationUC.execute({
      userId,
      conversationId,
      muted: parsed.muted,
    });

    return {
      conversationId: result.conversationId,
      mutedAt: result.mutedAt?.toISOString() ?? null,
    };
  }

  @Delete(":id/messages/:messageId")
  async deleteMessage(
    @Param("id") conversationId: string,
    @Param("messageId") messageId: string,
    @Req() req: FastifyRequest,
  ) {
    const userId = this.userId(req);

    const result = await this.deleteMessageUC.execute({
      userId,
      conversationId,
      messageId,
    });

    return {
      messageId: result.messageId,
      deletedAt: result.deletedAt.toISOString(),
    };
  }

  private userId(req: FastifyRequest): string {
    return (req as AuthenticatedRequest).user?.sub as string;
  }

  private actor(req: FastifyRequest) {
    const auth = req as AuthenticatedRequest;
    const businessId = req.headers["x-business-id"];
    return { userId: auth.user?.sub as string, sessionId: auth.user?.sid, ...(typeof businessId === "string" ? { businessId } : {}) };
  }

  private parseOrThrow<T>(
    schema: { parse: (data: unknown) => T },
    data: unknown,
  ): T {
    try {
      return schema.parse(data);
    } catch (err) {
      if (err && typeof err === "object" && "issues" in err) {
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: "Invalid request",
          details: (err as z.ZodError).flatten(),
        });
      }
      throw err;
    }
  }

  private toConversationSummaryResponse(
    conversation: Pick<Conversation, "id" | "buyerId" | "sellerId" | "updatedAt">,
    listing: ListingSummary | null,
    userId: string,
    peerView: { peer: ConversationPeer; blockedByMe: boolean },
    lastMessage?: Message | null,
    unreadCount?: number,
    availabilityMap?: Map<string, boolean>,
    peerLastReadAt?: Date | null,
    peerLastDeliveredAt?: Date | null,
    mutedAt?: Date | null,
  ) {
    return {
      id: conversation.id,
      buyerId: conversation.buyerId,
      sellerId: conversation.sellerId,
      myRole:
        userId === conversation.buyerId
          ? ("buyer" as const)
          : ("seller" as const),
      peer: {
        id: peerView.peer.id,
        displayName: peerView.peer.displayName,
        nameNumber: peerView.peer.nameNumber,
        avatarIndex: peerView.peer.avatarIndex,
        avatarKey: peerView.peer.avatarKey,
        deleted: peerView.peer.deleted,
      },
      blockedByMe: peerView.blockedByMe,
      updatedAt: conversation.updatedAt.toISOString(),
      listing: listing
        ? {
            id: listing.id,
            brandId: listing.brandId,
            modelId: listing.modelId,
            year: listing.year,
            displayPriceTmt: listing.displayPriceTmt,
            priceCurrency: listing.priceCurrency,
            coverMediaKey: listing.coverMediaKey,
            status: listing.status,
          }
        : null,
      lastMessage: lastMessage
        ? this.toMessageSummary(lastMessage, availabilityMap)
        : undefined,
      unreadCount: unreadCount ?? 0,
      peerLastReadAt: peerLastReadAt?.toISOString(),
      peerLastDeliveredAt: peerLastDeliveredAt?.toISOString(),
      mutedAt: mutedAt?.toISOString() ?? null,
    };
  }

  private toMessageSummary(
    message: Message,
    availabilityMap?: Map<string, boolean>,
  ) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      kind: message.kind,
      text: message.body,
      metadata: this.enrichMetadata(message, availabilityMap),
      createdAt: message.createdAt.toISOString(),
      deletedAt: message.deletedAt?.toISOString(),
      clientMessageId: message.clientMessageId ?? undefined,
    };
  }

  private enrichMetadata(
    message: Message,
    availabilityMap?: Map<string, boolean>,
  ): unknown | undefined {
    if (!message.metadata) {
      return undefined;
    }

    if (this.isPostRefMessage(message)) {
      const metadata = message.metadata;
      return {
        ...metadata,
        available:
          availabilityMap?.get(metadata.listingId) ??
          // If we did not preload availability, treat the snapshot as available.
          // This keeps individual sends simple; list endpoints always preload.
          true,
      };
    }

    return message.metadata;
  }

  private async buildPostRefAvailabilityMap(
    messages: Message[],
  ): Promise<Map<string, boolean>> {
    const listingIds = messages
      .filter(this.isPostRefMessage)
      .map((m) => m.metadata.listingId);

    const uniqueIds = [...new Set(listingIds)];

    if (uniqueIds.length === 0) {
      return new Map();
    }

    const summaries = await this.listings.getListingSummaries(uniqueIds);
    return availabilityMapForListingSummaries(summaries);
  }

  private isPostRefMessage(
    message: Message,
  ): message is Message & { kind: "post_ref"; metadata: PostRefMessageMetadata } {
    return message.kind === "post_ref" && message.metadata !== null;
  }
}
