import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import type { ChatAttachmentIssuance, ChatAttachmentUploadRepository } from "../domain/ports/ChatAttachmentUploadRepository";

@Injectable()
export class PrismaChatAttachmentUploadRepository implements ChatAttachmentUploadRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(data: ChatAttachmentIssuance): Promise<void> {
    await this.prisma.chatAttachmentUpload.create({ data });
  }

  async find(key: string) {
    const issuance = await this.prisma.chatAttachmentUpload.findUnique({ where: { key } });
    if (!issuance) return null;
    const committed = await this.prisma.message.findFirst({ where: {
      conversationId: issuance.conversationId, kind: "image", metadata: { path: ["key"], equals: key },
    }, select: { id: true } });
    return { ...issuance, committed: committed !== null };
  }
}
