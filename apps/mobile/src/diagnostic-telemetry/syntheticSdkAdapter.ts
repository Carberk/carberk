import type { DiagnosticTelemetrySchemas as D } from "@auto-tm/contracts";

import type { SyntheticDiagnosticCapture } from "./SyntheticDiagnosticCapture";

/** SDK-compatible JS callback bridge for explicit synthetic capture. The SDK
 * always receives null, so its own transport/cache never receives this event.
 * Native initialization and automatic collectors are disabled independently. */
export function syntheticSdkAdapter(capture: SyntheticDiagnosticCapture, current: () => { context: D.DiagnosticCaptureContext; generation: string } | null) {
 return {
  debug: false, sendDefaultPii: false, defaultIntegrations: false, integrations: [],
  enableNative: false, autoInitializeNativeSdk: false, enableNativeCrashHandling: false,
  enableNdk: false, enableNdkScopeSync: false, enableTombstone: false, enableHistoricalTombstoneReporting: false,
  enableNativeNagger: false, enableAutoSessionTracking: false, enableAppHangTracking: false,
  enableAutoPerformanceTracing: false, enableNativeFramesTracking: false,
  attachScreenshot: false, attachViewHierarchy: false, enableLogs: false,
  tracesSampleRate: 0, profilesSampleRate: 0, anrProfilingSampleRate: 0,
  replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0,
  beforeBreadcrumb: () => null, beforeSendTransaction: () => null, beforeSendLog: () => null,
  beforeSend: async (event: unknown): Promise<null> => {
   try {
    const admitted = current(); if (!admitted) return null;
    await capture.capture(event, admitted.context, admitted.generation);
   } catch { /* Diagnostic capture never becomes an application failure. */ }
   return null;
  },
 };
}
