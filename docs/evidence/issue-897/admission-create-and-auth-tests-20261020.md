# Admission creation and auth tests batch

Assembly after [aa7ae0c8 hosted evidence](checkpoint-aa7ae0c8-20261020.md), on unchanged main `9fde309c3da17f2661fe9c266504e6e56a1b97c9`. Sole draft PR #904. Root inspected and cherry-picked each checkpoint with `-x`.

| Writer checkpoint | Assembled | Scope |
| --- | --- | --- |
| `b866ef0f` | `10aaf5bb` | Ten actual-command PostgreSQL tests for phone/email admin selection and atomic role/audit writes |
| `ff9a6496` | `7fb9d0b8` | Staff expiry proof design and corrected JWT/clock limitation |
| `a23302c9` | `79f8491e` | One ordinary-auth controlled-clock expiry/fresh-Session case, preserving all fourteen existing cases |
| `525fc21c` | `a55362c9` | V3 synthetic admission creation, provenance, exact audit and disposal guard |

## Scope and evidence limits

[Admission source](../issue-901/full-v3-admission-create-source-20261020.md) addresses the four reached admission-setup failures at aa7ae0c8. A transaction-local single ID proves creation before a roster owner invitation adopts the synthetic Dealership. Updates cannot create that proof. Invitation ownership, exact elevated-actor admission audit, journal/hash limits and pre-cleaning integrity remain mandatory. Reset deletes admitted-but-unredeemed content and retains only redacted audits. Redemption, settings, recovery and shared-baseline behavior stay closed, as do operational CLI/controller/Railway v3 entry points.

Hosted behavior of this source is UNKNOWN. Two admission setup/refusal cases are expected to progress. The main journey should reach owner-redemption refusal; the baseline race should fail before the collector lock while redemption stays closed. These predictions are not GREEN evidence. No shared baseline may be deleted by a reserved journey.

[Moderation tests](../issue-901/moderation-command-test-handoff-20261020.md) exercise the checked-in operator command in a child process against disposable migrated PostgreSQL. Email success and selector exclusivity, plus phone audit-failure rollback, are predicted RED. Missing-email and email rollback cases are currently non-discriminating. No command source or operational promotion is included.

[Staff expiry test](../issue-901/staff-expiry-test-handoff-20261020.md) signs in and elevates through ordinary HTTP and the production mock-delivery worker. Only the test process's Date moves backward for the first elevation; nested finally restores real time before assertions and cleanup. It tests stale refusal, refresh preservation, same-Session re-elevation, logout refusal, a fresh unelevated Session, backup consumption and exact disposal. Hosted behavior is UNKNOWN. It does not establish production JWT expiry, database-time expiry or a real twelve-hour wait. Root clarified one comment to say no Session is seeded or edited directly; assertions are unchanged.

## Verification

- Writer admission controls ran once:153/153 PASS, zero cancelled. Root inspected `/tmp/issue901-v3-admission-controls.log`; this does not explain the historical pending-promise cancellation.
- Root syntax and generated-program comparison PASS. V1, v2, queue and remote paths are unchanged; v3 differs only by the admission additions, with the same22 triggers and no measurement-state guard. This does not execute PostgreSQL.
- Writer DB typecheck/lint and ten-test collection PASS. Root assembled DB typecheck, focused lint and collection PASS.
- Writer API typecheck/lint and fifteen-test collection PASS. Root assembled API typecheck PASS.
- Agent-doc routes and diff checks PASS. No local service-backed suite, Docker or staging mutation ran. Root will push this batch once; automatic hosted checks establish the next evidence boundary.

## Remaining work

The admission and expiry implementers are terminal. A separate docs-only Opus5.5 medium task derives the next business invitation/member/stock/enquiry slices and counts from the criteria. It edits no source and runs no services or CI. Root waits for hosted reach before assigning redemption/baseline source or moderation source.

Fresh independent Sol6.1 high Standards and Spec review remains due after `0fdf8836`. The complete owned graph, native/browser/deployed acceptance, restoration, exact signing/disclosures and human-owned gates remain open. Scoped staging Railway authorization remains refused and is not retried. Full release readiness is not established.
