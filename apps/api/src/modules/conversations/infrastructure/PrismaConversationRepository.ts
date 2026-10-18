import { randomUUID } from "node:crypto";
import type { MeasurementSchemas } from "@auto-tm/contracts";
import { MEASUREMENT_COMMIT_PORT, type MeasurementCommitPort } from "../../measurement/measurement.public";
import { BusinessEnquiryAccess } from "../application/BusinessEnquiryAccess";
import type { ConversationActor } from "../domain/ports/BusinessEnquiryRepository";
import { toDomainConversation } from "./ConversationMapper";
import { Inject, Injectable, Optional, ForbiddenException } from "@nestjs/common";
import { PrismaService, Prisma } from "@auto-tm/db";

import type { Conversation } from "../domain/Conversation";
import type { Message } from "../domain/Message";
import { MessageAlreadySavedError } from "../domain/ports/ConversationRepository";
import type {
  ConversationRepository,
  ParticipantState,
} from "../domain/ports/ConversationRepository";
import type { ConversationStatePort } from "../domain/ports/ConversationStatePort";
import type {
  ConversationReportContextPort,
  MessageReportContext,
} from "../domain/ports/ConversationReportContextPort";
import type { MessageModerationReadPort, ReportedMessage } from "../domain/ports/MessageModerationReadPort";
import { toDomainMessage, toRawMetadata } from "./MessageMapper";

