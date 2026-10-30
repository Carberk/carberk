import type { OperationsSchemas } from "@auto-tm/contracts";

const SECOND = 1_000, BUCKET = 10 * SECOND;
const BOUNDS = [25, 50, 100, 250, 500, 1_000, 2_000, 5_000, 10_000, 30_000, 120_000] as const;
interface CounterBucket { at: number; requests: number; errors: number; histogram: number[]; maxMs: number }

/** Fixed-size aggregate counters. The request path supplies only a status and duration, never a URL, actor or error. */
export class TechnicalCounters {
  private readonly buckets = new Map<number, CounterBucket>();
  private readonly startedAt: number;
  constructor(private readonly now: () => number = () => Date.now()) { this.startedAt = now(); }
  record(status: number, elapsedMs: number): void {
    if (!Number.isInteger(status) || status < 100 || status > 599 || !Number.isFinite(elapsedMs) || elapsedMs < 0) return;
    const at = Math.floor(this.now() / BUCKET) * BUCKET;
    this.prune(at);
    let bucket = this.buckets.get(at);
    if (!bucket) { bucket = { at, requests: 0, errors: 0, histogram: BOUNDS.map(() => 0), maxMs: 0 }; this.buckets.set(at, bucket); }
    bucket.requests++;
    bucket.maxMs = Math.max(bucket.maxMs, Math.ceil(elapsedMs / 1_000) * 1_000);
    if (status >= 500) bucket.errors++;
    const index = BOUNDS.findIndex(bound => elapsedMs <= bound);
    const selected = index === -1 ? BOUNDS.length - 1 : index;
    bucket.histogram[selected] = (bucket.histogram[selected] ?? 0) + 1;
  }
  private prune(at: number): void { for (const key of this.buckets.keys()) if (key < at - 600_000) this.buckets.delete(key); }
  snapshot(): OperationsSchemas.TechnicalSnapshot {
    const now = this.now(), end = Math.floor(now / BUCKET) * BUCKET;
    this.prune(end);
    const errors = { windowMs: 300_000 as const, requests: 0, technicalErrors: 0, rate: null as number | null };
    const latency = { windowMs: 600_000 as const, requests: 0, p95UpperMs: null as number | null };
    const histogram = BOUNDS.map(() => 0);
    let maxMs = 0;
    for (const bucket of this.buckets.values()) {
      if (bucket.at >= end) continue;
      if (bucket.at >= end - 300_000) { errors.requests += bucket.requests; errors.technicalErrors += bucket.errors; }
      if (bucket.at >= end - 600_000) {
        latency.requests += bucket.requests;
        maxMs = Math.max(maxMs, bucket.maxMs);
        bucket.histogram.forEach((count, index) => { histogram[index] = (histogram[index] ?? 0) + count; });
      }
    }
    if (this.startedAt <= end - 300_000 && errors.requests >= 100) errors.rate = errors.technicalErrors / errors.requests;
    if (this.startedAt <= end - 600_000 && latency.requests >= 100) {
      const rank = Math.ceil(latency.requests * .95);
      let cumulative = 0;
      for (let index = 0; index < histogram.length; index++) {
        cumulative += histogram[index] ?? 0;
        if (cumulative >= rank) { latency.p95UpperMs = index === BOUNDS.length - 1 ? Math.max(120_000, maxMs) : BOUNDS[index] ?? 120_000; break; }
      }
    }
    return { version: 1, observedAt: new Date(now).toISOString(), errors, latency };
  }
}
