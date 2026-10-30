/** A complete five-minute window and 100 requests are required to evaluate an error rate. */
export function technicalRate(input: { requests: number; technicalErrors: number; windowMs: number }): number | null {
  const { requests, technicalErrors, windowMs } = input;
  if (!Number.isSafeInteger(requests) || requests < 100 || !Number.isSafeInteger(technicalErrors)
    || technicalErrors < 0 || technicalErrors > requests || !Number.isFinite(windowMs) || windowMs < 300_000) return null;
  return technicalErrors / requests;
}

export interface OperationalIncident {
  openedAt: string;
  lastObservedAt: string;
  resolvedAt: string | null;
}

/** Outages remain actionable outside coverage; acknowledgement scheduling never resets their age. */
export function advanceIncident(previous: OperationalIncident | null, failing: boolean, now: Date): OperationalIncident | null {
  if (!failing) return previous ? { ...previous, lastObservedAt: now.toISOString(), resolvedAt: previous.resolvedAt ?? now.toISOString() } : null;
  return {
    openedAt: previous?.resolvedAt === null ? previous.openedAt : now.toISOString(),
    lastObservedAt: now.toISOString(),
    resolvedAt: null,
  };
}

export function budgetProjection(phase: "railway" | "tm", projected: number) {
  if (!Number.isFinite(projected) || projected < 0) throw new Error("Invalid budget projection");
  const ceiling = phase === "railway" ? 100 : 8_000;
  return { currency: phase === "railway" ? "USD" : "TMT", ceiling, projected, warning: projected >= ceiling * .8 };
}

/** Asia/Shanghai is UTC+8 without daylight-saving transitions. Weekdays 08:00–20:00. */
export function inStaffedCoverage(at: Date): boolean {
  const day = at.getUTCDay();
  return day >= 1 && day <= 5 && at.getUTCHours() < 12;
}

export function staffedDeadline(start: Date, staffedHours: number): Date {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(staffedHours) || staffedHours < 0 || staffedHours > 8_760) {
    throw new Error("Invalid staffed deadline");
  }
  let remaining = staffedHours * 3_600_000;
  const cursor = new Date(start);
  while (remaining > 0) {
    if (!inStaffedCoverage(cursor)) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(0, 0, 0, 0);
      continue;
    }
    const close = new Date(cursor);
    close.setUTCHours(12, 0, 0, 0);
    const used = Math.min(remaining, close.getTime() - cursor.getTime());
    cursor.setTime(cursor.getTime() + used);
    remaining -= used;
  }
  return cursor;
}
