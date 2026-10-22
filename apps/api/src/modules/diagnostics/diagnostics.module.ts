import { DIAGNOSTIC_DOCUMENTS_PORT } from "./domain/ports/DiagnosticDocumentsPort";
import { DIAGNOSTIC_PUBLIC_PORT } from "./domain/ports/DiagnosticPublicPort";
import { PrismaDiagnosticDocuments } from "./infrastructure/PrismaDiagnosticDocuments";
import { PrismaDiagnosticPublic } from "./infrastructure/PrismaDiagnosticPublic";
import { DiagnosticPublicController } from "./presentation/DiagnosticPublicController";
import { DIAGNOSTIC_OBJECTS } from "./domain/ports/DiagnosticObjects";
import { DIAGNOSTIC_EVIDENCE_PORT } from "./domain/ports/DiagnosticEvidencePort";
import { DiagnosticReportAccess } from "./infrastructure/DiagnosticReportAccess";
import { PrismaDiagnosticEvidence } from "./infrastructure/PrismaDiagnosticEvidence";
import { S3DiagnosticObjects } from "./infrastructure/S3DiagnosticObjects";
import { DiagnosticBinaryParser } from "./presentation/DiagnosticBinaryParser";
import { DIAGNOSTIC_IDENTITY_EVIDENCE_PORT } from "./domain/ports/DiagnosticIdentityEvidencePort";
import { PrismaDiagnosticIdentityEvidence } from "./infrastructure/PrismaDiagnosticIdentityEvidence";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DIAGNOSTIC_INTAKE_PORT, DIAGNOSTIC_RUNTIME } from "./domain/ports/DiagnosticIntakePort";
import { DIAGNOSTIC_REPORTS_PORT } from "./domain/ports/DiagnosticReportsPort";
import { DiagnosticAuthority } from "./infrastructure/DiagnosticAuthority";
import { CampaignDiagnosticAdmission } from "./infrastructure/campaignDiagnosticAdmission";
import { DiagnosticIntakeController } from "./presentation/DiagnosticIntakeController";
import { DiagnosticReportsController } from "./presentation/DiagnosticReportsController";
import { IdentityModule } from "../identity/identity.module";
import { PrismaDiagnosticIntake } from "./infrastructure/PrismaDiagnosticIntake";
import { PrismaDiagnosticReports } from "./infrastructure/PrismaDiagnosticReports";
import { PrismaModule } from "../../common/prisma.module";
import { diagnosticRuntime } from "./infrastructure/diagnosticRuntime";
import { DIAGNOSTIC_CONTINUITY_PROOFS_PORT, type DiagnosticContinuityProofsPort } from "./application/ports/DiagnosticContinuityProofsPort";
import { PrismaDiagnosticContinuityProofs } from "./infrastructure/PrismaDiagnosticContinuityProofs";
import { IssueDiagnosticContinuityProof } from "./application/IssueDiagnosticContinuityProof";
import { ReadDiagnosticContinuityProof } from "./application/ReadDiagnosticContinuityProof";
import { ConsumeDiagnosticContinuityProof } from "./application/ConsumeDiagnosticContinuityProof";
@Module({ imports: [ConfigModule, PrismaModule, IdentityModule], controllers: [DiagnosticIntakeController, DiagnosticReportsController, DiagnosticPublicController], providers: [{ provide: DIAGNOSTIC_DOCUMENTS_PORT, useClass: PrismaDiagnosticDocuments }, { provide: DIAGNOSTIC_PUBLIC_PORT, useClass: PrismaDiagnosticPublic }, DiagnosticAuthority, CampaignDiagnosticAdmission, DiagnosticReportAccess, DiagnosticBinaryParser, PrismaDiagnosticContinuityProofs,
  { provide: DIAGNOSTIC_CONTINUITY_PROOFS_PORT, useExisting: PrismaDiagnosticContinuityProofs },
  { provide: IssueDiagnosticContinuityProof, inject: [DIAGNOSTIC_CONTINUITY_PROOFS_PORT], useFactory: (proofs: DiagnosticContinuityProofsPort) => new IssueDiagnosticContinuityProof(proofs) },
  { provide: ReadDiagnosticContinuityProof, inject: [DIAGNOSTIC_CONTINUITY_PROOFS_PORT], useFactory: (proofs: DiagnosticContinuityProofsPort) => new ReadDiagnosticContinuityProof(proofs) },
  { provide: ConsumeDiagnosticContinuityProof, inject: [DIAGNOSTIC_CONTINUITY_PROOFS_PORT], useFactory: (proofs: DiagnosticContinuityProofsPort) => new ConsumeDiagnosticContinuityProof(proofs) },
  { provide: DIAGNOSTIC_OBJECTS, useClass: S3DiagnosticObjects },
  { provide: DIAGNOSTIC_EVIDENCE_PORT, useClass: PrismaDiagnosticEvidence },
  PrismaDiagnosticIdentityEvidence, { provide: DIAGNOSTIC_IDENTITY_EVIDENCE_PORT, useExisting: PrismaDiagnosticIdentityEvidence },
  PrismaDiagnosticReports, { provide: DIAGNOSTIC_REPORTS_PORT, useExisting: PrismaDiagnosticReports },
  { provide: DIAGNOSTIC_INTAKE_PORT, useClass: PrismaDiagnosticIntake },
  { provide: DIAGNOSTIC_RUNTIME, inject: [ConfigService], useFactory: diagnosticRuntime },
], exports: [DIAGNOSTIC_INTAKE_PORT, DIAGNOSTIC_RUNTIME] })
export class DiagnosticsModule {}
