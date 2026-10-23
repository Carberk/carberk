# Membership, coordinator and contact verification batch

Root assembled this batch for #897 / #901 through PR #904. The previous published candidate is `d397c8b7cb275826d6aba80ce684703cbc43a7c3`; its [hosted receipt](checkpoint-d397c8b7-20261020.md) remains historical evidence, not certification of this batch. Main remains `9fde309c3da17f2661fe9c266504e6e56a1b97c9` after fetch. PR stays draft, auto-merge off, existing watch on. No staging, provider, merge or store action occurred.

## Assembly

The prepared local coordinator/contact tests, design and Service/History notes were already assembled through `bef859ae`. Root inspected the returned source and test-infrastructure diffs and cherry-picked serially with `-x`, without conflicts:

| Writer checkpoint | Root checkpoint | Scope |
| --- | --- | --- |
| `80de5df8` | `d934f45d` | Bounded admitted-business sales invitations, redemption, suspend/restore, exact audits and reset reconciliation. |
| `f6c085ac`, `7da5dd6d`, `a064ca7d` | `7c41bfa9`, `c1f84ae9`, `8a5b099d` | Regression RED, deterministic shallow setup and test-file immutable Git object cache. |

Earlier admission, owner redemption, email disposal, #445 and #881 source changes were already present and were not cherry-picked again. The membership writer left the current spec unchanged. The cache changes only test infrastructure and its evidence. Caps, lock order, timeouts, retries, concurrency, production Git handling and operational allowlists remain unchanged.

## Bounded verification

- Root syntax checks for `staging-campaign.mjs` and `staging-railway.test.mjs`: PASS.
- Root campaign and ledger suites: 8/8 PASS, zero failures/cancellations. Log `/tmp/carberk-membership-assembly-controls-20261020.log`.
- Root focused cache regression and the four previously failing lifecycle cases: 5/5 PASS, zero failures/cancellations, 24525.6675 ms. Log `/tmp/carberk-membership-assembly-git-20261020.log`.
- Agent documentation checks and combined diff whitespace check: PASS. The already completed root combined API typecheck and focused lint covered the unchanged coordinator/contact composition through `bef859ae`; no TypeScript changed in this assembly.
- The [membership handoff](../issue-901/full-v3-membership-source-20261020.md) records 140 existing offline controls, generated v1/v2 comparison and API typechecks. The [Git handoff](../issue-901/staging-git-timeout-diagnosis-20261020.md#bounded-immutable-object-test-cache-checkpoint) records real local RED-to-GREEN, full and shallow focused passes and cleanup traces. Root did not repeat their full verification.

## Hosted purpose and limits

One normal push schedules the next hosted batch; no manual rerun. It must establish whether the unchanged membership case advances from the first invitation failure through its exact audit/disposal assertions. Successful sales removal and 48-hour invitation expiry remain outside that test and remain missing proof.

The 22-case composition adds four [coordinator promotion cases](../issue-901/full-v3-coordinator-promotion-test-handoff-20261020.md) and one [contact-phone lifecycle case](../issue-901/full-v3-contact-phone-test-handoff-20261020.md). Their runtime composition and assertions are UNKNOWN. Predicted first source refusals are `Synthetic identity changed` at coordinator promotion and `Unsupported campaign OTP` at contact request, but only hosted results can establish reached RED. Coordinator/contact source is not assigned ahead of that evidence.

The Git cache removes a locally reproduced repeated immutable-origin dependency. The prior hosted SIGTERM identifies a fetch but not its remote or cause. This is not a proven cure for that stall; hosted external acquisition and full root-suite behavior remain UNKNOWN.

One isolated Sol 6.1 medium writer prepares the next bounded Support text test from `bef859ae`, with sole ownership of `CampaignFullV3.e2e.spec.ts`. That work is not in this batch. It must preserve the existing 22 cases and ordinary auth, respect 128/2048 caps and return exact accounting and limitations. Service/History capacity partitioning remains an unapproved architecture recommendation, so global capacity/provider/FIFO paths remain closed.

All broader graph, roster and capability proof, late-worker/private-object disposal, independent Standards/Spec review since `0fdf8836`, browser/native/deployed acceptance and restoration, exact signing/disclosures, ops proof and human activation prerequisites remain incomplete. The refused scoped Railway token is not retried. Founder approval is still required for protected merge, production promotion, spending, invitations and store submission. Live entry and collection remain disabled.
