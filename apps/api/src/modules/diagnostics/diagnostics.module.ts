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
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DIAGNOSTIC_INTAKE_PORT, DIAGNOSTIC_RUNTIME } from "./domain/ports/DiagnosticIntakePort";
import { DIAGNOSTIC_REPORTS_PORT } from "./domain/ports/DiagnosticReportsPort";
import { DiagnosticAuthority } from "./infrastructure/DiagnosticAuthority";
import { DiagnosticIntakeController } from "./presentation/DiagnosticIntakeController";
import { DiagnosticReportsController } from "./presentation/DiagnosticReportsController";
import { IdentityModule } from "../identity/identity.module";
import { PrismaDiagnosticIntake } from "./infrastructure/PrismaDiagnosticIntake";
import { PrismaDiagnosticReports } from "./infrastructure/PrismaDiagnosticReports";
import { PrismaModule } from "../../common/prisma.module";
import { diagnosticRuntime } from "./infrastructure/diagnosticRuntime";
@Module({ imports: [ConfigModule, PrismaModule, IdentityModule], controllers: [DiagnosticIntakeController, DiagnosticReportsController, DiagnosticPublicController], providers: [{ provide: DIAGNOSTIC_DOCUMENTS_PORT, useClass: PrismaDiagnosticDocuments }, { provide: DIAGNOSTIC_PUBLIC_PORT, useClass: PrismaDiagnosticPublic }, DiagnosticAuthority, DiagnosticReportAccess, DiagnosticBinaryParser,
  { provide: DIAGNOSTIC_OBJECTS, useClass: S3DiagnosticObjects },
  { provide: DIAGNOSTIC_EVIDENCE_PORT, useClass: PrismaDiagnosticEvidence },
  { provide: DIAGNOSTIC_REPORTS_PORT, useClass: PrismaDiagnosticReports },
  { provide: DIAGNOSTIC_INTAKE_PORT, useClass: PrismaDiagnosticIntake },
  { provide: DIAGNOSTIC_RUNTIME, inject: [ConfigService], useFactory: diagnosticRuntime },
], exports: [DIAGNOSTIC_INTAKE_PORT, DIAGNOSTIC_RUNTIME] })
export class DiagnosticsModule {}
