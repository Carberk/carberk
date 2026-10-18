import type { OperationalSmtpConfig } from "./OperationsConfig";
import type { OperationsSnapshot } from "./Watchdog";

interface Receipts { read(): Promise<string | null>; save(value: string): Promise<void> }
interface SmtpBoundary { host: string; port: number; servername: string; ca?: Buffer; timeoutMs: number }

/** Closed transport checkpoint. Protocol delivery is deliberately pending the boundary regressions. */
export class SmtpAlertSink {
  constructor(_config: OperationalSmtpConfig, _receipts: Receipts, _boundary?: SmtpBoundary) {}
  async publish(_snapshot: OperationsSnapshot, _now = Date.now()): Promise<boolean> { return false; }
}
