# Architecture Decision Records

This directory contains architecture decisions for AutoTM. ADRs are **immutable after merge** — they document what was decided, when, and why.

## Effective documentation policy

[ADR-0060](0060-source-first-agent-context-and-task-scoped-guidance.md) replaces ADR-0019's exhaustive implementation mirrors with source-first, task-scoped orientation. ADR-0042 still owns vocabulary; ADR-0020 still governs all other document roles and historical mutability. Older records below remain unchanged.

## Index

| # | Title | Status | Date |
|---|---|---|---|
| [0001](0001-architecture.md) | Level 2 bounded-contexts architecture | Accepted | 2026-05-13 |
| [0002](0002-stack.md) | Technology stack | Accepted | 2026-05-13 |
| [0003](0003-monorepo.md) | Monorepo with Turborepo + pnpm | Accepted | 2026-05-13 |
| [0004](0004-migrations.md) | Prisma migrations discipline | Accepted | 2026-05-13 |
| [0005](0005-hosting.md) | Fully-in-Turkmenistan air-gapped hosting | Accepted | 2026-05-13 |
| [0006](0006-auth.md) | Phone OTP + custom Android SMS gateway | Accepted | 2026-05-13 |
| [0007](0007-i18n.md) | i18n strategy (RU + TK + EN) | Accepted | 2026-05-13 |
| [0008](0008-media.md) | Media upload + serving pipeline | Accepted | 2026-05-13 |
| [0009](0009-notifications.md) | Push notifications (FCM + APNS + fallback) | Accepted | 2026-05-13 |
| [0010](0010-testing-obs.md) | Testing pyramid + observability stack | Accepted | 2026-05-13 |
| [0011](0011-version-deltas.md) | Latest-stable version uplift | Accepted | 2026-05-13 |
| [0012](0012-multi-device-sessions.md) | Multi-device sessions with per-session refresh tokens (supersedes ADR-0006 §Refresh token storage) | Accepted | 2026-05-14 |
| [0013](0013-user-role-split.md) | Split `User.role` from `DealershipMember.role` | Accepted | 2026-05-14 |
| [0014](0014-mobile-component-library.md) | Mobile component library — React Native Reusables on top of NativeWind v4 (complements ADR-0002) | Accepted | 2026-05-16 |
| [0015](0015-mobile-data-fetching.md) | Mobile data fetching — TanStack Query v5 + custom fetch wrapper (complements ADR-0002, ADR-0012) | Accepted | 2026-05-16 |
| [0016](0016-typescript-runtime-boundaries.md) | TypeScript runtime boundaries for workspace packages | Accepted | 2026-05-17 |
| [0017](0017-context7-as-canonical-doc-source.md) | Context7 MCP as the canonical doc source for AI agents | Accepted | 2026-05-17 |
| [0018](0018-api-port-3006.md) | API runs on port 3006 in development | Accepted | 2026-05-17 |
| [0019](0019-context-md-describes-current-state.md) | CONTEXT.md describes current state, not aspirational spec | Accepted | 2026-05-17 |
| [0020](0020-document-hierarchy-and-mutability.md) | Document hierarchy and mutability rules | Accepted | 2026-05-17 |
| [0021](0021-feed-ranking-port.md) | Feed ranking via port abstraction | Accepted | 2026-05-18 |
| [0022](0022-city-first-listing-location.md) | City-first listing location | Accepted | 2026-05-18 |
| [0023](0023-first-party-product-analytics.md) | First-party product analytics for MVP | Accepted | 2026-05-18 |
| [0024](0024-owner-post-publish-photo-editing.md) | Owner post-publish photo editing | Accepted | 2026-05-21 |
| [0025](0025-edit-save-atomicity.md) | Edit-mode Save changes uses sequential best-effort, not server-side atomic bundle | Accepted | 2026-05-22 |
| [0026](0026-edit-mode-review-first-entry.md) | Edit mode opens at Review; create mode stays linear | Accepted | 2026-05-22 |
| [0027](0027-mlp-beta-scope.md) | MLP beta scope before full marketplace MVP | Accepted | 2026-05-22 |
| [0028](0028-kimi-sandcastle-afk-orchestrator.md) | Kimi-Sandcastle as the AFK parallel orchestrator | Superseded by ADR-0066 | 2026-06-04 |
| [0029](0029-self-hosted-ota-air-gap-delivery.md) | Self-hosted Expo Updates (OTA) + hybrid air-gapped app delivery | Accepted | 2026-06-07 |
| [0030](0030-reviewer-demo-account-otp-bypass.md) | Reviewer demo-account OTP bypass for store review | Accepted | 2026-06-07 |
| [0031](0031-mobile-i18n.md) | Mobile i18n runtime — locale store + Accept-Language transport + query-key cache (implements ADR-0007; supersedes its §catalog client-side rendering) | Accepted | 2026-06-09 |
| [0032](0032-account-deletion-grace-period.md) | Account deletion — 30-day grace, tombstone-retain content, recoverable by login | Accepted | 2026-06-09 |
| [0033](0033-sandcastle-copy-to-worktree-dependencies.md) | Sandcastle dependencies via copy-to-worktree — prebuilt Linux node_modules cloned per worktree (supersedes ADR-0028 §D3) | Superseded by ADR-0066 | 2026-06-10 |
| [0034](0034-kolesa-ux-findability-reference.md) | Kolesa.kz as the UX / information-architecture reference (revises charter §1 auto.ru, findability scope only) | Accepted | 2026-06-10 |
| [0035](0035-multi-vertical-platform-direction.md) | Multi-vertical platform direction — cars as the MLP wedge (extends ADR-0034; MLP stays cars-only) | Accepted | 2026-06-11 |
| [0036](0036-multi-vertical-seam-resolutions-mlp.md) | Multi-vertical seam resolutions (MLP) — defer all four ADR-0035 seams, record the contracts (implements ADR-0035) | Accepted | 2026-06-11 |
| [0037](0037-trust-inspection-competitive-wedge.md) | Trust / inspection as the competitive wedge — pulled forward against TM incumbents (amends ADR-0027 sequencing; clarifies ADR-0035 framing) | Accepted | 2026-06-11 |
| [0038](0038-admin-totp-pending-enrollment-idempotent.md) | Admin TOTP pending enrollment is idempotent instead of replaceable | Accepted | 2026-06-13 |
| [0039](0039-phased-cloud-first-hosting.md) | Phased cloud-first hosting — Railway until store verification, then TM cutover (amends ADR-0005 Railway exclusion scope; supersedes ADR-0030 single-account scoping) | Accepted | 2026-07-20 |
| [0040](0040-repo-canonical-workflow-skills.md) | Repo-canonical workflow skills — one layer at `.claude/skills/`; commands, mirrors, and global variants retired | Accepted | 2026-07-22 |
| [0041](0041-git-history-is-the-archive-for-retired-agent-tool-artifacts.md) | Git history is the archive for retired agent-tool artifacts (supersedes ADR-0040's historical-document retention consequence) | Accepted; `.sandcastle/` retention superseded by ADR-0066 | 2026-07-22 |
| [0042](0042-domain-glossary-authority-and-mutability.md) | Domain glossary authority and mutability | Accepted | 2026-08-25 |
| [0043](0043-native-apns-delivery-via-node-apn.md) | Native APNS delivery via node-apn, not firebase-admin (supersedes ADR-0009's firebase-admin-for-both clause and its `PUSH_TRANSPORT` value list) | Accepted | 2026-09-03 |
| [0044](0044-railway-deploy-settings-live-provider-side.md) | Railway deploy settings live provider-side; `railway/*.json` is a declared-state record only (corrects ADR-0039's config-as-code assumption) | Accepted | 2026-09-05 |
| [0045](0045-first-admin-bootstrap-in-signups-disabled-environments.md) | The first admin in a signups-disabled environment is bootstrapped by break-glass identity insert, never by lifting the signup flag | Accepted | 2026-09-06 |
| [0046](0046-production-smoke-host-approval.md) | Approve production-smoke hosts independently of the shared EAS `preview` URLs | Accepted | 2026-09-13 |
| [0047](0047-fcm-only-push-transport-for-android-first-launch.md) | `PUSH_TRANSPORT=fcm` for the Android-first launch window (supersedes ADR-0043's transport value list) | Accepted | 2026-09-16 |
| [0048](0048-pin-react-native-css-interop-with-a-pnpm-override.md) | Pin react-native-css-interop with a pnpm override | Accepted | 2026-09-16 |
| [0049](0049-defer-listing-detail-share-to-chat-until-recipient-selection.md) | Defer listing-detail share to chat until the recipient is chosen | Accepted | 2026-09-17 |
| [0050](0050-wizard-validation-messages-as-translation-keys.md) | Wizard validation messages are translation keys, not prose | Accepted | 2026-09-18 |
| [0051](0051-auto-ru-inspired-mobile-discovery-before-google-play-review.md) | Auto.ru-inspired mobile discovery before Google Play review (supersedes ADR-0034 for mobile discovery and conflicting ADR-0035 browse clauses) | Accepted | 2026-09-21 |
| [0052](0052-seller-condition-disclosure-is-damaged-plus-known-issues.md) | Seller condition disclosure is "Damaged / needs repair" plus known issues (amends ADR-0037 condition disclosure) | Accepted; required-to-publish rule amended by ADR-0080 for New cars | 2026-09-21 |
| [0053](0053-defer-vin-decoding-until-a-real-decoder-exists.md) | Defer VIN decoding until a real decoder exists (amends ADR-0037 VIN history signal) | Accepted | 2026-09-22 |
| [0054](0054-phone-or-email-sign-in-share-one-user.md) | Phone or email sign-in share one User (supersedes ADR-0006 phone-only sign-in; amends ADR-0030 reviewer entries) | Accepted | 2026-09-22 |
| [0055](0055-resend-sends-sign-in-codes-from-the-worker.md) | Resend sends sign-in codes by email from the worker (complements ADR-0054) | Accepted | 2026-09-22 |
| [0056](0056-listing-contact-phones-are-verified.md) | Listing contact phones are verified (supersedes ADR-0054 publishing and seller-trust parts) | Accepted | 2026-09-22 |
| [0057](0057-defer-the-in-app-inspection-demand-signal.md) | Defer the in-app inspection demand signal (amends ADR-0037 demand instrumentation) | Accepted | 2026-09-22 |
| [0058](0058-portable-coding-agent-issue-execution-and-pull-request-gates.md) | Portable coding-agent issue execution and pull-request gates | Accepted; high-risk review-provider rule and two-issue pilot limit superseded by ADR-0064; Sandcastle boundaries superseded by ADR-0066 | 2026-09-23 |
| [0059](0059-kimi-code-as-a-third-interactive-coding-agent.md) | Kimi Code as a third interactive coding agent (amends ADR-0058 supported agents and review-provider rules) | Accepted; high-risk review-provider rule and restated pilot limit superseded by ADR-0064 | 2026-09-28 |
| [0060](0060-source-first-agent-context-and-task-scoped-guidance.md) | Source-first agent context and task-scoped guidance | Accepted direction; #417 implementation/review | 2026-09-28 |
| [0061](0061-stored-tmt-listing-price-for-feed-sort-and-range.md) | Stored TMT listing price for feed sort and range filtering (amends ADR-0021 stored-column rejection) | Accepted | 2026-09-28 |
| [0062](0062-the-human-in-the-loop-may-assign-both-review-axes-to-kimi-per-pull-request.md) | The human in the loop may assign both review axes to Kimi per pull request (amends ADR-0059 high-risk review-provider rule) | Superseded by ADR-0064 | 2026-09-28 |
| [0063](0063-mobile-refreshes-an-expired-access-token-before-sending.md) | Mobile refreshes an expired access token before sending (extends ADR-0015 refresh contract) | Accepted; refresh-failure rule amended by ADR-0077 | 2026-09-28 |
| [0064](0064-any-supported-client-may-review-either-axis-and-issues-have-no-concurrency-limit.md) | Any supported client may review either axis, and issues have no concurrency limit (supersedes ADR-0062 and the review-provider and in-flight rules of ADR-0058/0059) | Accepted | 2026-09-28 |
| [0065](0065-small-changes-skip-the-issue-ceremony.md) | Small changes skip the issue ceremony (amends ADR-0058 re-review and separate-axes rules, ADR-0064's both-verdicts rule, and one-branch-per-issue for batch PRs; extends ADR-0058 with no-issue PRs) | Accepted | 2026-09-28 |
| [0066](0066-retire-sandcastle-queue-agents-replace-unattended-dispatch.md) | Retire Sandcastle; queue agents replace unattended dispatch (supersedes ADR-0028 and ADR-0033; amends ADR-0041's `.sandcastle/` retention and ADR-0058's Sandcastle boundaries) | Accepted | 2026-09-29 |
| [0067](0067-targeted-intermediate-reviews-and-final-verification.md) | Target intermediate reviews and verify the final commit (amends ADR-0058's checkpoint and review procedure) | Accepted | 2026-09-29 |
| [0068](0068-resolve-context7-ids-at-lookup-time.md) | Resolve Context7 IDs at lookup time (amends ADR-0017's ID selection shortcut) | Accepted | 2026-09-29 |
| [0069](0069-queue-implementers-run-in-host-created-worktrees.md) | Queue implementers run in host-created worktrees (amends ADR-0058's one worktree per issue and resume-the-found-worktree rules and ADR-0064's restatement of them; complements ADR-0066's queue sessions) | Accepted | 2026-09-29 |
| [0070](0070-test-first-behaviour-and-ui-evidence.md) | Test-first behaviour and UI evidence | Accepted | 2026-09-30 |
| [0071](0071-codex-queue-models-and-owned-worktrees.md) | Codex queue models and owned worktrees (amends ADR-0069 for Codex only) | Accepted | 2026-09-30 |
| [0072](0072-imported-logo-cleanup-coordination.md) | Give logo activations unique object directories | Accepted | 2026-10-01 |
| [0073](0073-ci-gates-and-release-bundles-run-on-github-hosted-runners.md) | CI gates and release bundles run on GitHub-hosted runners (amends ADR-0039's CI/CD split and ADR-0005's self-hosted runner rows) | Accepted | 2026-10-01 |
| [0074](0074-digest-pinned-chainguard-minio-images.md) | Digest-pinned Chainguard MinIO images, preserving the existing S3 and volume contract | Accepted | 2026-10-01 |
| [0075](0075-railway-pr-backends-for-agent-native-sessions.md) | Railway PR backends for agent native sessions (amends ADR-0039's Railway shape and the coding-workflow local verification rule) | Accepted | 2026-10-01 |
| [0076](0076-orchestrator-runs-the-worktree-cleanup-gate-after-every-merge.md) | The orchestrator runs the worktree cleanup gate after every merge (amends ADR-0069's and ADR-0071's cleanup rules) | Accepted | 2026-10-01 |
| [0077](0077-mobile-keeps-the-session-when-a-token-refresh-fails-without-a-rejection.md) | Mobile keeps the session when a token refresh fails without a rejection (amends ADR-0063's refresh-failure rule and accepted cost) | Accepted | 2026-10-02 |
| [0078](0078-the-api-trusts-one-configured-header-for-the-client-ip.md) | The API trusts one configured header for the client IP (amends ADR-0054's per-IP budget; preserves ADR-0039's hosting constraint) | Accepted | 2026-10-02 |
| [0079](0079-server-recorded-upload-provenance-for-listing-media.md) | Server-recorded upload provenance for Listing media (amends ADR-0008's upload path) | Accepted | 2026-10-02 |
| [0080](0080-a-new-car-skips-the-damaged-question.md) | A New car skips the "Damaged / needs repair" question (amends ADR-0052's required-to-publish rule) | Accepted | 2026-10-02 |

## Per-app ADRs

| Location | Scope |
|---|---|
| `apps/api/docs/adr/` | API-specific (DTO patterns, error envelopes, controller conventions) |
| `apps/admin/docs/adr/` | Admin UI specific (component library choices, layout) |
| `apps/web/docs/adr/` | Public web specific (SSR strategy, OG generation) |
| `apps/mobile/docs/adr/` | Mobile specific (navigation, state mgmt, deep linking) |

## Format

Every ADR follows this skeleton:

```markdown
# ADR-NNNN: <Title>

- **Status**: Accepted | Superseded by ADR-XXXX | Rejected
- **Date**: YYYY-MM-DD
- **Deciders**: <names>

## Context
<the situation that forced a decision — constraints, alternatives in scope>

## Decision
<what was chosen, stated as a present-tense declarative sentence>

## Consequences
### Positive
- ...

### Negative / accepted costs
- ...

### Neutral
- ...

## Alternatives considered
- **<Option B>** — <why rejected>
- **<Option C>** — <why rejected>

## References
- Charter §X
- Related ADR-NNNN
```

## Rules

1. **Numbered sequentially.** Don't reuse numbers.
2. **Dated on creation.** Update the date on a superseded note, never the original.
3. **Immutable after merge.** To change a decision, write a new ADR that supersedes the old one and updates this index.
4. **One decision per ADR.** Don't bundle five decisions into one document.
5. **Concrete, not aspirational.** "We will use NestJS" — not "we should consider NestJS."
