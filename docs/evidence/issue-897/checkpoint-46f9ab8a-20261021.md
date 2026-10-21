# Hosted checkpoint 46f9ab8a, 2026-10-21

This docs-only checkpoint records the hosted API receipt for the published candidate tree `f3b0cf81`, with candidate commit `46f9ab8a`. It is evidence for #897/#901/#914 under sole PR #904. It does not establish a green candidate or approve release.

Verified API failure evidence is at plain-log lines 2478–2489, 2494–2524 and 2917; suite totals are at 2927–2928. Receipt sources are `/tmp/carberk-next-release-20261021/46f9ab8a-api.raw.log` and `.plain.log`. API job `119007918038`, run `39534489428`. The API suite passed 313/315 files and 3046/3048 tests. Root reports the worker receipt as 54/54 and 356/356. The API suite is RED with two failing tests:

- `DiagnosticReports.e2e.spec.ts:308` reinspection expected HTTP 201 after existing HTTP preparation but received 404. The reinspection route remains absent.
- `CampaignFullV3.e2e.spec.ts:1907` media presign returned 201, then journal ownership failed. The enclosing exact reset assertion later reported `c1...` exit 1 instead of 0. The exact reset cause is UNKNOWN.

The preserved full-v3 result is 26 passing cases and 1 failing case. The diagnostics result is 11 passing cases and 1 failing case. The receipt therefore does not support a full-candidate-green claim. The next source/test owner remains bounded: inspect the hosted RED, then implement and verify the smallest affected slices. Do not rewrite the reinspection proposal as approved, and do not start broad media redesign from this receipt.

Other hosted job state read by Root: static, database, frontend and lane succeeded; docs was skipped; required `pr` failed because API failed; runtime run `39534489472` succeeded. No staging, provider, deployment or release gate is closed by this checkpoint.

Checks for this checkpoint are offline only: `git diff --check`, Markdown target/line checks, `pnpm check:agent-docs`, and single-path diff review. No tests, services, CI, staging, provider calls, agents or GitHub execution records were run by this writer.

Writer base is `3726d219a8d015f7cfb02e79a1ff72f399510edc`; reservation `agent/issue-901-diagnostics-mapping-20261021` was pushed from that base before edits. Root owns GitHub execution records, integration assembly/push and the remaining source/test batch. This writer pushes only the reservation and completed docs checkpoint.
