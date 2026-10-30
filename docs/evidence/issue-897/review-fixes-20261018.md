# Campaign review fixes, 18 October 2026

This records the accepted review fix round after reviewed candidate `ef85f17f308a36cf7a7c8e8c45717d45b534f864`. Source checkpoint `4157afb643e30e064140e81168851891101925a0` contains the assembled UI fixes and the later operational SMTP addition. The SMTP addition requires fresh independent Standards and Spec reviews on the final assembled candidate. This record does not establish merge readiness.

## Review dispositions

| Finding | Red checkpoint | Fix and observed result |
|---|---|---|
| An active Listing video hides replacement preview and Use controls | `3cb9646e` | `a7b1df40` permits the selected replacement while an active video remains. Real editor/native-boundary test passes. |
| Rejected journal writes poison later task saves and transfer Pause | `3cb9646e` | `a7b1df40` retains a fulfilled serialization tail while returning each write's rejection to its caller. Subsequent saves and durable Pause pass. Combined focused video suite passes 28 tests. |
| Staff transport rejection leaves busy/loading controls stuck | `bf178513` | `1efa5886` catches rejected operations, service and diagnostic work. The final tests render real components and actions with external fetch/Next boundaries. They prove upstream HTTP error recovery, not browser RPC interruption. |
| Service Back drops a customer's draft | `e8e17f27` | `414ff68b`, type fixture `e59bbc64`, switching regression `cc733b9b`. Per-conversation body/image/attachment drafts survive Back and conversation switching, and clear on account change. |
| Diagnostic reader exposes raw implementation identifiers | `b5fdcb98` | `414ff68b`, localized panel copy `d1a343f9`. Rendered diagnostic reader tests assert customer-facing references. |
| Rejected diagnostic workspace refresh leaves stale staff decisions | `4102e4cf` | `18001857` clears context/reports after a real action rejects at the external Next request-context boundary. Existing resolved HTTP409 conflict still preserves the draft. Diagnostics and external HTTP focused suite passes 23 tests. |

Pending readiness checkpoints were incorporated in order as `bf178513`, `e8e17f27`, `1efa5886`, `b5fdcb98`, `414ff68b`, `e59bbc64`, `251bb6cd`, `cf6ce31d`, `d1a343f9`, `cc733b9b`. The later `4102e4cf`/`18001857` pair closes the refresh rejection gap found during assembly. Final `*.transport.spec.tsx` files replace the original tests that mocked repository actions. `4cdf3f39` fixes test import ordering.

## SMTP extension and local verification

The authorized monitoring route is `tkmdevelopers@gmail.com` to `bagtyyarkowusow.dev@gmail.com`. Sign-in email remains on Resend. The isolated SMTP sequence was incorporated as configuration RED `c2f00127`, runnable closed-adapter RED `a88c3e46`, implementation/timestamp-privacy RED `cfa84843`, timestamp fix/AUTH capability RED `44cafa76`, final adapter `e492b663`, and route documentation `4157afb6`.

The adapter defaults closed, authenticates over verified implicit TLS, bounds attempts and deadlines, persists transition receipts before egress, selects only allowed technical fields, and suppresses provider diagnostics. `nodemailer` is pinned to `10.1.2` in the worker and lockfile. [SMTP evidence](../issue-919/smtp-alert-transport.md) owns adapter scope and dependency documentation receipts.

At source `4157afb643e30e064140e81168851891101925a0`:

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm test:unit` | PASS, 10 workspace tasks, worker 284 tests |
| `pnpm typecheck` | PASS, 11 workspace tasks |
| `pnpm lint` | PASS, 11 workspace tasks |
| `pnpm check:runtime-imports` | PASS, database/contracts |
| `pnpm test:root` | PASS, 288 passed, 1 skipped, 0 failed |
| `pnpm --filter @auto-tm/worker build` | PASS |
| `pnpm --filter @auto-tm/worker exec tsc6 --noEmit` | PASS |
| Built `SmtpAlertSink.js` CommonJS runtime load | PASS |
| `git diff --check` | PASS |

Logs remain under `/tmp/carberk-campaign-delivery-20261014/`, including `review-video-red.log`, `review-video-green.log`, `review-smtp-{unit,types,lint,root,worker-build}.log`. Reviewed baseline `ef85f17f` had green hosted [PR Checks 39102150141](https://github.com/bagtyyarkovusov/auto.tm-rewrite/actions/runs/39102150141). That run does not verify these later fixes. Current `origin/main` `7af49d4c` is already an ancestor.

## Controlled real SMTP submission

The parent delivery owner submitted one synthetic incident through the built adapter from source `4157afb6` at `2026-10-18T06:22:07.868Z`. The process returned exit0 and `smtp-accepted-and-receipt-persisted`; its receipt has `attempts: 1` and `delivered: true`. A new process repeated the same incident timestamp, returned without another attempt and retained `attempts: 1`, `delivered: true`. The source pins and safe receipts are preserved in `/tmp/carberk-campaign-delivery-20261014/smtp-acceptance/{submission-result.json,repeat-result.json,receipt.json}`.

The parent obtained the credential through a Keychain subprocess and passed it only in the child environment. No credential value is included in this evidence. This establishes authenticated SMTP acceptance and persisted duplicate suppression across processes. Recipient inbox receipt and acknowledgement are unknown. It does not establish deployed watchdog topology, staging readiness, or exactly-once inbox delivery.

## Required evidence still missing

- Real browser-to-Next server-action RPC interruption and recovery. An ordinary local login against a synthetic API fixture and production Next app was prepared. The T3 preview snapshot/evaluation/navigation calls timed out after 15 seconds on three bounded attempts. The parent independently met the same limitation. No claim of browser RPC recovery is made from upstream HTTP or framework-boundary tests.
- Native/device acceptance for video replacement, transfer recovery, service navigation/drafts and diagnostic reader flows.
- Final exact-candidate hosted CI and fresh independent reviews after the SMTP addition and any later fixture changes.
- Reserved deployed acceptance, #919 operational topology/activation evidence, #920 readiness and #886 criterion reconciliation, and latest-main staging restoration under the parent owner's controls.

The assembly writer made no staging mutation, device action, mail submission or merge. The parent owns those acceptance actions and finalization. Draft PR904 remains open with auto-merge disabled.
