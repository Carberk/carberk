type MeasurementFailurePhase = "ledger_deadline" | "ledger_rejected" | "transaction_start" | "epoch_lock" | "principal_lock" | "visit_read" | "conversion_check" | "record_insert" | "transaction_commit";

/** Diagnostic-only: never forward SQL, messages, metadata, event fields or actor identifiers. */
export function reportMeasurementUnavailable(phase: MeasurementFailurePhase, error?: unknown): void {
 try {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const prismaCode = typeof code === "string" && /^P[0-9]{4}$/.test(code) ? code : "unknown";
  console.warn("[measurement-unavailable]", { phase, prismaCode });
 } catch { /* Diagnostics must not change collector receipts or the original database error. */ }
}
