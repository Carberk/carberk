import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";
import {
  ServiceMessageError,
  type ServiceMessageRepository,
  type SendServiceTextInput,
  type ReadServiceMessagesInput,
  type ServiceStream,
  type ServiceMessage,
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
    const { purpose, objectId, cursor, limit } = input;
    const stream = await this.prisma.serviceConversation.findUnique({
      where: { purpose_objectId: { purpose, objectId } }, select: { id: true },
    });
    const after = cursor && stream ? await this.prisma.serviceMessage.findFirst({
      where: { id: cursor, conversationId: stream.id }, select: { streamOrder: true },
    }) : null;
    if (cursor && !after) throw new ServiceMessageError("SERVICE_MESSAGE_INVALID_CURSOR");
    if (!stream) return { items: [], nextCursor: null };
    const rows = await this.prisma.serviceMessage.findMany({
      where: { conversationId: stream.id, ...(after ? { streamOrder: { gt: after.streamOrder } } : {}) },
      orderBy: { streamOrder: "asc" }, take: limit + 1,
    });
    return {
      items: rows.slice(0, limit).map((row) => communication(row, { purpose, objectId })),
      nextCursor: rows.length > limit ? rows[limit - 1]?.id ?? null : null,
    };
  }
}
