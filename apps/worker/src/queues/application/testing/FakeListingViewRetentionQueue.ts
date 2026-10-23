import type { JobsOptions, RepeatOptions } from "bullmq";

/** External queue-boundary fake keeps stable schedule and catch-up state. */
export class FakeListingViewRetentionQueue {
  readonly schedules = new Map<string, { repeat: RepeatOptions; name: string; data: unknown; opts: JobsOptions }>();
  readonly startup = new Map<string, { name: string; data: unknown; opts: JobsOptions }>();
  async upsertJobScheduler(id: string, repeat: RepeatOptions, template: { name: string; data: unknown; opts: JobsOptions }): Promise<void> {
    this.schedules.set(id, { repeat, ...template });
  }
  async add(name: string, data: unknown, opts: JobsOptions): Promise<void> {
    this.startup.set(opts.jobId ?? name, { name, data, opts });
  }
}
