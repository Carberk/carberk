import type { MeasurementRetentionLedger } from "../../measurementRetention";
export class FakeMeasurementRetentionLedger implements MeasurementRetentionLedger {
 readonly rows: Date[] = []; unavailable = false;
 async deleteExpired(now: Date, limit: number): Promise<number> {
  if (this.unavailable) throw new Error("SQL contains private field");
  let count = 0;
  for (let index = this.rows.length - 1; index >= 0 && count < limit; index--) if ((this.rows[index]?.getTime() ?? Infinity) <= now.getTime()) { this.rows.splice(index, 1); count++; }
  return count;
 }
 async oldestExpired(now: Date): Promise<Date | null> {
  return this.rows.filter((row) => row <= now).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
 }
}
