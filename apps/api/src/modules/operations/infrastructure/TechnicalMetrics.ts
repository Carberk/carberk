import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";

import { TechnicalCounters } from "../application/TechnicalCounters";

import { RedisOperationsSnapshot } from "./RedisOperationsSnapshot";

@Injectable()
export class TechnicalMetrics implements OnModuleInit, OnModuleDestroy {
  private readonly enabled = process.env["OPERATIONS_ENABLED"] === "true";
  private readonly counters = new TechnicalCounters();
  private timer: ReturnType<typeof setInterval> | undefined;
  private pending = false;
  constructor(@Inject(RedisOperationsSnapshot) private readonly store: RedisOperationsSnapshot) {}
  record(status: number, elapsedMs: number): void { if (this.enabled) this.counters.record(status, elapsedMs); }
  onModuleInit(): void {
    if (!this.enabled) return;
    const flush = async () => {
      if (this.pending) return;
      this.pending = true;
      try { await this.store.publishTechnical(this.counters.snapshot()); }
      catch { /* Requests never await diagnostics; unavailable observations remain unknown. */ }
      finally { this.pending = false; }
    };
    this.timer = setInterval(() => void flush(), 15_000);
    this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }
}
