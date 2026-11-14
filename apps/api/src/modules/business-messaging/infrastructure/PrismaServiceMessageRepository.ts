import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";
import {
  ServiceMessageError,
  type ServiceMessageRepository,
  type SendServiceTextInput,
  type ReadServiceMessagesInput,
  type ServiceStream,
  type ServiceMessage,
  type AcknowledgeServiceMessagesInput,
  type ServiceReceipt,
} from "../domain/ServiceMessageRepository";

type StoredMessage = Prisma.ServiceMessageGetPayload<Record<string, never>>;

function communication(row: StoredMessage, stream: ServiceStream): ServiceMessage {
  return {
    ...stream, id: row.id, kind: row.kind, senderId: row.senderId,
    clientMessageId: row.clientMessageId, text: row.text,
    order: row.streamOrder.toString(), createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class PrismaServiceMessageRepository implements ServiceMessageRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async append(input: SendServiceTextInput): Promise<ServiceMessage> {
    const { purpose, objectId, senderId, clientMessageId, text } = input;
    return this.prisma.$transaction(async (tx) => {
      // Concurrent first sends arbitrate on the stream key before either can append.
      await tx.$executeRaw`
        INSERT INTO service_conversations (id, purpose, "objectId")
        VALUES (gen_random_uuid()::text, ${purpose}::"ServiceMessagePurpose", ${objectId})
        ON CONFLICT (purpose, "objectId") DO NOTHING`;
      const [stream] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM service_conversations
        WHERE purpose = ${purpose}::"ServiceMessagePurpose" AND "objectId" = ${objectId}
        FOR UPDATE`;
      if (!stream) throw new Error("Service stream disappeared");
      const original = await tx.serviceMessage.findUnique({
        where: { conversationId_senderId_clientMessageId: {
          conversationId: stream.id, senderId, clientMessageId,
        } },
      });
      if (original) return communication(original, { purpose, objectId });
      // The row lock is held until COMMIT, including the insert below. A later
      // committed append cannot get a lower order than an already visible message.
      const counter = await tx.serviceConversation.update({
        where: { id: stream.id }, data: { lastOrder: { increment: 1 } },
      });
      const saved = await tx.serviceMessage.create({ data: {
        conversationId: stream.id, senderId, clientMessageId, text, streamOrder: counter.lastOrder,
      } });
      return communication(saved, { purpose, objectId });
    });
  }

  async page(input: ReadServiceMessagesInput & { limit: number }) {
    const { purpose, objectId, cursor, limit, participant } = input;
    return this.prisma.$transaction(async (tx) => {
      // Only participant reads write fetch evidence. They serialize with acks and
      // appends on the same stream, with History/Identity fences still held.
      const [stream] = participant ? await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM service_conversations WHERE purpose = ${purpose}::"ServiceMessagePurpose"
        AND "objectId" = ${objectId} FOR UPDATE`
        : [await tx.serviceConversation.findUnique({ where: { purpose_objectId: { purpose, objectId } } })];
      const after = cursor && stream ? await tx.serviceMessage.findFirst({
        where: { id: cursor, conversationId: stream.id }, select: { streamOrder: true },
      }) : null;
      if (cursor && !after) throw new ServiceMessageError("SERVICE_MESSAGE_INVALID_CURSOR");
      if (!stream) return { items: [], nextCursor: null };
      const rows = await tx.serviceMessage.findMany({
        where: { conversationId: stream.id, ...(after ? { streamOrder: { gt: after.streamOrder } } : {}) },
        orderBy: { streamOrder: "asc" }, take: limit + 1,
      });
      const items = rows.slice(0, limit), last = items.at(-1);
      if (participant && last) {
        const key = { conversationId: stream.id, ...participant };
        const where = { conversationId_participantId_sessionId_assignmentVersion: key };
        const offered = await tx.serviceMessageOffer.findUnique({ where });
        // Knowing a valid cursor cannot skip unfetched messages. Start at the
        // beginning in each session/assignment, then fetch contiguous pages.
        if ((after?.streamOrder ?? 0n) <= (offered?.offeredOrder ?? 0n)) {
          const previous = offered?.offeredOrder ?? 0n;
          const offeredOrder = last.streamOrder > previous ? last.streamOrder : previous;
          await tx.serviceMessageOffer.upsert({ where, create: { ...key, offeredOrder }, update: { offeredOrder } });
        }
      }
      return { items: items.map((row) => communication(row, { purpose, objectId })),
        nextCursor: rows.length > limit ? items.at(-1)?.id ?? null : null };
    });
  }

  async acknowledge({ purpose, objectId, participant, cursor, kind }: AcknowledgeServiceMessagesInput) {
    return this.prisma.$transaction(async (tx) => {
      const [stream] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM service_conversations WHERE purpose = ${purpose}::"ServiceMessagePurpose"
        AND "objectId" = ${objectId} FOR UPDATE`;
      const message = stream && await tx.serviceMessage.findFirst({ where: { conversationId: stream.id, id: cursor } });
      if (!stream || !message) throw new ServiceMessageError("SERVICE_MESSAGE_INVALID_CURSOR");
      const offered = await tx.serviceMessageOffer.findUnique({ where: {
        conversationId_participantId_sessionId_assignmentVersion: { conversationId: stream.id, ...participant },
      } });
      const key = { conversationId: stream.id, participantId: participant.participantId, assignmentVersion: participant.assignmentVersion };
      const where = { conversationId_participantId_assignmentVersion: key };
      const original = await tx.serviceReceipt.findUnique({ where });
      if (message.streamOrder > (offered?.offeredOrder ?? 0n)
        || (kind === "read" && message.streamOrder > (original?.receivedOrder ?? 0n))) {
        throw new ServiceMessageError("SERVICE_MESSAGE_INVALID_CURSOR");
      }
      const previous = kind === "read" ? original?.readOrder ?? 0n : original?.receivedOrder ?? 0n;
      const progress = { [kind === "read" ? "readOrder" : "receivedOrder"]: message.streamOrder > previous ? message.streamOrder : previous };
      return this.receipt(original ? await tx.serviceReceipt.update({ where, data: progress })
        : await tx.serviceReceipt.create({ data: { ...key, ...progress } }));
    });
  }

  async receipts({ purpose, objectId }: ServiceStream) {
    const rows = await this.prisma.serviceReceipt.findMany({ where: { conversation: { purpose, objectId } },
      orderBy: [{ participantId: "asc" }, { assignmentVersion: "asc" }] });
    return { items: rows.map((row) => this.receipt(row)) };
  }
  private receipt(row: { participantId: string; assignmentVersion: number; receivedOrder: bigint; readOrder: bigint }): ServiceReceipt {
    return { participantId: row.participantId, assignmentVersion: row.assignmentVersion,
      receivedOrder: row.receivedOrder.toString(), readOrder: row.readOrder.toString() };
  }
}