@Injectable()
export class PrismaConversationRepository
  implements
    ConversationRepository,
    ConversationStatePort,
    ConversationReportContextPort,
    MessageModerationReadPort
{
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Optional() @Inject(BusinessEnquiryAccess) private readonly businessAccess?: BusinessEnquiryAccess,
    @Optional() @Inject(MEASUREMENT_COMMIT_PORT) private readonly measurement?:MeasurementCommitPort,
  ) {}

  async findById(id: string): Promise<Conversation | null> {
    const row = await this.prisma.conversation.findUnique({
      where: { id },
    });
    if (!row) return null;
    return toDomainConversation(row);
  }

  async findByListingAndBuyer(
    listingId: string,
    buyerId: string,
  ): Promise<Conversation | null> {
    const row = await this.prisma.conversation.findUnique({
      where: { listingId_buyerId: { listingId, buyerId } },
    });
    if (!row) return null;
    return toDomainConversation(row);
  }

  async save(conversation: Conversation, actor?: ConversationActor): Promise<void> {
    await this.prisma.$transaction(async tx=>{
      if(conversation.businessId) await this.authorizeBusinessWrite(tx,conversation,actor,false);
      await tx.conversation.create({data:{id:conversation.id,listingId:conversation.listingId,buyerId:conversation.buyerId,sellerId:conversation.sellerId,businessId:conversation.businessId,createdAt:conversation.createdAt,updatedAt:conversation.updatedAt}});
      await tx.conversationParticipant.create({data:{conversationId:conversation.id,userId:conversation.buyerId}});
      if(!conversation.businessId) await tx.conversationParticipant.create({data:{conversationId:conversation.id,userId:conversation.sellerId}});
      await this.measure(tx,conversation.buyerId,{version:1,eventId:randomUUID(),occurredAt:conversation.createdAt.toISOString(),purpose:"product_improvement",eventName:"conversation_created",context:{platform:"server",release:"server",build:"server",locale:"ru"},payload:{conversationId:conversation.id,listingId:conversation.listingId}});
    });
  }

  async listForUser(
    userId: string,
    query: { cursor?: string; limit?: number },
  ): Promise<{
    items: Array<{ conversation: Conversation; lastMessage: Message | null }>;
    nextCursor: string | null;
  }> {
    const take = (query.limit ?? 20) + 1;

    const rows = await this.prisma.conversation.findMany({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId, businessId: null }],
      },
      orderBy: { updatedAt: "desc" },
      take,
      ...(query.cursor
        ? {
            skip: 1,
            cursor: { id: query.cursor },
          }
        : {}),
    });

    const hasMore = rows.length === take;
    const items = hasMore ? rows.slice(0, -1) : rows;
    const last = items[items.length - 1];

    const lastMessageIds = items
      .map((r) => r.lastMessageId)
      .filter((id): id is string => id !== null && id !== undefined);

    const lastMessages =
      lastMessageIds.length > 0
        ? await this.prisma.message.findMany({
            where: { id: { in: lastMessageIds } },
          })
        : [];

    const lastMessageMap = new Map(
      lastMessages.map((r) => [r.id, toDomainMessage(r)]),
    );

    return {
      items: items.map((r) => ({
        conversation: toDomainConversation(r),
        lastMessage: r.lastMessageId
          ? (lastMessageMap.get(r.lastMessageId) ?? null)
          : null,
      })),
      nextCursor: hasMore && last ? last.id : null,
    };
  }

  async listMessages(
    conversationId: string,
    query: { cursor?: string; limit?: number },
  ): Promise<{ items: Message[]; nextCursor: string | null }> {
    const take = (query.limit ?? 20) + 1;

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      ...(query.cursor
        ? {
            skip: 1,
            cursor: { id: query.cursor },
          }
        : {}),
    });

    const hasMore = rows.length === take;
    const items = hasMore ? rows.slice(0, -1) : rows;
    const last = items[items.length - 1];

    return {
      items: items.map((r) => toDomainMessage(r)),
      nextCursor: hasMore && last ? last.id : null,
    };
  }

  async findMessageById(id: string): Promise<Message | null> {
    const row = await this.prisma.message.findUnique({
      where: { id },
    });
    if (!row) return null;
    return toDomainMessage(row);
  }

  async findMessageByClientMessageId(
    conversationId: string,
    senderId: string,
    clientMessageId: string,
  ): Promise<Message | null> {
    const row = await this.prisma.message.findUnique({
      where: {
        conversationId_senderId_clientMessageId: {
          conversationId,
          senderId,
          clientMessageId,
        },
      },
    });
    if (!row) return null;
    return toDomainMessage(row);
  }

  async saveMessage(message: Message, actor?: ConversationActor): Promise<void> {
    const now = new Date();
    try {
      const conversation = await this.prisma.conversation.findUnique({ where: { id: message.conversationId } });
      await this.prisma.$transaction(async tx=>{
        if(conversation?.businessId) await this.authorizeBusinessWrite(tx,toDomainConversation(conversation),actor,true);
        else await tx.$queryRaw`SELECT id FROM conversations WHERE id=${message.conversationId} FOR UPDATE`;
        await tx.message.create({data:{id:message.id,conversationId:message.conversationId,senderId:message.senderId,kind:message.kind,body:message.body,metadata:toRawMetadata(message.metadata) as Prisma.InputJsonValue,createdAt:message.createdAt,clientMessageId:message.clientMessageId??null}});
        await tx.conversation.update({where:{id:message.conversationId},data:{updatedAt:now,lastMessageAt:message.createdAt,lastMessageId:message.id}});
        if(conversation && this.measurement) await this.measureAcceptedMessage(tx,conversation,message);
      });
    } catch (error) {
      if (
        message.clientMessageId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await this.findMessageByClientMessageId(
          message.conversationId,
          message.senderId,
          message.clientMessageId,
        );
        if (existing) throw new MessageAlreadySavedError(existing);
      }
      throw error;
    }
  }

  async updateWatermark(
    userId: string,
    conversationId: string,
    data: { lastReadAt?: Date; lastDeliveredAt?: Date },
  ): Promise<ParticipantState> {
    const row = await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data: {
        ...(data.lastReadAt !== undefined
          ? { lastReadAt: data.lastReadAt }
          : {}),
        ...(data.lastDeliveredAt !== undefined
          ? { lastDeliveredAt: data.lastDeliveredAt }
          : {}),
      },
    });

    return {
      mutedAt: row.mutedAt,
      lastReadAt: row.lastReadAt,
      lastDeliveredAt: row.lastDeliveredAt,
    };
  }

  async getParticipantState(
    userId: string,
    conversationId: string,
  ): Promise<ParticipantState | null> {
    const row = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });
    if (!row) return null;
    return {
      mutedAt: row.mutedAt,
      lastReadAt: row.lastReadAt,
      lastDeliveredAt: row.lastDeliveredAt,
    };
  }

  async isMuted(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    const row = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      select: { mutedAt: true },
    });
    return row?.mutedAt != null;
  }

  async getParticipantStatesForConversations(
    conversationIds: string[],
  ): Promise<Map<string, Array<{ userId: string } & ParticipantState>>> {
    if (conversationIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.conversationParticipant.findMany({
      where: {
        conversationId: { in: conversationIds },
      },
    });

    const map = new Map<string, Array<{ userId: string } & ParticipantState>>();
    for (const row of rows) {
      const existing = map.get(row.conversationId) ?? [];
      existing.push({
        userId: row.userId,
        mutedAt: row.mutedAt,
        lastReadAt: row.lastReadAt,
        lastDeliveredAt: row.lastDeliveredAt,
      });
      map.set(row.conversationId, existing);
    }

    return map;
  }

  async muteConversation(
    userId: string,
    conversationId: string,
    muted: boolean,
  ): Promise<ParticipantState> {
    const row = await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data: {
        mutedAt: muted ? new Date() : null,
      },
    });

    return {
      mutedAt: row.mutedAt,
      lastReadAt: row.lastReadAt,
      lastDeliveredAt: row.lastDeliveredAt,
    };
  }

  async softDeleteMessage(
    messageId: string,
    userId: string,
    deletedAt: Date,
  ): Promise<Message | null> {
    const result = await this.prisma.message.updateMany({
      where: {
        id: messageId,
        senderId: userId,
        deletedAt: null,
      },
      data: {
        deletedAt,
      },
    });

    if (result.count === 0) return null;

    return this.findMessageById(messageId);
  }

  async countUnreadMessages(
    userId: string,
    conversationId: string,
  ): Promise<number> {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    const lastReadAt = participant?.lastReadAt ?? new Date(0);

    return this.prisma.message.count({
      where: {
        conversationId,
        senderId: { not: userId },
        deletedAt: null,
        createdAt: { gt: lastReadAt },
      },
    });
  }

  async countAllUnreadMessages(userId: string): Promise<number> {
    // One query for every Conversation. A Message is unread when another
    // participant sent it, it is not deleted, and it is newer than this User's
    // read watermark (none yet counts from the start), as in `countUnreadMessages`.
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS "count"
      FROM "messages" m
      JOIN "conversations" c ON c."id" = m."conversationId"
      LEFT JOIN "conversation_participants" p
        ON p."conversationId" = c."id" AND p."userId" = ${userId}
      WHERE (c."buyerId" = ${userId} OR (c."sellerId" = ${userId} AND c."businessId" IS NULL))
        AND m."senderId" <> ${userId}
        AND m."deletedAt" IS NULL
        AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")`;
    return rows[0]?.count ?? 0;
  }

  async getReportedMessage(messageId: string): Promise<ReportedMessage | null> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true, body: true, kind: true, createdAt: true, deletedAt: true },
    });
    if (!message) return null;
    return {
      id: message.id,
      senderId: message.senderId,
      body: message.deletedAt ? null : message.body,
      createdAt: message.createdAt,
      deletedAt: message.deletedAt,
      hasAttachment: message.kind === "image",
    };
  }

  async getMessageReportContext(input: {
    conversationId: string;
    messageId: string;
  }): Promise<MessageReportContext | null> {
    const [conversation, message] = await Promise.all([
      this.prisma.conversation.findUnique({
        where: { id: input.conversationId },
      }),
      this.prisma.message.findUnique({
        where: { id: input.messageId },
      }),
    ]);

    if (!conversation || !message) {
      return null;
    }

    if (message.conversationId !== conversation.id) {
      return null;
    }

    // Fetch a window of up to 10 messages before and after the reported
    // message, keeping the reported message itself for positioning.
    const beforeRows = await this.prisma.message.findMany({
      where: {
        conversationId: input.conversationId,
        OR: [
          { createdAt: { lt: message.createdAt } },
          {
            createdAt: { equals: message.createdAt },
            id: { lt: message.id },
          },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
    });

    const afterRows = await this.prisma.message.findMany({
      where: {
        conversationId: input.conversationId,
        OR: [
          { createdAt: { gt: message.createdAt } },
          {
            createdAt: { equals: message.createdAt },
            id: { gt: message.id },
          },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 10,
    });

    const contextRows = [
      ...beforeRows.reverse(),
      message,
      ...afterRows,
    ].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        a.id.localeCompare(b.id),
    );

    return {
      messageId: message.id,
      conversationId: conversation.id,
      listingId: conversation.listingId,
      buyerId: conversation.buyerId,
      sellerId: conversation.sellerId,
      senderId: message.senderId,
      createdAt: message.createdAt,
      body: message.body,
      deletedAt: message.deletedAt,
      surroundingMessages: contextRows
        .filter((m) => m.id !== message.id)
        .map((m) => ({
          id: m.id,
          senderId: m.senderId,
          createdAt: m.createdAt,
          body: m.body,
          deletedAt: m.deletedAt,
        })),
    };
  }

  async isParticipant(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });
    return participant != null;
  }

  private async measure(tx:Prisma.TransactionClient,userId:string,event:MeasurementSchemas.MeasurementEvent) {
    try {await this.measurement?.capture(tx,userId,event);} catch { /* Source success survives telemetry outage. */ }
  }

  private async measureAcceptedMessage(tx:Prisma.TransactionClient,conversation:{id:string;listingId:string;buyerId:string},message:Message) {
    let savepoint=false;
    try {
      await tx.$executeRaw`SAVEPOINT measurement_message_outcomes`;savepoint=true;
      const previous=await tx.$queryRaw<{statement:string;lock:string}[]>`SELECT current_setting('statement_timeout') AS statement,current_setting('lock_timeout') AS lock`;
      await tx.$queryRaw`SELECT set_config('statement_timeout','50ms',true),set_config('lock_timeout','10ms',true)`;
      const current=await tx.conversation.findUniqueOrThrow({where:{id:conversation.id},select:{firstBuyerMessageId:true,firstSellerReplyId:true}});
      const envelope={version:1 as const,eventId:randomUUID(),occurredAt:message.createdAt.toISOString(),purpose:"product_improvement" as const,context:{platform:"server" as const,release:"server",build:"server",locale:"ru" as const}};
      if(message.senderId===conversation.buyerId && message.kind!=="system" && !current.firstBuyerMessageId){
        // The Conversation lock serializes accepted writes. A later same-time UUID
        // cannot redefine the first committed cohort. Existing history stays closed.
        const existing=await tx.message.findFirst({where:{conversationId:conversation.id,senderId:conversation.buyerId,kind:{not:"system"},id:{not:message.id}},select:{id:true}});
        if(!existing){
          await tx.conversation.update({where:{id:conversation.id},data:{firstBuyerMessageId:message.id}});
          await this.measure(tx,message.senderId,{...envelope,eventName:"first_buyer_message_accepted",payload:{conversationId:conversation.id,listingId:conversation.listingId,messageId:message.id}});
        }
      }else if(current.firstBuyerMessageId && !current.firstSellerReplyId && message.senderId!==conversation.buyerId && message.kind!=="system"){
        const first=await tx.message.findUnique({where:{id:current.firstBuyerMessageId},select:{createdAt:true,deletedAt:true}});
        // Never fabricate historical acceptance or substitute a deleted first Message.
        const priorReply=await tx.message.findFirst({where:{conversationId:conversation.id,senderId:{not:conversation.buyerId},kind:{not:"system"},id:{not:message.id},...(first?{createdAt:{gte:first.createdAt}}:{})},select:{id:true}});
        if(first && !first.deletedAt && !priorReply){
          await tx.conversation.update({where:{id:conversation.id},data:{firstSellerReplyId:message.id}});
          const elapsedMs=message.createdAt.getTime()-first.createdAt.getTime();
          if(elapsedMs>=0 && elapsedMs<=90*86_400_000)await this.measure(tx,message.senderId,{...envelope,eventName:"seller_first_reply",payload:{conversationId:conversation.id,listingId:conversation.listingId,firstBuyerMessageId:current.firstBuyerMessageId,replyMessageId:message.id,elapsedMs}});
        }
      }
      await tx.$queryRaw`SELECT set_config('statement_timeout',${previous[0]?.statement??"0"},true),set_config('lock_timeout',${previous[0]?.lock??"0"},true)`;
      await tx.$executeRaw`RELEASE SAVEPOINT measurement_message_outcomes`;
    } catch {
      if(savepoint) {try {await tx.$executeRaw`ROLLBACK TO SAVEPOINT measurement_message_outcomes`;await tx.$executeRaw`RELEASE SAVEPOINT measurement_message_outcomes`;} catch { /* Core owner handles an unusable transaction. */ }}
    }
  }

  private async authorizeBusinessWrite(tx: Prisma.TransactionClient, initial: Conversation, actor: ConversationActor | undefined, sending: boolean) {
    if (!this.businessAccess || !actor) throw new ForbiddenException({ code: "FORBIDDEN" });
    await this.businessAccess.authorize(initial, actor, { send: sending, transaction: tx });
    await tx.$queryRaw`SELECT id FROM dealerships WHERE id = ${initial.businessId} FOR UPDATE`;
    const business = await tx.dealership.findUnique({ where: { id: initial.businessId ?? "" } });
    if (business?.status !== "active") throw new ForbiddenException({ code: "FORBIDDEN", details: { reason: "BUSINESS_INACTIVE" } });
    await tx.$queryRaw`SELECT id FROM listings WHERE id = ${initial.listingId} FOR UPDATE`;
    const listing = await tx.listing.findUnique({ where: { id: initial.listingId } });
    if (!listing || listing.businessId !== initial.businessId || listing.deletedAt || listing.status === "banned" || !listing.allowChat || (!sending && listing.status !== "active")) throw new ForbiddenException({ code: "FORBIDDEN", details: { reason: "LISTING_NOT_CONTACTABLE" } });
    if (sending) {
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${initial.id} FOR UPDATE`;
      const current = await tx.conversation.findUniqueOrThrow({ where: { id: initial.id } });
      await this.businessAccess.authorize(toDomainConversation(current), actor, { send: true, transaction: tx });
    }
  }

}
