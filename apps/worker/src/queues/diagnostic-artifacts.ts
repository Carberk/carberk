import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Queue } from "bullmq";

import { DiagnosticArtifactWorker } from "../jobs/diagnostics/DiagnosticArtifactWorker";

export const DIAGNOSTIC_ARTIFACT_QUEUE = "diagnostic-artifacts";
@Injectable()
export class DiagnosticArtifactScheduler implements OnModuleInit {
  constructor(@InjectQueue(DIAGNOSTIC_ARTIFACT_QUEUE) private readonly queue: Queue) {}
  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler("minute-diagnostic-artifacts", { every: 60_000 }, { name: "reconcile-diagnostic-artifacts", data: {}, opts: { attempts: 3, backoff: { type: "exponential", delay: 60_000 }, removeOnComplete: 10, removeOnFail: 25 } });
  }
}
@Processor(DIAGNOSTIC_ARTIFACT_QUEUE)
export class DiagnosticArtifactProcessor extends WorkerHost {
  constructor(@Inject(DiagnosticArtifactWorker) private readonly artifacts: DiagnosticArtifactWorker) { super(); }
  async process(): Promise<void> { await this.artifacts.execute(); }
}
