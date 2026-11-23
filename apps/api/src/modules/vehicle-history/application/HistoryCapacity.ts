import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../../env.schema";
import { historyDeliveryDay, type AvailableHistoryReports, type HistoryOrderStore, type HistoryProvider, type StoredHistoryOrder } from "../domain/HistoryOrder";
import { HistoryRequestError } from "../domain/HistoryRequestError";

@Injectable()
export class HistoryCapacity {
  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  async plan(orders: HistoryOrderStore, reports: AvailableHistoryReports, from: Date, by: Date, now: Date) {
    const day = historyDeliveryDay(from, by, now);
    const today = new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
    const daily = this.config.get("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", { infer: true }) ?? 0;
    const morning = this.config.get("VEHICLE_HISTORY_SYNTHETIC_MORNING_SLOTS", { infer: true }) ?? 0;
    const used = await orders.capacity(day, from, by, now);
    if (used.total >= daily || used.overlapping > 0 || day !== today && used.morning >= morning) {
      throw new HistoryRequestError("HISTORY_ORDER_CAPACITY");
    }

    let provider: HistoryProvider | undefined;
    let mostRemaining = 0;
    for (const { name } of reports.providers) {
      const budget = await this.remaining(orders, name, from, by, now);
      if (budget && budget.slots > mostRemaining) {
        mostRemaining = budget.slots;
        provider = name;
      }
    }
    if (!provider) throw new HistoryRequestError("HISTORY_ORDER_CAPACITY");
    return { day, provider };
  }

  async paidReportPlan(orders: HistoryOrderStore, order: StoredHistoryOrder, confirmedAt: string, now: Date) {
    const primary = order.reservedProvider;
    if (!primary) return undefined;
    const alternate = order.acceptedOffer.preflight.providers.find(({ name }) => name !== primary)?.name;
    if (!alternate) return { primary, second: null };
    const { deliveryFrom, deliveryBy } = order.acceptedOffer.proposal;
    const from = new Date(deliveryFrom), by = new Date(deliveryBy);
    if (by <= now) return { primary, second: null };
    return orders.serialize(async () => {
      const budget = await this.remaining(orders, alternate, from, by, now);
      if (!budget || budget.slots < 1) return { primary, second: null };
      const earlier = await orders.earlierPaidOrdersForSecondReport(alternate, budget.periodStart, budget.periodEnd, confirmedAt, now);
      return { primary, second: budget.slots > earlier ? alternate : null };
    });
  }

  private async remaining(orders: HistoryOrderStore, provider: HistoryProvider, from: Date, by: Date, now: Date) {
    const budget = this.config.get("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { infer: true })?.[provider];
    if (!budget?.allowance) return null;
    const periodStart = new Date(`${from.toISOString().slice(0, 10)}T${budget.resetUtc}:00Z`);
    if (from < periodStart) periodStart.setUTCDate(periodStart.getUTCDate() - 1);
    const periodEnd = new Date(periodStart.getTime() + 86_400_000);
    if (by > periodEnd) return null;
    const external = budget.externalUsage[periodStart.toISOString().slice(0, 10)] ?? 0;
    const reserved = await orders.providerUsage(provider, periodStart, periodEnd, now);
    return { slots: budget.allowance - external - reserved, periodStart, periodEnd };
  }
}
