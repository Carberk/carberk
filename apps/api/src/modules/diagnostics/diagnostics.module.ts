import { Module } from "@nestjs/common";
import { DiagnosticIntakeController } from "./presentation/DiagnosticIntakeController";
@Module({ controllers: [DiagnosticIntakeController] })
export class DiagnosticsModule {}
