import { z } from "zod";

import { budgetProjection, staffedDeadline } from "./OperationsPolicy";

const receipt = { evidenceRef: z.string().regex(/^[A-Za-z0-9_./:-]{1,200}$/), verifiedAt: z.string().datetime() };
export const HostingReadinessPacketSchema = z.object({
  version: z.literal(1), candidateSha: z.string().regex(/^[a-f0-9]{40}$/),
  phase: z.enum(["railway-reviewer", "railway-diagnostics", "tm-real"]),
  runtime: z.object({ ...receipt, candidateSha: z.string().regex(/^[a-f0-9]{40}$/), currentConfigurationReconciled: z.boolean(),
    diagnosticsEnabled: z.boolean(), scorecardEnabled: z.boolean(), tmServingEnabled: z.boolean() }).strict().optional(),
  billing: z.object({ ...receipt, currency: z.enum(["USD", "TMT"]), projectedMonthly: z.number().nonnegative(), includesMonitoringStorageBackups: z.boolean() }).strict().optional(),
  recovery: z.object({ ...receipt, isolatedTarget: z.boolean(), declaredAt: z.string().datetime(), restoredAt: z.string().datetime(),
    databaseSnapshotAt: z.string().datetime(), mediaSnapshotAt: z.string().datetime(), databaseCheckpoint: z.string().min(1).max(100), mediaCheckpoint: z.string().min(1).max(100),
    checksumsVerified: z.boolean(), schemaVerified: z.boolean(), coreJourneysVerified: z.boolean(), telemetryExcludedFromCoreBackups: z.boolean(),
    replayedThrough: z.string().datetime(), trafficResumedAt: z.string().datetime(), liveDeletionFence: z.boolean(),
    erasedRecordsDenied: z.boolean(), retiredObjectsDenied: z.boolean(), collectorEpochRotated: z.boolean() }).strict().optional(),
  monitoring: z.object({ ...receipt, independentWorkerDeathMs: z.number().nonnegative(), independentCollectorOutageMs: z.number().nonnegative(),
    authorizedAlertReceipt: z.boolean(), isolationBurstPassed: z.boolean(), nativeReleaseSymbolicationVerified: z.boolean(), diskAndTlsVerified: z.boolean(),
    retentionDeletionAndRestoreVerified: z.boolean() }).strict().optional(),
  tm: z.object({ ...receipt, googlePlayApproved: z.boolean(), providerTopologyVerified: z.boolean(), storageBackupNetworkVerified: z.boolean(),
    trustedHandlerVerified: z.boolean(), dataPlacementEgressDisclosureVerified: z.boolean(), physicalSmsEquipmentVerified: z.boolean() }).strict().optional(),
}).strict();
export type HostingReadinessPacket = z.infer<typeof HostingReadinessPacketSchema>;

const labels = {
  runtime: { en: "Current candidate and runtime configuration", ru: "Текущая версия и конфигурация среды", tk: "Häzirki wersiýa we ulgam sazlamalary" },
  budget: { en: "Phase budget and actual projection", ru: "Бюджет этапа и фактический прогноз", tk: "Tapgyryň býujeti we hakyky çykdajy çaklamasy" },
  recovery: { en: "Consistent database and media recovery", ru: "Согласованное восстановление базы и медиа", tk: "Maglumatlar bazasynyň we media faýllarynyň sazlaşykly dikeldilmegi" },
  deletion: { en: "Deletion replay before restored data is served", ru: "Повторное удаление до открытия восстановленных данных", tk: "Dikeldilen maglumatlar açylmazdan öň pozmalaryň gaýtalanmagy" },
  monitoring: { en: "Independent monitoring and native evidence", ru: "Независимый мониторинг и нативные подтверждения", tk: "Garaşsyz gözegçilik we ýerli programma subutnamalary" },
  tm: { en: "TM cutover evidence", ru: "Подтверждения перехода в TM", tk: "TM geçiş subutnamalary" },
} as const;
type Criterion = { id: keyof typeof labels; label: typeof labels[keyof typeof labels]; state: "pass" | "missing" | "fail" | "not_applicable"; reasons: string[] };

