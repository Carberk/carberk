# 40 — Admin Dashboard

## Summary

Internal-only Next.js dashboard at `admin.auto.tm`. The MLP beta ships minimal moderation: TOTP-protected admin login, listing/user reports, listing ban/unban, user suspension, and audit log. Message reports are included only if S6 explicitly ships report-from-thread; blog reports and the broader dashboard — dealership verification, broadcasts, SMS health UI, catalog mega-editor, analytics, and inspection reports — are post-MLP.

## Why it exists

Bagtyýar (the admin persona) needs to:
- Find and act on reported listings before they harm users
- Review dealership identity evidence for a truthful business indicator under [38](38-showroom.md), separate from vehicle inspection
- Send announcements to users about new features or outages
- Confirm the SMS gateway is healthy (5 phones humming = OTPs flowing)
- Maintain catalog data (new car models, regions, colors)
- Audit who did what

A mobile admin UI would be cramped. Desktop web with shadcn/ui gives the room and density admins need.

## What it does (user-visible behavior)

### Login

- Phone OTP entry (same flow as mobile users, sent via same SMS gateway)
- First admin is provisioned through the checked-in operator path: `docs/prd/ops/86-admin-bootstrap-runbook.md` plus `packages/db/scripts/promote-admin.ts`. The script requires `--phone` and `--reason`, supports optional `--dry-run`, promotes an existing OTP-verified user by phone, exits non-zero with no audit row when no user matches, and exits zero as a no-op when the user is already `admin`. Ad hoc SQL is break-glass only. `role = admin` before TOTP is only a pending admin assignment and cannot access admin APIs. Bootstrap audit uses `ADMIN_BOOTSTRAP_PROMOTE` with `actorId = null`, targets the promoted user, records before/after role in details, and writes no duplicate audit row when the user is already `admin`.
- After OTP success: normal non-elevated session is created; the admin app calls `/auth/admin/totp/status` server-side, receives only `enrolled`, `elevated`, and `adminTotpExpiresAt?`, then shows TOTP enrollment on first admin login or TOTP code entry on later logins
- On TOTP success: the same session receives 12-hour TOTP elevation checked by `AdminGuard` on every admin-only API request. Refreshing the session does not extend TOTP elevation.
- TOTP enrollment and verification call authenticated identity routes, not `AdminGuard` routes, because `AdminGuard` is what TOTP unlocks.
- TOTP shared secrets are encrypted and recoverable server-side; backup codes are stored one-way hashed.
- TOTP enroll returns QR material only. Re-enroll after verified enrollment returns `TOTP_ALREADY_ENROLLED`; pending unverified enrollment can be replaced so a lost pre-verify QR does not block setup. Backup codes are returned only by first successful TOTP enrollment verification, exactly once, along with `adminTotpExpiresAt`, then displayed with copy-to-clipboard. Later admin elevation accepts either TOTP or one backup code through the same verify endpoint and returns `adminTotpExpiresAt` only, never backup codes again. TOTP verification accepts the current 30-second step plus one adjacent step for small clock skew.
- TOTP/backup-code verification is throttled to 5 failed attempts per admin user/session per 10 minutes on top of the global API throttler. Wrong TOTP and wrong backup code use the same generic failure response; successful verification resets the counter.
- Backup-code consumption is atomic, and failed TOTP/backup-code attempts are structured API security logs rather than moderation `AuditLog` entries. S7 does not add permanent lockout, account suspension, or self-service recovery for failed admin TOTP attempts.
- If TOTP elevation expires, `AdminGuard` returns 403; the admin app sends the admin back to TOTP verification and preserves the intended destination. In S7, successful TOTP elevation redirects directly to `/reports`; the reports list is the moderation home.
- The admin app server stores tokens in HTTP-only cookies and forwards bearer auth to `apps/api` from server actions / route handlers. `apps/api` does not accept cookie auth directly in the MLP, and browser components never call `apps/api` directly.
- Admin token cookies use `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, max ages aligned to the API access-token and refresh/session lifetimes. Canonical production names are `__Host-auto_tm_admin_access` and `__Host-auto_tm_admin_refresh` with no `Domain` when admin runs on its own host; local dev may use unprefixed `auto_tm_admin_access` / `auto_tm_admin_refresh` only when `__Host-` constraints cannot be satisfied.
- Browser client code never receives admin tokens. S7 does not add a separate CSRF-token system because admin mutations stay behind same-site server actions / route handlers; any browser-posted public route handler must validate `Origin` against the configured admin origin, with no `Referer` fallback.
- Admin server actions / route handlers refresh once on API 401, rotate cookies on success, retry the original API request once, then clear cookies and redirect to login if refresh fails. Refresh can recover bearer auth but never extends TOTP elevation.
- `returnTo` after TOTP re-verification accepts only relative internal admin paths; absolute URLs, protocol-relative URLs, and cross-host redirects are rejected. There is no multi-tab heartbeat in S7: tabs discover expired TOTP on their next protected route/action.
- If OTP succeeds on the admin host for a non-admin user, the admin app clears admin cookies and shows generic "Admin access required" copy without revealing normal-user account details.
- Admin logout attempts API logout server-side with the refresh token, but clears both admin cookies locally even if API logout fails. Logout-all attempts the bearer-protected API logout-all endpoint and then clears both cookies locally even if revoke fails.
- Admin recovery follows ADR-0006 backup codes: store only hashes and handle lost phone plus lost/exhausted backup codes through manual operator recovery. S7 has no backup-code regeneration UI, no admin demotion/deprovision UI, and no moderation-based admin suspension; mistaken or compromised admin access uses operator runbook/session revocation until post-MLP admin-account management is shaped.

### Dashboard (post-MLP)

- Overview cards:
  - **Active listings** count + 7-day trend
  - **Pending moderation** (reports awaiting review)
  - **Pending verifications** (dealerships awaiting review)
  - **SMS gateway health** (X of N phones connected, error rate)
  - **DAU / WAU** (active users)
  - **City supply / demand** (active listings, searches, saved searches, favorite/chat/call starts by listing city; no raw GPS)
- Recent activity feed (5 latest admin actions)

### Listings moderation

- Full dashboard list page with filters: status (active/sold/banned), region, brand, posted date range
- S7 report queue is driven by `ContentReport`, not by a Listing status. The `reported` Listing status was removed from the database (#328, #497); a review-hold status would need a new decision and migration
- S7 report list rows stay lean but include enough target context for triage: exactly `id`, `status`, `createdAt`, `reason`, `targetType`, `targetId`, and `targetSummary`. `targetSummary` is live-resolved: listing targets use a display title such as year/make/model or listing title when available; user targets use a public display label when available; missing targets use an unavailable/deleted marker while preserving `targetType` + `targetId`. List rows do not include report `details` preview text, reporter identity fields, full target state, counts, actionability flags, or user target role; full details, reporter summary, target state, counts, actionability, and `target.role` are fetched only on report detail where review/action controls need them.
- S7 report list filters stay limited to `status` + `targetType`; invalid filters or invalid `page`/`pageSize` return `VALIDATION_FAILED`, and the admin UI resets to the default pending queue. The pending queue uses a simple empty state, not dashboard cards or analytics.
- S7 does not ship a `/listings` admin index or listing search. It only exposes `/listings/:id` as a narrow action page reachable from report detail or by known id.
- S7 does not ship a "banned listings" queue; admins reach unban through known listing id, report-detail links, or audit-log target links. Banned-listing filters are post-MLP dashboard work.
- Open listing action page → minimal detail view + moderation toolbar:
  - **Ban** active listing with required internal plain-text reason. This is the S7 MLP listing action.
  - **Unban** banned listing back to `active` with required internal plain-text reason; S7 does not restore a stored previous status
  - **Hide from feed** (archive) — post-MLP if admins need a softer visibility action than ban
  - **Edit metadata** (admin override — used sparingly) — post-MLP
- Every action writes to audit log
- When a ban/suspend is triggered from a pending report, only the supplied matching report is marked `actioned` in the same transaction. Other pending reports on the same listing/user remain pending and can be dismissed manually; S7 does not cascade `actioned` or `dismissed` across sibling reports. If a supplied `reportId` is unknown, the API returns `NOT_FOUND`; if it exists but targets a different listing/user than the route target, the API returns `VALIDATION_FAILED` / `REPORT_TARGET_MISMATCH`; if it matches but is already resolved, the API returns `CONFLICT` / `REPORT_ALREADY_RESOLVED`. These failed requests do not mutate targets or write audit rows. Direct ban/suspend outside a report is still allowed and leaves all pending reports untouched, even when reports exist for that target. Dismiss is the only report-only resolution action.
- Pending reports whose target changed before review can still be dismissed. Report-backed ban/suspend requires the target to still be actionable; otherwise the API returns `CONFLICT` / `REPORT_TARGET_NOT_ACTIONABLE`, leaves the report pending, and writes no audit row.
- Pending reports do not freeze target lifecycle in S7. Listing owners can still archive/delete listings and users can still delete accounts through normal product flows. If the target disappears before review, admin report detail shows target unavailable, dismiss remains available, and report-backed ban/suspend returns `REPORT_TARGET_NOT_ACTIONABLE`. Target locks, moderation holds, and legal holds are post-MLP trust/legal ops candidates.
- Explicit admin ban is the point where owner listing actions stop. Banned listings are omitted from public feed/search/favorites and non-owner detail; owner surfaces show only a generic banned state. Owner edit, media changes, mark-sold, archive, republish, and delete routes are blocked until admin unban, so owner delete/archive is not a workaround for admin ban.
- Report-backed actionability is current-state only. A still-pending report is not invalidated by an earlier direct ban/unban or suspend/unsuspend cycle; if the target is currently actionable at review time, the report can be actioned. S7 does not add moderation epochs, report invalidation snapshots, or staleness-lock fields.
- Pending reports do not expire or auto-dismiss in S7. They stay pending until admin dismissal or a supplied matching report-backed ban/suspend. No age-based report state, SLA timer, scheduled cleanup job, or auto-close behavior ships in the MLP; age filters, escalation, and auto-close are post-MLP moderation-operations/dashboard candidates.
- Direct moderation actions re-check state at write time. Missing/deleted targets return `NOT_FOUND`; existing targets in the wrong state return `CONFLICT` / `MODERATION_TARGET_STATE_CONFLICT`, do not mutate the target, and write no audit row. Admin UI hides impossible actions when state is known but still handles this conflict after stale page loads.
- S7 has no report assignment/claim workflow. Concurrent report resolution uses optimistic conflict behavior: only `pending` reports can be resolved; already-resolved reports return HTTP 409 and do not overwrite reviewer fields, mutate targets, or write audit rows.
- Content reports store polymorphic target references (`targetType`, `targetId`) without DB FKs to listing/user. The API validates targets through owning contexts at creation/action time; if a target later disappears, admin report detail keeps the report visible with target unavailable.
- S7 public report creation is limited to active listings and existing, non-deleted users reachable through a public surface. Suspended users may be reported only while still visible/reachable. Visible admin users are reportable through the same public user-report route; public report creation does not reveal staff role or return a special staff-target error. Hidden or missing targets return `NOT_FOUND`; visible but non-reportable listing states return `VALIDATION_FAILED` / `REPORT_TARGET_NOT_REPORTABLE`.
- Mobile report entry points stay limited to public surfaces that exist in the MLP: active non-owner listing detail and visible non-self public user profile. There is no global report action, no report-from-message entry unless S6 is explicitly reshaped, and no public report management surface.
- Anonymous report taps use the existing mobile auth-on-action pattern. S7 can resume the report sheet after login only if it is cheap; otherwise the user returns to the target detail and taps Report again. Reporting does not add anonymous report drafts or a new auth challenge model.
- Mobile report form sends canonical reason enum values plus optional plain-text details. The client may trim and enforce the same required-`other` and 1000-character rules for responsiveness, but the API remains the source of truth for trimming, validation, and storage.
- S7 rejects self-reports at creation time: users cannot report their own profile, and sellers cannot report their own listing. Admins use direct moderation action pages for internal cases rather than creating public reports.
- S7 does not add report-specific quotas or custom report throttling. Public report creation relies on the existing global API throttler, authenticated-only submission, suspended-user block, self-report rejection, duplicate pending dedupe, and no auto-hide-on-report. Per-reporter quotas and reporting-rate analytics are post-MLP moderation-abuse work if beta volume proves they are needed.
- Report details are plain text only. The API trims leading/trailing whitespace before validation/storage, requires non-empty details after trim when `reason = other`, preserves internal line breaks, and caps details at 1000 chars after trim. S7 stores reason enum values; admin UI maps human labels locally. S7 does not add Markdown/HTML support, linkification, rich previews, a truncation contract, PII scanning, translation, profanity filtering, or moderation classifiers for report details.
- Report validity is based on creation-time reporter checks. If the reporter is later suspended or deleted, existing reports remain pending/actionable/dismissible; deleted reporters render as "Deleted user," and suspended reporters do not auto-invalidate earlier reports. Reporter-trust scoring and abusive-reporter auto-invalidation are post-MLP moderation-intelligence candidates.
- Duplicate report handling is intentionally small: one pending report per reporter/target is reused; different reporters can create separate reports; resolved reports do not block future reports. Public report creation returns 201 for a new report and 200 for duplicate pending reuse. The response shape is `{ reportId, status, createdAt, reusedExisting }` and does not expose other reporters' counts; duplicate reuse preserves the original `createdAt`, does not bump queue position, and emits no `ContentReportCreated`. Mobile shows the same generic success copy for both new reports and duplicate reuse, and does not display report id, status, or duplicate state. Unban does not resolve/dismiss pending reports or clean up favorites/saved-search state. Aggregate counts stay in admin report detail.
- If a report target disappears or becomes non-reportable between screen load and submit, mobile uses generic target-unavailable copy instead of leaking moderation state.
- Public reporting is submit-only in S7. Reporters cannot view a report history, track report status, edit submitted report details, retract reports, or start appeals/support workflows through mobile/API. Transparency, correction, and dispute workflows are post-MLP trust/support candidates.
- Reported listing owners and reported users do not see report metadata in S7: no report count, report reason/details, reporter identity, report status, or admin notes. Moderated targets show only generic banned/suspended state; appeals and owner-facing reason templates are post-MLP support/trust work.
- S7 report detail stays lean: reporter summary or deleted-user state, target summary or unavailable state, report reason/details rendered as escaped plain text, status/timestamps, target moderation state, and two exact counts. Detail target summaries may include listing title/year/make/model/status and, for user targets, admin-only `target.role` so the UI can disable/explain admin-target suspension; public report creation and report list rows never expose staff role. Reporter/reviewer summaries are live minimal identity summaries or deleted-user state; `ContentReport` stores no phone/name/profile snapshots. `pendingReportsOnTargetCount` counts currently pending reports for the same `targetType` + `targetId`, including the current report if still pending. `reportsSubmittedByReporterCount` counts all historical S7 report rows by that reporter across listing/user targets and all statuses, and is omitted when the reporter was deleted. Counts are computed live on `GetReportDetail`; no denormalized count columns, counter tables, or client-side aggregate state ship in S7. Rolling windows, trust scores, severity scores, precomputed report-count read models, conversation excerpts, deep reporter/owner history, reporter reputation, and cross-report clustering are post-MLP moderation intelligence.

### Users

- Full dashboard list + search by phone, name, email
- S7 does not ship a `/users` admin index or user search. It only exposes `/users/:id` as a narrow action page reachable from report detail or by known id.
- S7 does not ship a "suspended users" queue; admins reach unsuspend through known user id, report-detail links, or audit-log target links. Suspended-user filters are post-MLP dashboard work.
- Open user action page → minimal detail: phone, role, suspension state, and action history link
- Actions: Suspend / Unsuspend (with required internal plain-text reason, trimmed before validation/storage, non-empty after trim, capped at 1000 chars after trim). S7 stores simple current suspension state on `User`: suspend sets `suspendedAt`, `suspendedById`, and internal `suspensionReason` from the normalized reason; unsuspend clears those fields. Suspend/unsuspend is for non-admin user targets only: `role = admin` targets return `FORBIDDEN` / `ADMIN_TARGET_NOT_MODERATABLE`, and self suspend/unsuspend returns `FORBIDDEN` / `SELF_MODERATION_NOT_ALLOWED`; these failures do not mutate users, resolve reports, or write audit rows. AuditLog owns full history; no separate suspension-history entity, duration, automatic expiry, or warning ladder ships in the MLP. Suspended users see only a generic suspension banner; admin free-text reasons are internal.
- Reports against visible admin accounts can exist and be dismissed, but they cannot be action-suspended in S7. Staff abuse handling stays in operator/admin-account-management work, not automatic report-queue behavior.
- Suspended users keep login/account-deletion access, but authenticated marketplace mutations are blocked with HTTP 403 `FORBIDDEN` and `details.reason = "USER_SUSPENDED"`. Suspension does not auto-ban or hide the user's listings; admins ban listings separately when needed. Existing conversations remain readable, but new contact/messages are blocked when either participant is suspended.
- Cannot delete users in MVP (preserve audit trail and conversation history)

### Dealerships

- List of dealerships, sortable by verified status / tenure
- Tap → detail: logo, members, listings, contact, hours
- Actions: Verify (set `verifiedAt`) / Unverify / Edit metadata
- Add member (by phone, sends invite SMS)

### Broadcast notifications

- "New notification" page:
  - Title (RU / TK / EN)
  - Body (RU / TK / EN)
  - Target: All users / Specific user / Brand subscribers / Saved-search subscribers / TOPIC name
  - Optional deep link
  - `Important` flag (bypasses category mute — use sparingly)
- Preview shown
- Send → fans out via worker queue → records `NotificationHistory`
- History page:
  - List past notifications
  - Each shows: title, sent date, recipients, delivered, failed, success rate
  - Click → detail with per-recipient delivery log

### SMS gateway health

- Per-phone view: ID, label, connected status (green/red), last successful send, today's send count, error rate, SIM credit (manually updated)
- Recent SMS log: phone number sent to (masked), OTP request ID, phone used, status, timestamp
- Per-phone actions: mark inactive / re-enable / view detailed log

### Catalog editor

- Post-MLP dashboard work. S7 hardens existing catalog admin API auth but does not build `/catalog` UI in `apps/admin`; beta-critical corrections use protected API/operator tooling unless S8 explicitly shapes a small correction UI.
- Brands list with logo + trilingual names
- Click brand → edit form (3 name fields, slug, logo upload, isActive)
- Add new brand button
- Similar for Models (scoped to Brand) / Generations / Colors / Regions / Cities / Body types / Engine types / Transmissions / Drive types

### Audit log

- Filterable list of all admin actions
- S7 list view uses `GET /api/v1/admin/audit` with `OffsetPagination`, default `createdAt DESC, id DESC` for deterministic ties, and only `action`, `targetType`, and `targetId` filters
- S7 audit row fields are intentionally small: `id`, `createdAt`, `action`, `actorSummary`, `targetType`, `targetId`, short target label, and optionally one-line escaped plain-text reason preview. The list does not expose full `details` JSON.
- Deleted/null actors render as "Deleted admin" for ordinary admin actions and "Operator script" for `ADMIN_BOOTSTRAP_PROMOTE`.
- Missing or deleted targets keep their audit row visible and render "Unavailable target"; list/detail rendering must not fail because a listing, user, or report row disappeared after the audit row was written.
- S7 can show audit detail through an expanded row or side panel when `details.reason`, `before`, or `after` are needed. A dedicated audit detail page is not required for the MLP.
- Full dashboard filter expansion: actor (admin user), action type, target type, date range, and full-text where needed
- S7 detail view reads structured `AuditLog.details` (`reason`, `reportId?`, `reportedTargetType?`, `reportedTargetId?`, `before?`, `after?`, action-specific fields). `reason` is a required internal plain-text string, trimmed before validation/storage, non-empty after trim, capped at 1000 chars after trim, rendered to admins as escaped plain text, and not an enum/picker/template/classifier value. Dismiss audit rows target the `content_report` row and preserve the reported listing/user in details; ban/suspend audit rows target the moderated listing/user and carry `reportId`. A first-class before/after diff UI and typed DB action enum are post-MLP hardening.
- S7 `before` / `after` snapshots stay minimal: report status for dismiss, report status plus listing/user state for report-backed ban/suspend, listing status for ban/unban, and user suspension fields for suspend/unsuspend. Admin mutation endpoints return HTTP 200 JSON with `auditLogId` and updated target/report state rather than `204`; double submits use current-state conflicts instead of idempotency keys.
- Invalid S7 audit filters or pagination return `VALIDATION_FAILED`; the UI resets to the default audit view instead of preserving an invalid table URL.
- CSV export, retention controls, and retention policy UI are post-MLP dashboard/compliance work. S7 audit rows are append-only and retained indefinitely for the MLP.

### Phase 2 additions

- `/inspection-reports/*` — inspection reports CRUD
- `/rubric` — rubric template editor (versioned)

## Screens / states

| Screen | State | Notes |
|---|---|---|
| Login | OTP entry | Admin-specific look, no marketing chrome |
| Login | TOTP entry | After OTP success |
| Reports | Default | S7 landing page after TOTP elevation |
| Dashboard | Default | Post-MLP overview cards + activity |
| Dashboard | Gateway unhealthy | Post-MLP red banner: "SMS gateway: 2 of 5 phones down" |
| Listings | Default | Table with filters |
| Listings | Filtered to reports | Reports flagged with red badge |
| User detail | Suspended | Red banner + Unsuspend button |
| Broadcast composer | Default | Form + preview |
| Broadcast composer | Targeting all users | Warning: "This will notify {count} users" — require confirm |
| Audit log | Default | Table with filter chips |

## Data references

- `apps/api/src/modules/admin/CONTEXT.md` — audit log, content reports
- All other contexts' admin endpoints

## Decisions

- [ADR-0006](../../adr/0006-auth.md) — Admin OTP + TOTP 2FA
- [ADR-0012](../../adr/0012-multi-device-sessions.md) — Multi-device sessions; old S9 TOTP sequencing superseded by ADR-0027's S7 admin move
- [ADR-0001](../../adr/0001-architecture.md) — Admin operations as their own context
- [ADR-0022](../../adr/0022-city-first-listing-location.md) — City-level location analytics only; no raw GPS in MVP
- [ADR-0023](../../adr/0023-first-party-product-analytics.md) — First-party product analytics for MVP
- [ADR-0027](../../adr/0027-mlp-beta-scope.md) — MLP beta scope; minimal moderation first

## Phase

**Phase 1 MLP beta for minimal moderation.** Full admin dashboard expansion is a post-MLP marketplace bet. Phase 3 adds reports if the trust layer is bet on.

## Out of scope

- Mobile admin (defer indefinitely; desktop is fine for admin workload)
- Admin role hierarchy (super-admin vs moderator) — single admin role for MVP
- Admin account management through moderation — S7 report queue cannot suspend/unsuspend admins or self-moderate; operator runbook/post-MLP admin-account-management handles compromised staff accounts
- Read-only admin accounts (e.g., support team that can view but not modify) — defer
- A/B testing tools — never planned
- Full-fledged CMS (blog editorial workflow) — admins post via the regular blog UI for now

## Open questions

- Should admins be able to impersonate users for support? (High value, high abuse risk — defer)
- Bulk operations (e.g., "ban all listings from this user") — likely needed eventually; when shaped, they use one audit row per target with shared `details.batchId`/`details.batchReason`, not a single bulk audit row with a `targetIds` array
- Admin auth recovery details are owned by [Feature 30 — Identity](./30-identity.md).
- Admin notification preferences for incoming reports — alerts via Telegram via TM Proxy PC (covered in [ADR-0010](../../adr/0010-testing-obs.md)); alert severity should be threshold/computed/admin-set, not reporter-supplied urgency
- Report-spam controls — per-reporter quotas, reporter trust scores, and reporting-rate analytics should be shaped only after beta data shows queue spam across many targets

## Deferred moderation ownership

| Deferred capability | Owner before implementation |
|---|---|
| Assignment/claim queues, SLA filters, escalation, banned-listing/suspended-user queues | Admin dashboard expansion in this PRD |
| Bulk moderation | Admin dashboard expansion in this PRD; audit still writes one row per target |
| CSV export and audit retention controls | Admin/compliance dashboard expansion in this PRD |
| Message reports | [Feature 34 — Conversations](./34-conversations.md) first, then admin queue support |
| Blog/content reports | [Feature 39 — Bortzhurnal](./39-content-blogs.md) first, then admin queue support |
| Reporter-facing status, edit/retract, appeals, support inbox | New trust/support PRD when shaped; this PRD only owns the admin side |
| Per-reporter quotas, trust scores, reporting-rate analytics | [85 — Launch analytics](../ops/85-launch-analytics-plan.md) plus this PRD after beta evidence |
| Admin role hierarchy, deprovision, read-only support accounts | [Feature 30 — Identity](./30-identity.md) plus this PRD; not S7 moderation |


## Proposed dealer and center operations, 2026-10-14

[38](38-showroom.md) proposes manual dealer application/invitation approval, separately from staff membership. [50](50-reports-tier.md) proposes center report preparation, review and authorized release. These capabilities are not implemented or activated by this document revision; material ADR decisions and scoped access contracts must precede execution.

An inspection technician/reviewer is not a full marketplace admin. Reusing this app's UI infrastructure requires a separately authorized layout/API boundary; the current admin layout requires Marketplace Role admin and TOTP. Keep moderation authority, dealer business membership and inspection capabilities distinct. A business owner cannot read buyer-private reports. Define whether review needs a different human, staff elevation, support access/audit and retention before live use.
