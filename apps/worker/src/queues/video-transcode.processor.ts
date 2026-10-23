import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@auto-tm/db";
import { UnrecoverableError, type Job, type Queue } from "bullmq";
import { z } from "zod";

import type { Env } from "../env.schema";
import { ProcessPreparedVideo } from "../jobs/video/ProcessPreparedVideo";
import { CleanVideo } from "../jobs/video/CleanVideo";

/** PostgreSQL is the outbox. A queue delivery is only a bounded wake-up and
 * never grants ownership, eligibility, readiness or deletion authority. */
@Processor("video-transcode", { concurrency: 1 })
export class VideoTranscodeProcessor extends WorkerHost {
  constructor(@Inject(ProcessPreparedVideo) private readonly processing: ProcessPreparedVideo, @Inject(CleanVideo) private readonly cleanup: CleanVideo, @Inject(PrismaService) private readonly db: PrismaService, @Inject(ConfigService) private readonly config: ConfigService<Env, true>, @InjectQueue("video-transcode") private readonly queue: Queue) { super(); }
  async process(job: Job): Promise<void> {
    if (!["cleanup", "reconcile", "process-generation"].includes(job.name)) throw new UnrecoverableError("VIDEO_JOB_UNSUPPORTED");
    if (job.name === "cleanup") {
      if (this.config.get("VIDEO_CLEANUP_ENABLED", { infer: true })) await this.cleanup.execute();
      return;
    }
    if (!this.config.get("VIDEO_PROCESSING_ENABLED", { infer: true })) return;
    if (job.name === "reconcile") {
      const now = new Date();
      const due = await this.db.videoProcessWork.findMany({ where: { state: { in: ["PENDING", "PROCESSING"] }, nextAttemptAt: { lte: now }, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }] }, orderBy: [{ nextAttemptAt: "asc" }, { generationId: "asc" }], take: 10 });
      for (const work of due) await this.queue.add("process-generation", { generationId: work.generationId }, { jobId: `generation-${work.generationId}-${work.attempts}`, attempts: 1, removeOnComplete: true, removeOnFail: true });
      return;
    }
    if (job.name === "process-generation") {
      const payload = z.object({ generationId: z.string().uuid() }).strict().safeParse(job.data);
      if (payload.success) await this.processing.execute(payload.data.generationId);
    }
  }
}
@Injectable()
export class VideoWorkScheduler implements OnModuleInit {
  constructor(@InjectQueue("video-transcode") private readonly queue: Queue, @Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}
  async onModuleInit(): Promise<void> {
    if (this.config.get("VIDEO_PROCESSING_ENABLED", { infer: true })) await this.queue.upsertJobScheduler("video-processing-minute", { every: 60_000 }, { name: "reconcile", data: {}, opts: { removeOnComplete: 5, removeOnFail: 10 } });
    if (this.config.get("VIDEO_CLEANUP_ENABLED", { infer: true })) await this.queue.upsertJobScheduler("video-cleanup-minute", { every: 60_000 }, { name: "cleanup", data: {}, opts: { removeOnComplete: 5, removeOnFail: 10 } });
  }
}
