import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IDENTITY_CHECK_PORT, IDENTITY_READ_PORT, type IdentityCheckPort, type IdentityReadPort } from "../../identity/identity.public";
import type { Env } from "../../../env.schema";
import { bookedPayment } from "../domain/HistoryOrder";
import { HISTORY_RECOVERY_QUEUE, settleHistoryRecovery, type HistoryRecoveryQueue } from "../domain/HistoryRecovery";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";

@Injectable()
export class HistoryRecoveryWorker {
  private readonly logger = new Logger(HistoryRecoveryWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;

  constructor(@Inject(HISTORY_RECOVERY_QUEUE) private readonly queue: HistoryRecoveryQueue,
    @Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort,
    @Inject(IDENTITY_CHECK_PORT) private readonly checks: IdentityCheckPort,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  onModuleInit() {
    if (!this.enabled()) return;
    this.timer = setInterval(() => void this.execute().catch(() => this.logger.warn("History recovery scan failed")), 5_000);
    this.timer.unref();
  }

  execute() {
    this.active ??= this.scan().finally(() => { delete this.active; });
    return this.active;
  }

  private enabled() {
    return this.config.get("VEHICLE_HISTORY_SYNTHETIC_ENABLED", { infer: true }) === true &&
      ["development", "test"].includes(this.config.get("APP_ENV", { infer: true }));
  }

  private async scan() {
    if (!this.enabled()) return;
    const testers = (this.config.get("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", { infer: true }) ?? "").split(",").map((id) => id.trim()).filter(Boolean);
    if (!testers.length) return;
    const now = this.clock.now();
    let after = "";
    for (;;) {
      const ids = await this.queue.due(testers, now, after);
      if (!ids.length) return;
      for (const id of ids) {
        try {
          await this.queue.settle(id, testers, async (requesterId, orders) => {
            const [owner, deleting] = await Promise.all([this.identity.findUserById(requesterId), this.checks.isDeletionScheduled(requesterId)]);
            if (!owner || owner.deleted || owner.suspendedAt || deleting || !this.enabled()) return;
            const order = await orders.read();
            if (!order || !bookedPayment(order, await orders.paymentChecks())) return;
            const delivered = !!await orders.reportArtifacts.delivered(order.id);
            await settleHistoryRecovery(orders, order, this.clock.now(), delivered, await orders.fulfilment());
          });
        } catch { this.logger.warn("History recovery transition failed"); }
        after = id;
      }
    }
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.active?.catch(() => undefined);
  }
}
