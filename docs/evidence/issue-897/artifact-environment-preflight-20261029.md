# Artifact and environment preflight, 29 October 2026

This is preparation evidence only. It does not establish a built artifact, deployed acceptance, signing acceptance or release readiness.

The read-only EAS configuration command completed for both Android profiles:

```text
eas config --platform android --profile staging --json --non-interactive
eas config --platform android --profile production --json --non-interactive
```

The resolved non-secret mapping is:

| Candidate | EAS environment | Distribution | Android output | Package | App version | Runtime toolchain |
|---|---|---|---|---|---|---|
| staging | `preview` | `internal` | APK | `tm.auto.app` | `2.0.4` | Node `22.23.2`, pnpm `12.11.2` |
| production | `production` | `store` | AAB | `com.auto_tm.ynamly` | `2.0.4` | Node `22.23.2`, pnpm `12.11.2` |

The profiles resolve to the existing Carberk app and EAS project owned by `tkmdevelopers`. Staging uses the existing staging web origin and production uses the existing production web origin. The command output reported the expected public API/media/WebSocket environment names without recording values or secrets. No EAS build, signing change, upload, store action or device session ran.

The eventual candidate record must fill these fields from the actual resulting files and deployed reads:

- source commit and tree, EAS build ID, profile, app version and Android version code;
- APK/AAB SHA-256, install/package inspection and signing certificate mapping;
- API, media, WebSocket and web origins read from the selected environment;
- migration/runtime readiness, protected configuration and guard fingerprints;
- emulator/install checks and founder-owned physical checks;
- deployed acceptance, restoration and final merge SHA.

The production managed upload certificate remains the existing EAS credential. Its fingerprint is retained in the private release record and is not re-exported or changed during this preflight.

