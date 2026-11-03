# Issue 924 supplemental Standards source-readiness review

Fresh independent review, 2026-11-03. This receipt is new; it does not replace any earlier audit or review.

## Verdict

**PASS for the bounded AUDIT-S2/S3 source-readiness review. No blocking Standards finding in this scope.**

| Finding | Verdict on the exact candidate | Source basis |
|---|---|---|
| AUDIT-S2, post-lock execution-clock injection | **Resolved in source** | `PrismaStaffAuthority.ts:11–14` requires the existing injected `ClockPort`. Its execution sample at line 71 follows prepared-source entry, sorted User locks, the Session lock and fresh grant loading (49–66). Caller mutation time remains in declarations and grant/revoke writes (43–48, 79–89); `ChangeStaffGrant.ts:12–18` is unchanged. Policy still refuses `expiresAt <= now` and `elevatedUntil <= now` (`staffPolicy.ts:5–16`). Production composition binds the existing token to `SystemClockAdapter` (`identity.module.ts:125–134,206–209`). No optional clock or ambient fallback was introduced. This satisfies Modules §5. |
| AUDIT-S3, proxy repository/config mocks | **Resolved in source** | `evidence-proxy.spec.ts:3–19` imports the real route and replaces only Next cookie access, environment and network boundaries. The repository cookie/config mocks are removed. The route still imports the real wrappers (`route.ts:3–5,10,26`), with no test-configuration replacement. Existing origin, bounded cancellation, bytes, direct denial and no-store assertions remain (20–37); production-cookie/config normalization and missing-cookie outcomes are added (38–57). This satisfies Tests §2. |

The new clock matrix uses the real adapter/helper/policy, existing `MutableClock`, a database-boundary fixture and literal deadline values (`PrismaStaffAuthority.spec.ts:15–115`). It advances injected time across the Session-lock barrier, covers before/equal/after Session and elevation expiry for grant/revoke, and separates ambient time. The mechanical caller changes preserve existing assertions. No additional blocking layering, vocabulary, dependency, test-surface or duplication finding was identified in this bounded change.

Earlier A-01/A-09 UI S1/S2 dispositions are **historical and distinct**. They neither establish nor replace these verdicts. No overall issue closure, full affected-verification PASS, real SQL/lock/cleanup proof, CI, protected delivery or Milestone A acceptance is claimed. The A coordinator remains issue-update owner; Parent retains milestone acceptance.

## Immutable checkout and actual settings

| Item | Readback |
|---|---|
| Reviewer | `issue924-standards-review-assembled-20261103-r1`, fresh independent Standards role; not an implementer |
| Owned isolated checkout | `/Users/bagtyyar/.t3/worktrees/carberk/t3-0f82a06e` (`pwd -P` and Git top-level agree) |
| Checkout branch | `t3/issue-924-audit-s2-s3-standards-review` |
| Reviewed HEAD | `ec2494b909c8438a6479f2b62c94a42e1f7900b4` |
| Reviewed tree | `c2acada0b6ad3d83bededdddf9320b5d7ce51848` |
| Comparison base / verified merge base | `9fde309c3da17f2661fe9c266504e6e56a1b97c9` |
| Repair RED / source checkpoints | `019cd45ebb883e5d5cee9b0b21a301b2199e2c85` / `cd7f4adb773f0a190dba74015ca2583f615c791b` |
| Read-only review reservation | 2026-11-03 01:25–02:25 UTC, actual issue #924 comments 6592994620 and 6593075834 |
| Working state | Clean before receipt; HEAD/tree unchanged. Only this new, uncommitted receipt is authored. |

Actual `t3_thread_configure({})` readback, without a configuration mutation:

```json
{
  "modelSelection": {
    "instanceId": "codex_work",
    "model": "gpt-6.1-sol",
    "options": [
      { "id": "reasoningEffort", "value": "xhigh" },
      { "id": "serviceTier", "value": "default" }
    ]
  },
  "runtimeMode": "full-access",
  "interactionMode": "default"
}
```

The runtime also identifies GPT-6.1-Sol/xhigh. No provider/model/options fallback, child delegation, checkout/ref change, commit or push occurred.

## Governing issue and evidence reads

