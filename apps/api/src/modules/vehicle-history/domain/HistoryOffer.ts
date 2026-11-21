import type { HistoryOfferSchemas as O } from "@auto-tm/contracts";

export interface HistoryOfferStore {
  read(): Promise<O.HistoryOffer>;
  save(offer: O.HistoryOffer): Promise<void>;
}
export interface HistoryPreflightPort {
  check(vin: string): Promise<O.HistoryOffer["preflight"]>;
}
export const HISTORY_PREFLIGHT = Symbol("HistoryPreflight");

export function normalizeHistoryVin(value: string) {
  return value.replace(/[\t\n\r ]/g, "").replace(/[a-z]/g, (letter) => letter.toUpperCase());
}
