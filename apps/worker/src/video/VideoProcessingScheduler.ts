import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { PrismaService } from "@auto-tm/db";

@Injectable()
export class VideoProcessingScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideoProcessingScheduler.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @InjectQueue("video-transcode") private readonly queue: Queue,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.enqueuePending().catch((error) => this.logger.warn(error instanceof Error ? error.message : "video processing sweep failed")); }, 15_000);
    this.timer.unref?.();
    void this.enqueuePending().catch(() => undefined);
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async enqueuePending(limit = 25): Promise<number> {
    const now = new Date();
    const rows = await this.prisma.videoGeneration.findMany({
      where: { status: "Processing", OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
      include: { source: true }, orderBy: { updatedAt: "asc" }, take: limit,
    });
    for (const row of rows) {
      await this.queue.add("process", { sourceId: row.sourceId, generationId: row.id, attempt: row.processingAttempt }, { jobId: `${row.id}-${row.processingAttempt}`, attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
    }
    return rows.length;
  }
}
