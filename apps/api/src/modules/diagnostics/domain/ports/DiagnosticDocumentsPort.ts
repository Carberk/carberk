import type { DiagnosticSchemas as D } from "@auto-tm/contracts";

import type { DiagnosticSubject } from "./DiagnosticIntakePort";

export const DIAGNOSTIC_DOCUMENTS_PORT = "DIAGNOSTIC_DOCUMENTS_PORT";
/** A null subject is exclusively the audience-checked public reader. */
export interface DiagnosticDocumentsPort {
  list(subject: DiagnosticSubject | null, reportId: string): Promise<D.DiagnosticDocument[]>;
  download(subject: DiagnosticSubject | null, reportId: string, locale: "tk" | "ru" | "en"): Promise<Uint8Array>;
}
