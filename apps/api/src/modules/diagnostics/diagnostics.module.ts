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
@Module({ imports: [ConfigModule, PrismaModule, IdentityModule], controllers: [DiagnosticIntakeController, DiagnosticReportsController], providers: [DiagnosticAuthority,
  { provide: DIAGNOSTIC_REPORTS_PORT, useClass: PrismaDiagnosticReports },
  { provide: DIAGNOSTIC_INTAKE_PORT, useClass: PrismaDiagnosticIntake },
  { provide: DIAGNOSTIC_RUNTIME, inject: [ConfigService], useFactory: diagnosticRuntime },
], exports: [DIAGNOSTIC_INTAKE_PORT, DIAGNOSTIC_RUNTIME] })
export class DiagnosticsModule {}
