import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../../env.schema";
import { fulfilmentAgreement, fulfilmentSources } from "../domain/HistoryFulfilment";
import { historyBookingWindow, historyDeliveryDay, type AvailableHistoryReports, type HistoryOrderStore, type HistoryProvider,
  type HistoryPaidProviderPriority, type HistoryProviderUsageOptions, type StoredHistoryOrder } from "../domain/HistoryOrder";
import { HistoryRequestError } from "../domain/HistoryRequestError";

@Injectable()
export class HistoryCapacity {
  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  async plan(orders: HistoryOrderStore, reports: AvailableHistoryReports, from: Date, by: Date, now: Date, excludeCurrent = false) {
    const day = historyDeliveryDay(from, by, now);
    const today = new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
    const daily = this.config.get("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", { infer: true }) ?? 0;
    const morning = this.config.get("VEHICLE_HISTORY_SYNTHETIC_MORNING_SLOTS", { infer: true }) ?? 0;
    const used = await orders.capacity(day, from, by, now, excludeCurrent);
    if (used.total >= daily || used.overlapping > 0 || day !== today && used.morning >= morning) {
      throw new HistoryRequestError("HISTORY_ORDER_CAPACITY");
    }

    let provider: HistoryProvider | undefined;
    let mostRemaining = 0;
    for (const { name } of reports.providers) {
      const budget = await this.remaining(orders, name, from, by, now, { excludeCurrent });
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
    const { deliveryFrom, deliveryBy } = historyBookingWindow(order);
    const from = new Date(deliveryFrom), by = new Date(deliveryBy);
    if (by <= now) return { primary, second: null };
    return orders.serialize(async () => {
      const budget = await this.remaining(orders, alternate, from, by, now);
      if (!budget || budget.slots < 1) return { primary, second: null };
      const earlier = await orders.earlierPaidOrdersForSecondReport(alternate, budget.periodStart, budget.periodEnd, confirmedAt, now);
      return { primary, second: budget.slots > earlier ? alternate : null };
    });
  }

  async existingProvider(orders: HistoryOrderStore, order: StoredHistoryOrder, now: Date) {
    if (order.reservedProvider || new Date(historyBookingWindow(order).deliveryBy) <= now) return order.reservedProvider;
    return this.findProvider(orders, order, order.acceptedOffer.preflight, now, true);
  }

  async correctionProvider(orders: HistoryOrderStore, order: StoredHistoryOrder, reports: AvailableHistoryReports, now: Date,
    priority?: HistoryPaidProviderPriority) {
    if (new Date(historyBookingWindow(order).deliveryBy) <= now) throw new HistoryRequestError("HISTORY_ORDER_STALE");
    const provider = await this.findProvider(orders, order, reports, now, false, priority);
    if (priority && (!provider || provider !== order.reservedProvider) && await orders.hasEarlierPaidWork(priority.confirmedBefore, now)) {
      throw new HistoryRequestError("HISTORY_FULFILMENT_FIFO");
    }
    if (!provider) throw new HistoryRequestError("HISTORY_ORDER_CAPACITY");
    return provider;
  }

  private async findProvider(orders: HistoryOrderStore, order: StoredHistoryOrder, reports: AvailableHistoryReports, now: Date,
    requireAvailableSource = false, priority?: HistoryPaidProviderPriority) {
    const { deliveryFrom, deliveryBy } = historyBookingWindow(order);
    const from = new Date(deliveryFrom), by = new Date(deliveryBy);
    const names = reports.providers.map(({ name }) => name);
    const preferred = order.reservedProvider;
    if (preferred && names.includes(preferred)) names.sort((a) => a === preferred ? -1 : 1);
    let archiveProvider: HistoryProvider | undefined;
    for (const name of names) {
      const unreserved = name === preferred ? "none" : priority ?? "none";
      const budget = await this.remaining(orders, name, from, by, now, { excludeCurrent: true, unreserved });
      if (!budget || budget.slots < 1) continue;
      if (!requireAvailableSource || budget.periodStart <= now) return name;
      const accepted = fulfilmentAgreement(order, name);
      if (accepted && fulfilmentSources(accepted).includes("archive")) archiveProvider ??= name;
    }
    return archiveProvider;
  }

  async canUseFulfilmentBudget(orders: HistoryOrderStore, order: StoredHistoryOrder, provider: HistoryProvider, now: Date, additional: boolean) {
    const { deliveryFrom, deliveryBy } = historyBookingWindow(order);
    const budget = await this.remaining(orders, provider, new Date(deliveryFrom), new Date(deliveryBy), now,
      { unreserved: additional ? "all" : "none" });
    const needed = additional || order.reservedProvider !== provider ? 1 : 0;
    return !!budget && now >= budget.periodStart && budget.slots >= needed;
  }

  private async remaining(orders: HistoryOrderStore, provider: HistoryProvider, from: Date, by: Date, now: Date, options?: HistoryProviderUsageOptions) {
    const budget = this.config.get("VEHICLE_HISTORY_SYNTHETIC_PROVIDER_BUDGETS", { infer: true })?.[provider];
    if (!budget?.allowance) return null;
    const periodStart = new Date(`${from.toISOString().slice(0, 10)}T${budget.resetUtc}:00Z`);
    if (from < periodStart) periodStart.setUTCDate(periodStart.getUTCDate() - 1);
    const periodEnd = new Date(periodStart.getTime() + 86_400_000);
    if (by > periodEnd) return null;
    const external = budget.externalUsage[periodStart.toISOString().slice(0, 10)] ?? 0;
    const reserved = await orders.providerUsage(provider, periodStart, periodEnd, now, options);
    return { slots: budget.allowance - external - reserved, periodStart, periodEnd };
  }
}
