import { Injectable, type OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";

import { RETIRED_UPLOAD_CLEANUP_QUEUE } from "./retired-upload-cleanup.processor";

const EVERY_MS = 60_000;

@Injectable()
export class RetiredUploadCleanupScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(RETIRED_UPLOAD_CLEANUP_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // The job only triggers a sweep, so finished jobs carry nothing worth keeping.
    await this.queue.upsertJobScheduler(
      "retired-upload-cleanup-sweep",
      { every: EVERY_MS },
      { name: "sweep", data: {}, opts: { removeOnComplete: 10, removeOnFail: 100 } },
    );
  }
}
