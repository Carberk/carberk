# Issue #945 implementation handoff

Source commit `63766f9a3ad4b10562f19c874323e1b89e2ff1fc`, tree `2ee8e9ee3940eb9b3678c3aa33a6ec6bfe804e98`, is pushed to `agent/issue-945-diagnostic-postgres-port-seam`. The red checkpoint is `785aaef5da83ec69ae12d03f0f119337001ddae0`. The terminal handoff supplies the evidence commit SHA because a committed packet cannot include its own commit hash.

The only source changes are the diagnostic fixture and one focused helper boundary test. An unset `DIAGNOSTIC_EXPECTED_POSTGRES_PORT` keeps `61169`. Explicit values must be decimal integers from 1 through 65535, without signs, whitespace, leading zeroes, fractions or exponents. An invalid override returns `undefined`; fixture initialization rejects it through `938_fixture_dependency:expected_postgres_port` before connecting. The configured worker URL must match that independently validated port. The seam never derives its expected value from a URL.

Hostname, database-name, Redis DB1, MinIO and worker allocation checks are preserved. `VITEST_POOL_ID=1` remains a prerequisite for #944. No #944 runtime or resource operation ran.

## Identity and preservation

- Coordinator base `39c63fad462885846840149b15771654980bdaa7`, tree `ea4f2d4b3b397a0e6cfd1e72064b5e0421b4e35d`, was clean before edits.
- Reviewed source `5b60645bae20e416781cda66b98123635f209341`, tree `5621d4bb2bbd47967132812d68ae5beb9f7172f6`, matches all 3,126 non-documentation entries in the coordinator base.
- Coordinator dispatch comment records `codex_work/gpt-6.1-sol`, `xhigh`, service tier `default`, full access. See `identity-base-settings.json` and the full issue body/comments in `provenance/issue945-full-read.stdout`.
- The exact inverse audit restores the reviewed helper bytes. All 2,802 prior documentation files, including 2,346 prior evidence files, remain unchanged.
- Production, configuration, dependencies, migrations, workflows, pre-existing selectors and assertions remain unchanged. No original case ID or acceptance accounting changed.

## One-ID map

`issue945-one-id-map.json` maps I945 to the default, explicit override, rejection cases, preserved checks, and verification. Ten focused test instances passed. This does not add campaign case IDs or claim F16/F17 acceptance.

## Verification

The six commands below ran one at a time from the corrected test input and exited 0. `checks/final/offline-command-receipts.json` contains exact argv, environment overrides, UTC intervals, durations, raw byte counts and SHA-256 hashes. `artifact-sha256.json` and `SHA256SUMS` cover the evidence files. Eight streams with trailing blank lines are stored losslessly as `.base64` files so the final diff passes whitespace checks. `raw-stream-encoding.json` maps logical receipt paths to those files and records both stored and decoded hashes. All raw hashes in command receipts refer to decoded bytes.

| Check | UTC start | UTC end | Exit |
|---|---|---|---:|
| `focused-boundary-green` | 2026-11-03T22:13:21.142649+00:00 | 2026-11-03T22:13:22.748452+00:00 | 0 |
| `api-typecheck` | 2026-11-03T22:13:22.769782+00:00 | 2026-11-03T22:13:25.318077+00:00 | 0 |
| `api-tsc6` | 2026-11-03T22:13:25.338403+00:00 | 2026-11-03T22:13:33.613506+00:00 | 0 |
| `api-lint` | 2026-11-03T22:13:33.631627+00:00 | 2026-11-03T22:13:39.168554+00:00 | 0 |
| `api-build` | 2026-11-03T22:13:39.185660+00:00 | 2026-11-03T22:13:46.372235+00:00 | 0 |
| `git-diff-check` | 2026-11-03T22:13:46.392292+00:00 | 2026-11-03T22:13:46.409178+00:00 | 0 |

TypeScript 6 is verified by `provenance/verified-ts6-version.*` and `provenance/verified-ts6-package.*`. The compiler prints `Version 6.0.3`; its installed package is `@typescript/typescript6` version `6.0.2`. The binary path and SHA-256 are recorded.

The commands executed with HEAD at the preserved red checkpoint and the final files in the working tree. Their file hashes match source commit `63766f9a3ad4b10562f19c874323e1b89e2ff1fc`. The final receipt distinguishes the execution HEAD from this later source commit. The original receipt is retained beside the corrected metadata.

## Earlier attempts

`checks/red/` retains the red output from the committed test-only checkpoint. It reaches ten assertions, all failing because the seam function does not yet exist. The same focused command then passes after implementation.

Attempt 1 stopped at two `no-dynamic-delete` lint errors in the new test. Attempt 2 stopped at TS4111 after dot access was introduced. The final test uses bracket reads and assignments, with literal static deletion through a named-property cast. Both earlier serial attempts and every raw stream they reference remain under `checks/attempt-1-lint-failure/` and `checks/attempt-2-ts4111-failure/`.

Initial setup required the existing contracts/db builds and `NODE_OPTIONS=--import=tsx`. No dependency/configuration file changed. Those early setup outputs were present only in session tool results, so this packet does not claim raw-file receipts for them. See `collection-notes.json` for the exact commands and limits.

The host refused an initial `/tmp` wrapper containing `rm -rf` with "rm -f style commands are not permitted. Use a safer approach". Nothing in that wrapper executed. Capture continued without deletion in a fresh `/tmp` directory.

## Scope and next owner

The exact allowed paths are:

- `apps/api/test/helpers/diagnosticPreparedReaderFixture.ts`
- `apps/api/test/helpers/diagnosticPreparedReaderFixture.boundary.spec.ts`
- `docs/evidence/issue-897/a-06-combined-ci-20261030/prepared-source-boundary-20261103/full-coverage-20261103/issue945-port-seam-20261104/**`

`allow-list-audit.json` and `source.diff` provide the source comparison. The evidence commit changes only the allowed evidence subtree. No services, migrations, Docker commands, API requests, database connections, Redis operations or MinIO operations ran.

The A coordinator owns assembly and fresh independent Standards/Spec reviews of the assembled SHA. Both reviews remain pending. #944 must repin to the reviewed result before any runtime reservation or retry. The implementation writer opened no PR and changed no GitHub issue or PR.

Docs: no external dependency or API changed, so no external documentation lookup was needed. The fixture change does not change documented context ownership or product behavior.
