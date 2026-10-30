import type { DiagnosticSchemas as D } from "@auto-tm/contracts";

export const DIAGNOSTIC_PUBLIC_PORT = "DIAGNOSTIC_PUBLIC_PORT";
export interface DiagnosticPublicPort {
  availability(listingId: string): Promise<D.PublicDiagnosticAvailability>;
  batch(listingIds: string[]): Promise<D.PublicDiagnosticAvailability[]>;
  read(reportId: string): Promise<D.PublicDiagnosticReport>;
  evidence(reportId: string, evidenceId: string): Promise<{ bytes: Uint8Array; mime: string }>;
}
