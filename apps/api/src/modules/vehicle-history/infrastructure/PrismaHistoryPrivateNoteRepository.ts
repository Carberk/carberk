import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";
import type { HistoryPrivateNoteRepository } from "../domain/HistoryPrivateNoteRepository";
import { HistoryRequestError } from "../domain/HistoryRequestError";

@Injectable()
export class PrismaHistoryPrivateNoteRepository implements HistoryPrivateNoteRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async append(input: { requestId: string; authorId: string; assignmentVersion: number;
    clientNoteId: string; text: string }) {
    const key = { requestId: input.requestId, authorId: input.authorId, clientNoteId: input.clientNoteId };
    const existing = await this.prisma.historyPrivateNote.findUnique({ where: { requestId_authorId_clientNoteId: key } });
    if (existing) {
      if (existing.text !== input.text) throw new HistoryRequestError("HISTORY_NOTE_CONFLICT");
      return existing;
    }
    return this.prisma.historyPrivateNote.create({ data: input });
  }

  async page({ requestId, cursor, limit }: { requestId: string; cursor?: string | undefined; limit: number }) {
    const after = cursor ? await this.prisma.historyPrivateNote.findUnique({
      where: { id: cursor }, select: { requestId: true, sequence: true },
    }) : null;
    if (cursor && (!after || after.requestId !== requestId)) throw new HistoryRequestError("HISTORY_NOTE_CURSOR");
    const rows = await this.prisma.historyPrivateNote.findMany({
      where: { requestId, ...(after ? { sequence: { gt: after.sequence } } : {}) },
      orderBy: { sequence: "asc" }, take: limit + 1,
    });
    return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1]?.id ?? null : null };
  }
}
