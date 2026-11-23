import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../../env.schema";
import { HISTORY_PRIVATE_FILES, HISTORY_PRIVATE_STORAGE, type HistoryPrivateFileRepository, type HistoryPrivateStorage } from "../domain/HistoryPrivateFile";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";

@Injectable()
export class CleanupHistoryPrivateFiles {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(@Inject(HISTORY_PRIVATE_FILES) private readonly repository: HistoryPrivateFileRepository,
    @Inject(HISTORY_PRIVATE_STORAGE) private readonly storage: HistoryPrivateStorage,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}
  onModuleInit() {
    if (this.config.get("VEHICLE_HISTORY_SYNTHETIC_ENABLED", { infer: true }) && ["development", "test"].includes(this.config.get("APP_ENV", { infer: true }))) {
      this.timer = setInterval(() => { void this.execute().catch(() => undefined); }, 60_000);
      this.timer.unref();
    }
  }
  async execute() {
    if (this.running) return;
    this.running = true;
    try {
      for (const candidate of await this.repository.expired(this.clock.now())) {
        await this.repository.run(candidate.requestId, null, async (_request, files) => {
          const file = await files.find(candidate.id);
          if (!file || !["pending", "uploaded"].includes(file.status) || file.expiresAt > this.clock.now()) return;
          await this.storage.delete(file);
          file.status = "deleted"; await files.save(file);
        });
      }
    } finally { this.running = false; }
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