/** Assesses supplied receipts. It never manufactures or independently authenticates provider/drill evidence. */
export function hostingReadiness(input: HostingReadinessPacket, now = new Date()) {
  const packet = HostingReadinessPacketSchema.parse(input);
  const criteria: Criterion[] = [];
  const fresh = (at: string, maxDays: number) => { const age = now.getTime() - Date.parse(at); return age >= 0 && age <= maxDays * 86_400_000; };
  const assess = (id: keyof typeof labels, exists: boolean, reasons: string[], applicable = true) => {
    criteria.push({ id, label: labels[id], state: !applicable ? "not_applicable" : !exists ? "missing" : reasons.length ? "fail" : "pass", reasons });
  };
  const runtime = packet.runtime, billing = packet.billing, recovery = packet.recovery, monitoring = packet.monitoring, tm = packet.tm;
  const reviewer = packet.phase === "railway-reviewer";
  assess("runtime", !!runtime, runtime ? [
    ...(!fresh(runtime.verifiedAt, 1) ? ["STALE_CONFIGURATION"] : []),
    ...(runtime.candidateSha !== packet.candidateSha ? ["CANDIDATE_MISMATCH"] : []),
    ...(!runtime.currentConfigurationReconciled ? ["CONFIGURATION_NOT_RECONCILED"] : []),
    ...(reviewer && (runtime.diagnosticsEnabled || runtime.scorecardEnabled || runtime.tmServingEnabled) ? ["REVIEWER_PHASE_ACTIVATION_VIOLATION"] : []),
    ...(packet.phase !== "tm-real" && runtime.tmServingEnabled ? ["TM_SERVING_OUTSIDE_PHASE"] : []),
  ] : []);
  let budget: ReturnType<typeof budgetProjection> | null = null;
  if (billing) budget = budgetProjection(packet.phase === "tm-real" ? "tm" : "railway", billing.projectedMonthly);
  assess("budget", !!billing, billing && budget ? [
    ...(!fresh(billing.verifiedAt, 7) ? ["STALE_BILLING"] : []),
    ...(billing.currency !== budget.currency ? ["BUDGET_CURRENCY_MISMATCH"] : []),
    ...(!billing.includesMonitoringStorageBackups ? ["INCOMPLETE_BUDGET_SCOPE"] : []),
    ...(billing.projectedMonthly > budget.ceiling ? ["PROJECTED_CEILING_EXCEEDED"] : []),
  ] : []);
  assess("recovery", !!recovery, recovery ? [
    ...(!fresh(recovery.verifiedAt, 30) ? ["STALE_RESTORE_DRILL"] : []),
    ...(Date.parse(recovery.verifiedAt) < Date.parse(recovery.trafficResumedAt) ? ["RESTORE_RECEIPT_PRECEDES_ACCEPTANCE"] : []),
    ...(!recovery.isolatedTarget ? ["RESTORE_TARGET_NOT_ISOLATED"] : []),
    ...(recovery.databaseCheckpoint !== recovery.mediaCheckpoint ? ["INCONSISTENT_RESTORE_CHECKPOINT"] : []),
    ...(!recovery.checksumsVerified || !recovery.schemaVerified || !recovery.coreJourneysVerified ? ["RESTORE_INTEGRITY_UNPROVEN"] : []),
    ...(!recovery.telemetryExcludedFromCoreBackups ? ["TELEMETRY_IN_CORE_BACKUPS"] : []),
    ...([recovery.databaseSnapshotAt, recovery.mediaSnapshotAt].some(at => {
      const loss = Date.parse(recovery.declaredAt) - Date.parse(at); return loss < 0 || loss > 86_400_000;
    }) ? ["DATA_LOSS_TARGET_EXCEEDED"] : []),
    ...(Date.parse(recovery.restoredAt) < Date.parse(recovery.declaredAt) || Date.parse(recovery.trafficResumedAt) < Date.parse(recovery.restoredAt)
      || Date.parse(recovery.trafficResumedAt) > staffedDeadline(new Date(recovery.declaredAt), 4).getTime() ? ["STAFFED_RECOVERY_TARGET_EXCEEDED"] : []),
  ] : []);
  assess("deletion", !!recovery, recovery ? [
    ...(!recovery.liveDeletionFence || !recovery.erasedRecordsDenied || !recovery.retiredObjectsDenied || (!reviewer && !recovery.collectorEpochRotated) ? ["RESTORE_DELETION_FENCE_UNPROVEN"] : []),
    ...(Date.parse(recovery.replayedThrough) < Date.parse(recovery.restoredAt) || Date.parse(recovery.replayedThrough) > Date.parse(recovery.trafficResumedAt) ? ["DELETION_REPLAY_ORDER_INVALID"] : []),
  ] : []);
  assess("monitoring", !!monitoring, monitoring ? [
    ...(!fresh(monitoring.verifiedAt, 30) ? ["STALE_MONITORING_DRILL"] : []),
    ...(monitoring.independentWorkerDeathMs > 60_000 || monitoring.independentCollectorOutageMs > 60_000 ? ["WATCHDOG_DETECTION_TARGET_EXCEEDED"] : []),
    ...(!monitoring.authorizedAlertReceipt || !monitoring.isolationBurstPassed || !monitoring.nativeReleaseSymbolicationVerified || !monitoring.diskAndTlsVerified
      || !monitoring.retentionDeletionAndRestoreVerified ? ["MONITORING_ACCEPTANCE_UNPROVEN"] : []),
  ] : [], !reviewer);
  assess("tm", !!tm, tm ? [
    ...(!fresh(tm.verifiedAt, 30) ? ["STALE_TM_EVIDENCE"] : []),
    ...(!tm.googlePlayApproved || !tm.providerTopologyVerified || !tm.storageBackupNetworkVerified || !tm.trustedHandlerVerified
      || !tm.dataPlacementEgressDisclosureVerified || !tm.physicalSmsEquipmentVerified ? ["TM_CUTOVER_UNPROVEN"] : []),
  ] : [], packet.phase === "tm-real");
  return { version: 1, generatedAt: now.toISOString(), candidateSha: packet.candidateSha, phase: packet.phase,
    evidenceComplete: criteria.every(item => item.state === "pass" || item.state === "not_applicable"), activationAuthorized: false as const, budget, criteria };
}
