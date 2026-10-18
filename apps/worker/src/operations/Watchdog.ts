import type { OperationsSchemas } from "@auto-tm/contracts";

import type { DiskObservation, TlsObservation } from "./hostProbes";
import { advanceIncident, type OperationalIncident } from "./OperationsPolicy";

export type ProbeState = "healthy" | "failing" | "unknown";
export interface OperationsSnapshot {
  version: 1;
  observedAt: string;
  api: ProbeState;
  collector: ProbeState;
  worker: ProbeState;
  technical?: OperationsSchemas.TechnicalSnapshot | null;
  disk?: DiskObservation;
  tls?: TlsObservation;
  queues: { name: string; waiting: number | null; sustainedBacklog: boolean }[];
  incident: OperationalIncident | null;
}

export interface WatchdogPorts {
  heartbeat(): Promise<string | null>;
  http(target: "api" | "collector"): Promise<ProbeState>;
  queueDepths(): Promise<{ name: string; waiting: number }[]>;
  publish(snapshot: OperationsSnapshot): Promise<void>;
  restoreIncident?(): Promise<OperationalIncident | null>;
  technical?(): Promise<OperationsSchemas.TechnicalSnapshot | null>;
  disk?(): Promise<DiskObservation>;
  tls?(): Promise<TlsObservation>;
}

/** Runs outside the worker. Only bounded counts and fixed probe names leave this process. */
export class Watchdog {
  private backlogSince = new Map<string, number>();
  private incident: OperationalIncident | null = null;
  private restored = false;
  private lastCheckAt: number | null = null;
  constructor(private readonly ports: WatchdogPorts) {}

  async check(now: Date): Promise<OperationsSnapshot> {
    if (!this.restored) {
      // Do not publish a replacement incident until persisted state has been read successfully.
      this.incident = await (this.ports.restoreIncident?.() ?? Promise.resolve(null));
      this.restored = true;
    }
    if (this.lastCheckAt !== null && now.getTime() - this.lastCheckAt > 60_000) this.backlogSince.clear();
    this.lastCheckAt = now.getTime();
    const [heartbeat, api, collector, depths, measured, diskResult, tlsResult] = await Promise.allSettled([
      this.ports.heartbeat(), this.ports.http("api"), this.ports.http("collector"), this.ports.queueDepths(),
      this.ports.technical?.() ?? Promise.resolve(null),
      this.ports.disk?.() ?? Promise.resolve({ state: "unknown" as const, freeRatio: null }),
      this.ports.tls?.() ?? Promise.resolve({ state: "unknown" as const, expiresAt: null }),
    ]);
    const heartbeatAt = heartbeat.status === "fulfilled" && heartbeat.value !== null ? Number(heartbeat.value) : NaN;
    const age = now.getTime() - heartbeatAt;
    const worker: ProbeState = heartbeat.status === "rejected" ? "unknown"
      : Number.isFinite(heartbeatAt) && age >= 0 && age <= 45_000 ? "healthy" : "failing";
    const queues = depths.status === "fulfilled" ? depths.value.map(({ name, waiting }) => {
      if (waiting > 100) {
        if (!this.backlogSince.has(name)) this.backlogSince.set(name, now.getTime());
      } else this.backlogSince.delete(name);
      const since = this.backlogSince.get(name);
      return { name, waiting, sustainedBacklog: since !== undefined && now.getTime() - since >= 600_000 };
    }) : [];
    // An observation gap cannot prove ten continuous minutes of backlog.
    if (depths.status === "rejected") this.backlogSince.clear();
    const apiState = api.status === "fulfilled" ? api.value : "unknown";
    const collectorState = collector.status === "fulfilled" ? collector.value : "unknown";
    const sample = measured.status === "fulfilled" ? measured.value : null;
    const metricAge = sample ? now.getTime() - Date.parse(sample.observedAt) : NaN;
    const technical = sample && metricAge >= -5_000 && metricAge <= 45_000 ? sample : null;
    const metricFailure = (technical?.errors.rate !== null && technical?.errors.rate !== undefined && technical.errors.rate > .05)
      || (technical?.latency.p95UpperMs !== null && technical?.latency.p95UpperMs !== undefined && technical.latency.p95UpperMs > 2_000);
    const disk: DiskObservation = diskResult.status === "fulfilled" ? diskResult.value : { state: "unknown", freeRatio: null };
    const tls: TlsObservation = tlsResult.status === "fulfilled" ? tlsResult.value : { state: "unknown", expiresAt: null };
    const failing = disk.state === "failing" || tls.state === "failing" || metricFailure || apiState === "failing" || collectorState === "failing" || worker === "failing" || queues.some(q => q.sustainedBacklog);
    const allKnown = apiState !== "unknown" && collectorState !== "unknown" && worker !== "unknown" && depths.status === "fulfilled"
      && (!this.ports.disk || disk.state !== "unknown") && (!this.ports.tls || tls.state !== "unknown")
      && (!this.ports.technical || (technical !== null && technical.errors.rate !== null && technical.latency.p95UpperMs !== null));
    if (failing || allKnown) this.incident = advanceIncident(this.incident, failing, now);
    const snapshot: OperationsSnapshot = { version: 1, observedAt: now.toISOString(), api: apiState, collector: collectorState, worker, technical, disk, tls, queues, incident: this.incident };
    await this.ports.publish(snapshot);
    return snapshot;
  }
}
