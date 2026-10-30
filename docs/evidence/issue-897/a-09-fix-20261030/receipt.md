# A-09 bounded Standards fix receipt

Date: 2026-10-30

This is the one bounded Milestone A review-fix round for accepted Standards finding S1. The source/test checkpoint is `f55d11c414cbb1a9a79e1a025b0d955e7e473fe8`. It is based on coordinator HEAD `4002ce9fc7248ab172bce9ef7c42a24814646a99`, with the requested immutable source base `6a902544f6135273b19c6bc46e37813034fe68fa` and reviewed source state `69948805f6f41f199634300ba2fbaf8c38630be1` preserved.

The three modules now accept narrow composition dependencies: `idGenerator` for DiagnosticIdentity and DiagnosticContinuity, and `now` for UploadRightsForm. Identity stage/capture inputs and consume commands keep their first generated value in the existing frozen refs, so retries resend the exact command. Rights validation keeps the prior `expiry <= currentTime` rejection, including equal-time expiry.

## RED first

The tests were added before the production change and run at test checkpoint `91c00cfd9281570ad66cfbdaff5e5a11108ac95e`. The reproduction failed for the intended reasons: the supplied identity and consume generators were ignored, and equal-time expiry was accepted. The full captured output is [red-first.log](red-first.log), also retained at `/tmp/issue-897-a09/red-final.txt`.

## Verification

All commands ran from `/Users/bagtyyar/.t3/worktrees/carberk/t3-3cd4f072`. Each command below records immutable worker HEAD `f55d11c414cbb1a9a79e1a025b0d955e7e473fe8` in the companion JSON receipt.

| Check | Exact command | Exit |
|---|---|---:|
| Consumer package build prerequisite | `pnpm --filter @auto-tm/contracts build` | 0 |
| Focused rendered/network tests | `pnpm --filter @auto-tm/admin exec vitest run --reporter=dot src/app/diagnostics/DiagnosticContinuity.transport.spec.tsx src/app/diagnostics/DiagnosticWorkspace.spec.tsx src/app/diagnostics/DiagnosticWorkspace.transport.spec.tsx src/app/diagnostics/identity-transport.spec.ts src/app/diagnostics/identity-files.transport.spec.ts src/app/diagnostics/request-recovery.transport.spec.ts 'src/app/(admin)/services/ServiceWorkspace.recovery.spec.tsx' 'src/app/(admin)/services/ServiceWorkspace.spec.tsx' 'src/app/(admin)/services/ServiceWorkspace.transport.spec.tsx'` | 0 |
| TS7 | `pnpm --filter @auto-tm/admin typecheck` | 0 |
| TS6 | `pnpm --filter @auto-tm/admin exec tsc6 --noEmit` | 0 |
| ESLint | `pnpm --filter @auto-tm/admin lint` | 0 |
| Build, admin session runtime, standalone assets | `pnpm --filter @auto-tm/admin verify:runtime` | 0 |

The focused suite reports 9 files and 334 tests passed. The added rendered tests exercise real action/network boundaries for failed stage and append retries, failed consume execution retry, and expiry just before, at, and one millisecond after the supplied current time. The build/runtime log is [build-runtime-checkpoint.log](build-runtime-checkpoint.log); the focused log is [focused-checkpoint.log](focused-checkpoint.log).

## Diff/path audit

Relative to coordinator HEAD `4002ce9fc7248ab172bce9ef7c42a24814646a99`, the source/test diff contains exactly these allowed paths:

- `apps/admin/src/app/diagnostics/DiagnosticIdentity.tsx`
- `apps/admin/src/app/diagnostics/DiagnosticContinuity.tsx`
- `apps/admin/src/app/(admin)/services/UploadRightsForm.tsx`
- `apps/admin/src/app/diagnostics/DiagnosticContinuity.transport.spec.tsx`
- `apps/admin/src/app/(admin)/services/ServiceWorkspace.recovery.spec.tsx`

Only this evidence directory is added for the receipt. No other source, configuration, reset, deployment, native, artifact, prototype, analytics or collection path changed. `git diff --check` is clean.

No final review PASS is claimed. This handoff returns the checkpoint SHA and evidence to the parent assembler for its required disposition.
