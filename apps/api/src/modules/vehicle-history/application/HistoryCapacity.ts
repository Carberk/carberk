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

  async correctionProvider(orders: HistoryOrderStore, order: StoredHistoryOrder, reports: AvailableHistoryReports, now: Date) {
    const from = new Date(order.acceptedOffer.proposal.deliveryFrom), by = new Date(order.acceptedOffer.proposal.deliveryBy);
    if (by <= now) throw new HistoryRequestError("HISTORY_ORDER_STALE");
    const names = reports.providers.map(({ name }) => name);
    const preferred = order.reservedProvider;
    if (preferred && names.includes(preferred)) names.sort((a) => a === preferred ? -1 : 1);
    for (const name of names) {
      const budget = await this.remaining(orders, name, from, by, now, true);
      if (budget && budget.slots > 0) return name;
    }
    throw new HistoryRequestError("HISTORY_ORDER_CAPACITY");
  }

  async requireFulfilmentBudget(orders: HistoryOrderStore, order: StoredHistoryOrder, provider: HistoryProvider, now: Date, additional: boolean) {
    const { deliveryFrom, deliveryBy } = order.acceptedOffer.proposal;
    const budget = await this.remaining(orders, provider, new Date(deliveryFrom), new Date(deliveryBy), now);
    if (!budget || budget.slots < (additional ? 1 : 0)) throw new HistoryRequestError("HISTORY_ORDER_CAPACITY");
  }

  private async remaining(orders: HistoryOrderStore, provider: HistoryProvider, from: Date, by: Date, now: Date, excludeCurrent = false) {
    const budget = this.config.get("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { infer: true })?.[provider];
    if (!budget?.allowance) return null;
    const periodStart = new Date(`${from.toISOString().slice(0, 10)}T${budget.resetUtc}:00Z`);
    if (from < periodStart) periodStart.setUTCDate(periodStart.getUTCDate() - 1);
    const periodEnd = new Date(periodStart.getTime() + 86_400_000);
    if (by > periodEnd) return null;
    const external = budget.externalUsage[periodStart.toISOString().slice(0, 10)] ?? 0;
    const reserved = await orders.providerUsage(provider, periodStart, periodEnd, now, excludeCurrent);
    return { slots: budget.allowance - external - reserved, periodStart, periodEnd };
  }
}
