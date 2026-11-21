import { Injectable } from "@nestjs/common";
import type { HistoryOfferSchemas as O } from "@auto-tm/contracts";
import type { HistoryPreflightPort } from "../domain/HistoryOffer";

@Injectable()
export class SyntheticHistoryPreflight implements HistoryPreflightPort {
  async check(vin: string): Promise<O.HistoryOffer["preflight"]> {
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return { status: "malformed" } as const;
    const failures = new Map<string, "unsupported" | "no_history" | "mismatch" | "outage">([
      ["DEMA0000000000002", "unsupported"], ["DEMA0000000000003", "no_history"],
      ["DEMA0000000000004", "mismatch"], ["DEMA0000000000005", "outage"],
    ] as const);
    const failure = failures.get(vin);
    if (failure) return { status: failure };
    if (vin === "DEMA0000000000001") return { status: "available", providers: [
      { name: "Carfax", originalReportDate: "2026-10-14" },
      { name: "AutoCheck", originalReportDate: "2026-10-15" },
    ] };
    if (vin === "DEMA0000000000006") return { status: "available", providers: [
      { name: "AutoCheck", originalReportDate: null },
    ] };
    return { status: "unsupported" } as const;
  }
}
