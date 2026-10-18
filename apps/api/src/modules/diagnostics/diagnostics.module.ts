import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "../../common/prisma.module";
import { IdentityModule } from "../identity/identity.module";
import { DIAGNOSTIC_INTAKE_PORT, DIAGNOSTIC_RUNTIME } from "./domain/ports/DiagnosticIntakePort";
import { PrismaDiagnosticIntake } from "./infrastructure/PrismaDiagnosticIntake";
import { diagnosticRuntime } from "./infrastructure/diagnosticRuntime";
import { DiagnosticIntakeController } from "./presentation/DiagnosticIntakeController";
@Module({ imports: [ConfigModule, PrismaModule, IdentityModule], controllers: [DiagnosticIntakeController], providers: [
  { provide: DIAGNOSTIC_INTAKE_PORT, useClass: PrismaDiagnosticIntake },
  { provide: DIAGNOSTIC_RUNTIME, inject: [ConfigService], useFactory: diagnosticRuntime },
], exports: [DIAGNOSTIC_INTAKE_PORT, DIAGNOSTIC_RUNTIME] })
export class DiagnosticsModule {}
