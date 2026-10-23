import type { DiagnosticSchemas } from "@auto-tm/contracts";

export const DIAGNOSTIC_INTAKE_PORT = "DIAGNOSTIC_INTAKE_PORT";
export const DIAGNOSTIC_RUNTIME = "DIAGNOSTIC_RUNTIME";
export interface DiagnosticSubject { userId: string; sessionId: string }
export interface DiagnosticRuntime { now(): Date; id(): string; syntheticAllowed(subject: DiagnosticSubject): boolean; publicSyntheticAllowed?(): boolean }
export interface DiagnosticIntakePort {
  grantOwnership(subject: DiagnosticSubject, id: string, input: DiagnosticSchemas.DiagnosticOwnershipGrant): Promise<{ id: string }>;
  revokeOwnership(subject: DiagnosticSubject, id: string, grantId: string): Promise<{ id: string }>;
  assigned(subject: DiagnosticSubject): Promise<DiagnosticSchemas.DiagnosticOrder[]>;
  workspace(subject: DiagnosticSubject, id: string): Promise<DiagnosticSchemas.DiagnosticWorkspace>;
  create(subject: DiagnosticSubject, input: DiagnosticSchemas.DiagnosticCreate): Promise<DiagnosticSchemas.DiagnosticOrder>;
  read(subject: DiagnosticSubject, id: string): Promise<DiagnosticSchemas.DiagnosticOrder>;
  mine(subject: DiagnosticSubject): Promise<DiagnosticSchemas.DiagnosticOrder[]>;
  queue(subject: DiagnosticSubject, centerId: string): Promise<DiagnosticSchemas.DiagnosticOrder[]>;
  templates(subject: DiagnosticSubject, centerId: string): Promise<DiagnosticSchemas.DiagnosticTemplate[]>;
  publishTemplate(subject: DiagnosticSubject, centerId: string, input: DiagnosticSchemas.PublishDiagnosticTemplate): Promise<DiagnosticSchemas.DiagnosticTemplate>;
  authorize(subject: DiagnosticSubject, id: string, input: DiagnosticSchemas.DiagnosticAuthorization): Promise<DiagnosticSchemas.DiagnosticOrder>;
  appointment(subject: DiagnosticSubject, id: string, input: DiagnosticSchemas.DiagnosticAppointmentChange): Promise<DiagnosticSchemas.DiagnosticOrder>;
  assign(subject: DiagnosticSubject, id: string, input: DiagnosticSchemas.DiagnosticAssignmentChange): Promise<DiagnosticSchemas.DiagnosticOrder>;
  observeVehicle(subject: DiagnosticSubject, id: string, input: DiagnosticSchemas.DiagnosticVehicleObservationRequest): Promise<DiagnosticSchemas.DiagnosticOrder>;
  identityRecords(subject: DiagnosticSubject, id: string): Promise<DiagnosticSchemas.DiagnosticIdentityRecord[]>;
}
