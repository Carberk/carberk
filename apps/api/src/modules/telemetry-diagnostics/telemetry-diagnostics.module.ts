import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { STAFF_AUTHORITY_PORT, type StaffAuthorityPort } from "../identity/identity.public";
import { SyntheticDiagnosticRelay } from "./application/SyntheticDiagnosticRelay";
import { GlitchTipDiagnosticTransport } from "./infrastructure/GlitchTipDiagnosticTransport";
import { diagnosticTelemetryConfig } from "./infrastructure/diagnosticTelemetryConfig";
import { TelemetryDiagnosticsController } from "./presentation/TelemetryDiagnosticsController";

@Module({ imports: [IdentityModule], controllers: [TelemetryDiagnosticsController], providers: [
 { provide: SyntheticDiagnosticRelay, inject: [STAFF_AUTHORITY_PORT], useFactory: (authority: StaffAuthorityPort) => {
  const config = diagnosticTelemetryConfig(process.env);
  const transport = config.enabled && config.endpoint && config.publicKey ? new GlitchTipDiagnosticTransport(config.endpoint, config.publicKey) : { send: async () => false };
  return new SyntheticDiagnosticRelay(config, async subject => { await authority.authorize({ ...subject, capability: "analytics.investigate" }); }, transport);
 } },
] })
export class TelemetryDiagnosticsModule {}