Actual GitHub GETs read [#897](https://github.com/Carberk/carberk/issues/897), its [map comment](https://github.com/Carberk/carberk/issues/897#issuecomment-6585003890), [#924](https://github.com/Carberk/carberk/issues/924) and both current dispatch comments: [reservation](https://github.com/Carberk/carberk/issues/924#issuecomment-6592994620), [dispatch](https://github.com/Carberk/carberk/issues/924#issuecomment-6593075834). The dispatch explicitly repins this review to the HEAD/tree above; the older migration-base wording is historical. Actual [#934](https://github.com/Carberk/carberk/issues/934) and [#935](https://github.com/Carberk/carberk/issues/935) were also read for phase and repair boundaries. Local cached issue JSON was discovery material only; live reads supersede it.

Standards/guidance inspected: `AGENTS.md:1–29`, `CONTEXT-MAP.md`, owning `apps/api/CONTEXT.md`, `apps/api/src/modules/identity/CONTEXT.md` (particularly 45–47), `apps/admin/CONTEXT.md`, `docs/domain/GLOSSARY.md`, `docs/agents/coding-standards.md:1–48` (especially 7,23,29–37), `docs/agents/domain.md:5–13,19–30,34–44`, `docs/agents/coding-workflow.md`, `docs/agents/typescript-runtime.md`, `docs/agents/worktree-lifecycle.md`, `docs/agents/issue-tracker.md`, `docs/agents/github-operations.md`, and `.claude/skills/run-issue/{FINALIZATION,VERIFICATION}.md`. The global code-review and unslop skills were read; this delegated Standards-only brief controls scope, so no nested review agents were started.

Preserved evidence inspected:

- `a-pr904-audit-20261102/standards-review.md:1–15`: original ambient-clock and repository-module-mock findings, tied to the separate audited head.
- `a-pr904-audit-20261102/report.md:1–130` and `a-pr904-audit-reconciliation-20261102.md:1–85`: provenance and the distinction between AUDIT-S2/S3 and historical UI findings.
- `a-01-standards-spec-review-20261030.md`, `a-01-postfix-standards-review-20261030.md`, `a-wayfinder-ticket-map-20261030.md:1–125` and the release acceptance matrix: historical boundaries, not a current verdict.
- `supplemental-repair-935/prerequisite-preparation-20261103/repair-red-receipt-r2.md:1–43`, `repair-terminal-handoff-r2.md:1–66`, and `supplemental-repair-935/coordinator-assembly-20261103/receipt.md`: recorded meaningful RED, unchanged assertions, source pins and remaining gates. The earlier prerequisite-block handoff remains historical.
- `a-06-combined-ci-20261030/prepared-source-boundary-20261103/recovery-stage1-20261103-r1/coordinator-assembly-audit.md:1–11` and adjacent JSON: #938 stage1 assembly/preservation context only. Its five added paths were inspected as a tree/path delta; this is not a full #938 fixture/SQL acceptance review. The helper's clock-related comment at `apps/api/test/helpers/diagnosticPreparedReaderFixture.ts:261–266` was read.

The archived writer result reports clock 13/13, proxy 5/5 and API/admin compiler/lint passes; its full selector remains 47 FAIL / 177 PASS. These are retained worker receipts, not reviewer reruns or a substitute for source inspection. The candidate's #938 offline assembly does not supply real PostgreSQL/cleanup outcomes. Required later evidence stays open with its existing owner.

## Exact source/test lines inspected

All paths below refer to the reviewed HEAD. Ranges identify inspected source, not executed tests.

| File | Lines | Purpose |
|---|---|---|
| `apps/api/src/modules/identity/infrastructure/PrismaStaffAuthority.ts` | 1–102 | Required injection, preparation/locks, execution sample, mutation/audit/no-op/rollback |
| `apps/api/src/modules/identity/infrastructure/PrismaStaffAuthority.spec.ts` | 1–115 | Real-adapter boundary, 13 cases, independent clock, literal effects |
| `apps/api/src/modules/identity/identity.module.ts` | 21–26,69,114–145,198–216,280–299 | Existing production composition |
| `apps/api/src/modules/identity/identity.tokens.ts` | 1–17 | Existing clock token |
| `apps/api/src/modules/identity/identity.public.ts` | 1–51 | Existing public boundary |
| `apps/api/src/modules/identity/domain/ports/ClockPort.ts` | 1–3 | Existing clock interface |
| `apps/api/src/modules/identity/infrastructure/SystemClockAdapter.ts` | 1–9 | Production clock adapter |
| `apps/api/src/modules/identity/application/testing/MutableClock.ts` | 1–9 | Existing shared clock fake |
| `apps/api/src/modules/identity/domain/staffPolicy.ts` | 1–17 | Exact expiry comparisons and unchanged permission policy |
| `apps/api/src/modules/identity/domain/ports/StaffAuthorityRepository.ts` | 1–15 | Repository contract |
| `apps/api/src/modules/identity/application/ChangeStaffGrant.ts` | 1–20 | Earlier mutation time and adapter recheck |
| `apps/api/src/modules/identity/application/CheckStaffAuthority.ts` | 1–28 | Neighboring post-read clock behavior |
| `apps/api/src/modules/identity/presentation/StaffAuthorityHttp.spec.ts` | 1–end | Unchanged HTTP/port coverage context |
| `apps/api/src/modules/identity/presentation/StaffAuthority.e2e.spec.ts` | 1–166 | Unchanged real-suite context; not run |
| `apps/admin/src/app/diagnostics/evidence-proxy.spec.ts` | 1–57 | Real wrappers, external substitutions, original and new outcomes |
| `apps/admin/src/app/diagnostics/evidence/[id]/[file]/route.ts` | 1–30 | Exercised real route and transport behavior |
| `apps/admin/src/lib/cookies.ts` | 1–28 | Actual framework-cookie wrapper |
| `apps/admin/src/lib/auth-cookie-options.ts` | 1–14 | Current environment-dependent cookie name |
| `apps/admin/src/lib/api-config.ts` | 1–17 | Runtime configured URL validation/normalization |
| `apps/admin/src/lib/validators.ts` | 1–65 | Real origin validation |
| `apps/admin/vitest.config.mts` | 1–19 | Alias resolves to real source; no setup/module substitutions |

Mechanical callers inspected through the exact repair diff and constructor inventory:

| File | Candidate lines / inspected hunk context |
|---|---|
| `apps/api/src/modules/identity/application/testing/DiagnosticMaterialHarness.ts` | 92–98 |
| `apps/api/src/modules/identity/application/testing/ReportPreparedHarness.ts` | 105–111 |
| `apps/api/src/modules/identity/infrastructure/ClassifiedForwardCapture.spec.ts` | 47–53 |
| `apps/api/src/modules/identity/infrastructure/DiagnosticMaterialPrepared.e2e.spec.ts` | 132–138,416–472 |
| `apps/api/src/modules/identity/infrastructure/DiagnosticPurgeEffectClosure.e2e.spec.ts` | 57–63 |
| `apps/api/src/modules/identity/infrastructure/DiagnosticReportsPrepared.e2e.spec.ts` | 62–68 |
| `apps/api/src/modules/identity/infrastructure/IdentityAuthorityPrepared.e2e.spec.ts` | 255–264,321–331,346–354,360–368 |
| `apps/api/src/modules/identity/infrastructure/IdentityAuthorityPrepared.spec.ts` | 1–75,245–295,360–433 |
| `apps/api/src/modules/identity/presentation/DiagnosticContinuityHandoff.spec.ts` | 67–75 |
| `apps/api/src/modules/identity/presentation/DiagnosticErasedPredecessorReaders.spec.ts` | 17–25 |
| `apps/api/src/modules/identity/presentation/DiagnosticScopedDiscovery.spec.ts` | 64–72 |
| `packages/db/tests/service-history-callers.e2e.spec.ts` | 142–174 |

`git diff --exit-code cd7f4adb... ec2494b9...` across all 15 #935 source/test paths returned 0. The four original #938 `.spec.ts` suites and `DiagnosticMemoryDatabase.ts` are unchanged from `7dc251d5...` (targeted equality returned 0). The broader candidate has later additions; neither equality is presented as whole-candidate equality to #935.

Immutable Git blobs at the reviewed candidate:

| Path | Blob |
|---|---|
| `PrismaStaffAuthority.ts` | `5af635a4261b10dba53e29ccc124a9f3ca5a7ef9` |
| `PrismaStaffAuthority.spec.ts` | `3d3cb6ab9f144656962660e2d6c4d96e5e2413c6` |
| `identity.module.ts` | `6af934837a2c2113a686f7ef73f0ea516738c3d0` |
| `evidence-proxy.spec.ts` | `3dfacbcb5c6c958338426afbae62ebf09f86fe33` |

## Read-only command record

Evidence-bearing commands below ran from the owned checkout. Repeated display/discovery reads used `cat`, `nl -ba`, `sed -n`, `rg`, `rg --files`, `find`, `sort`, `head`, `wc`, local JSON parsing and read-only Git history/object/ref inspection. No repository script, package manager, compiler, formatter, build, test runner, service, DB/storage/native/hosted-run command or PR command was executed. GitHub access was limited to issue GETs.

```sh
pwd -P
git status --short --branch
git status --porcelain=v1 --untracked-files=all
git rev-parse --show-toplevel HEAD HEAD^{tree}
git show -s --format='%H%n%T%n%P%n%s%n%b' HEAD
git merge-base 9fde309c3da17f2661fe9c266504e6e56a1b97c9 HEAD
git merge-base --is-ancestor cd7f4adb773f0a190dba74015ca2583f615c791b HEAD
gh api --method GET repos/Carberk/carberk/issues/897 --jq '.body'
gh api --method GET repos/Carberk/carberk/issues/924 --jq '.body'
gh api --method GET 'repos/Carberk/carberk/issues/924/comments?per_page=100' --jq '.[] | {id,created_at,updated_at,html_url,body}'
gh api --method GET repos/Carberk/carberk/issues/comments/6585003890 --jq '{id,updated_at,html_url,body}'
gh api --method GET repos/Carberk/carberk/issues/934 --jq '.body'
gh api --method GET repos/Carberk/carberk/issues/935 --jq '.body'
git show --stat --oneline cd7f4adb773f0a190dba74015ca2583f615c791b
git show --stat --oneline 019cd45eb
git show --stat --oneline 6bc5196958c58611328c09eb7a3dfa6fdc8c4f11
rg -n 'new PrismaStaffAuthority\(' apps packages -g '*.ts'
git diff --name-status a6de7b1b51039ea4b1d24ef7db9d8b21ca91d568 ec2494b909c8438a6479f2b62c94a42e1f7900b4 -- . ':(exclude)docs/**'
git diff --unified=3 9fde309c3da17f2661fe9c266504e6e56a1b97c9 HEAD -- apps/api/src/modules/identity/infrastructure/PrismaStaffAuthority.ts apps/api/src/modules/identity/identity.module.ts apps/admin/src/app/diagnostics/evidence-proxy.spec.ts
git diff --unified=4 019cd45eb cd7f4adb773f0a190dba74015ca2583f615c791b -- apps/api/src/modules/identity/infrastructure/PrismaStaffAuthority.spec.ts apps/admin/src/app/diagnostics/evidence-proxy.spec.ts apps/api/src/modules/identity/infrastructure/PrismaStaffAuthority.ts
git diff --check 019cd45ebb883e5d5cee9b0b21a301b2199e2c85 cd7f4adb773f0a190dba74015ca2583f615c791b -- apps/api/src/modules/identity/infrastructure/PrismaStaffAuthority.ts apps/admin/src/app/diagnostics/evidence-proxy.spec.ts
git ls-tree ec2494b909c8438a6479f2b62c94a42e1f7900b4 apps/api/src/modules/identity/infrastructure/PrismaStaffAuthority.ts apps/api/src/modules/identity/infrastructure/PrismaStaffAuthority.spec.ts apps/api/src/modules/identity/identity.module.ts apps/admin/src/app/diagnostics/evidence-proxy.spec.ts
```

The mechanical-caller patches were read with `git diff --unified=3 a6de7b1b51039ea4b1d24ef7db9d8b21ca91d568 ec2494b909c8438a6479f2b62c94a42e1f7900b4 -- <the twelve explicit paths in the table above>`, split into two six-path reads. The complete 15-path equality command used `git diff --exit-code cd7f4adb773f0a190dba74015ca2583f615c791b ec2494b909c8438a6479f2b62c94a42e1f7900b4 --` followed by the adapter, adapter spec, proxy spec and those twelve paths. Both commands were inspection only. Source reads used `nl -ba <path>` with the table's bounded `sed -n` ranges, and `cat` for small complete files.

Discovery failures were limited to an unavailable `python` binary (subsequent JSON reads used installed `python3`), absent guessed `.ts` Vitest config/setup filenames (the actual admin config is `.mts`), and a missing cached issue JSON. No host guard refused an action and no prohibited command was attempted as a fallback. Live issue GETs resolved the cached-version ambiguity.

Only this receipt is written. Existing source, evidence, manifests, refs and unrelated work remain preserved. No runtime evidence is used in place of the source-readiness review.
