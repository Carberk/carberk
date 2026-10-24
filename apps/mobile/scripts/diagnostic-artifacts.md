# Offline diagnostic build artifacts

`pnpm --filter @auto-tm/mobile diagnostics:artifacts prepare /private/expected.json /private/build-metadata.json /private/new-archive`

`pnpm --filter @auto-tm/mobile diagnostics:artifacts verify /private/expected.json /private/new-archive`

These commands only read supplied files, hash them and retain private copies. They never build, discover a candidate from app.config/EAS defaults, upload, contact a collector or inspect signing/Play state. No current build outputs are supplied by this repository. Never substitute a source directory or an intermediate packager map for the actual final outputs.

The release operator supplies two independent inputs. `expected.json` is the exact intended candidate identity. `build-metadata.json` is the exported identity and file/digest association from the actual completed build. Reconcile its values with the actual build/export records before using it. This helper verifies those declarations and file bytes; it cannot authenticate the exporter or extract identity from an APK/AAB/IPA, Hermes binary, ELF or Mach-O binary. A hand-authored declaration alone does not establish build provenance.

`expected.json` has this shape. All values below are examples, not release facts:

```json
{
  "candidateSha": "0000000000000000000000000000000000000000",
  "appId": "example.fixture",
  "platform": "android",
  "buildNumber": "42",
  "release": "fixture@1.0",
  "dist": "42",
  "bundle": {
    "kind": "hermes",
    "id": "exported-final-bundle-identity",
    "runtimeVersion": "exported-runtime-version",
    "updateId": null
  }
}
```

Use `javascript` or `hermes` for bundle kind. Use the exported bundle identity and runtime version when they exist, and the actual update ID if an update is part of this candidate. Explicit `null` for ID/runtime version means the build exports no such identity; the required final bundle digest still binds its bytes. Explicit `null` for update ID means no update applies. A supplied update ID requires its exported runtime version. No update channel or OTA delivery is introduced. Build number and dist are required strings and must match the export exactly; neither is inferred from the display version. The candidate SHA must be a full lowercase Git SHA.

`build-metadata.json` contains exactly `schemaVersion: 1`, `identity` equal to that expected object, `files` and `nativeAssociations`. Every `files` entry contains exactly `path` and lowercase `sha256`. Relative paths resolve against this metadata file. Every path must identify a nonempty regular file, with a distinct real path per role. Symlink leaf inputs and directories are refused. Digests are verified before retention and again on retained copies.

Required file roles are `artifact` for the completed APK/AAB/IPA or other final distributable file, `jsBundle` for its actual final JS/Hermes bundle and `finalSourceMap` for the matching final map. For Hermes this must be the final composed map, not just the Metro packager map. Android additionally requires `r8Mapping` because the current app configuration enables R8. iOS rejects that role. The helper checks bytes and metadata association, not map composition or bundle contents.

Optional native files use `symbols0`, `symbols1`, etc. Supply exported regular symbol files or an exported symbol archive, never a directory. For iOS supply the dSYM DWARF file or exported dSYM archive and the UUID association from the matching binary/dSYM export. Each supplied symbol file requires exactly one `nativeAssociations` entry:

```json
{
  "file": "symbols0",
  "idKind": "elf-build-id",
  "arch": "arm64-v8a",
  "binaryId": "actual-exported-binary-id",
  "symbolId": "actual-exported-symbol-id"
}
```

Android accepts `elf-build-id` or `debug-id`; iOS accepts `macho-uuid`. IDs and architecture must be present and IDs must compare exactly, using the exporter’s same canonical spelling. This verifies only declared matching exported IDs and digested symbol bytes. It does not parse binaries, validate ID syntax/completeness of ABI coverage or prove collector support. A multi-architecture symbol archive can be supplied under separate roles per exported architecture. If exports do not establish an association, omit the native files and use an explicit empty array. The resulting status is `unsupported-incomplete`. With matching exported IDs it is `exported-metadata-only-incomplete`. Neither is native acceptance or symbolication PASS.

The new archive directory must have an existing parent and be outside the mobile tree, including through parent symlinks. Use an operator-controlled private build-artifact location outside public/static roots. The directory is created exclusively with mode 0700 and copies/metadata/manifest use 0600. Existing destinations are never overwritten. A failure removes only the newly created partial archive. Retained roles have fixed local filenames; original paths remain only in the protected metadata copy. `verify` requires the expected identity again, compares the complete manifest against retained metadata, checks private archive/file permissions and rehashes retained bytes. It does not read original source paths. These hashes detect mismatch/corruption, not malicious replacement of both metadata and files, and are not a signature or provenance attestation.

Run preparation after the actual build has completed and before another local/EAS cleanup replaces its matching outputs. `local-android-release.mjs` removes generated maps and APKs before rebuilding and may regenerate the entire Android tree. Its behavior is unchanged. The archive restriction and independent copies preserve the previous associated outputs through that cleanup. Do not put retained maps/symbols or source paths in runtime/public config or version control. The release owner controls restricted retention and eventual deletion under spec81; this helper adds no indefinite-retention policy.

Offline fixtures: `pnpm --filter @auto-tm/mobile test:diagnostic-artifacts`. These use dummy bytes and never invoke a build or device. Full native qualification still requires the prewrite-safe adapter/cache, receiver contract, exact binary association inspection and controlled readable symbolication against the actual qualified collector.
