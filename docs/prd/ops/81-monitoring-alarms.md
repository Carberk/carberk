# 81 - Diagnostics, service health and incident evidence

Draft for #602/#604/#607/#608, 2026-10-14. Approved planning is distinct from implemented or deployed evidence. ADR-0010 retains the self-hosted diagnostics/metrics/logs direction; this specification stages it and defines the pilot evidence without changing its testing policy.

## Phases and service boundary

First Google Play reviewer submission remains Railway-only with existing logs/readiness/manual reviewer-flow checks. It does not wait for connected GlitchTip, product analytics or TM VPS. Monitoring follows on Railway using synthetic/reviewer/test data. Real-user telemetry needs its applicable collection/storage/transfer/rights evidence and verified native build. TM real users remain behind actual cutover/core readiness under ADR-0039 as scoped by the proposed hosting amendment.

Selected diagnostics are self-hosted GlitchTip. Prometheus/Grafana health and approved log collection follow existing self-hosted policy, provisioned only for admitted phase services. Do not represent old Server B Compose, missing exporters or placeholder worker jobs as running capabilities. No Sentry/PostHog managed purchase is assumed. Pin compatible versions and prove deployment settings; no default admin credentials or unbounded `latest` images in an accepted deployment artifact.

Product events and diagnostics share collection/exclusion/identity/lifecycle rules from 85 but stay separate datasets and purposes. No replay/autocapture/profiling or full request-body capture. Scope logs by retention/purpose; never route all existing logs or internal domain events blindly into diagnostics. Public legal disclosures reflect actual SDK fields and actual hosting/egress.

## Capture and delivery contract

| Component | Required pilot proof |
|---|---|
| Mobile | Controlled JS failure and native crash in the exact instrumented release build, readable symbolicated stacks, release/build/environment attribution, native symbol/source-map artifact association and restart/offline delivery evidence |
| API | Controlled sanitized exception plus ordinary expected validation failure; exception arrives, expected rejection stays classified separately; request correlation safe and bounded |
| Worker | Controlled retryable failure and recovery, sanitized job type/attempt/category and release attribution; heartbeat/stalled queue distinct from API uptime; do not emit payload contents |
| Admin | Controlled server/client failures through actual browser boundary; no browser API token leakage; production remains within ADR-0090's single-instance constraint |
| Web | Controlled failure and release attribution without capturing legal/deletion form entries or visitor identifiers beyond an approved purpose |

Prefer a Carberk-controlled diagnostics ingest/relay path. Implementation must demonstrate SDK/native compatibility and field-level stripping before durable storage or egress; GlitchTip's Sentry-protocol compatibility alone does not prove this Expo build. Exact SDK transport, offline crash behavior and symbolication follow installed-major official documentation and executable proof. Failure to prove native crash delivery is a real gate, not waived by readable JS errors.

Check SDK-added device data, user/context, breadcrumbs, URLs, HTTP bodies/headers, IP inference and native attachments. Disable unwanted integrations by construction and inspect collected payloads. Use normalized route template, safe error category and generated/bounded trusted correlation ID, not arbitrary request header contents. No Message text, private evidence, photos/video, storage keys, signed URLs, contact values, OTPs, tokens, coordinates or entered free text. Allowlist release/build/platform/OS/coarse device/locale/connection/action/timing only where necessary. Any unredactable required SDK field returns to the founder before enabling that integration.

Inspect pre- and post-ingestion fixtures for prohibited canary values. Error messages and stack locals may contain user input; sanitize them, avoid attachment/raw payload capture and prevent source artifacts or internal stack details from becoming public. Source maps/native symbols are restricted deployment artifacts, not public website files.

## Health, alerts and isolation

Use API /healthz and bounded dependency /readyz, admin/web health where present, plus a real worker heartbeat and admitted queue/backlog signals. A watchdog outside the affected application process checks at least every 60 seconds; do not depend solely on the worker to discover its own death. Probe alerts and delivery service health are separate checks. No new third-party uptime account is implied.

Keep inherited phase-applicable thresholds: API technical error rate >5% for five minutes; API p95 >2 seconds for ten minutes; queue depth >100 for ten minutes; disk free <10%; TLS expiry <14 days. Suppress invalid rate interpretation when traffic denominators are too small, but never suppress an independently confirmed outage. TM replica/phone thresholds apply only when those components are deployed/proven. Synthetic pilot tests verify routing without pretending a tiny sample estimates reliability. Reconcile inconsistent old operational thresholds in implementation review rather than deploy both rule sets.

Deduplicate/fingerprint sanitized errors, rate-limit ingress and processing, bound pending/failed jobs and rotate logs. Set explicit CPU/memory/disk/retention limits for collector/web/worker components and their databases; enforce them in the actual runtime, not just unverified Compose syntax. Reserve core application headroom. Pilot caps must fit the agreed budget after measurement. A controlled error burst proves collector saturation/drop counters do not starve core auth, publish, chat or database. Collector overload drops diagnostic work within limits and alerts; it never automatically disables core service.

Planning Railway total USD50-75/month with provisional ceiling USD100, including incremental monitoring USD15-25. TM total infrastructure provisional ceiling 8,000 TMT/month, including monitoring/storage/backups. These are planning estimates, not invoices or spending approvals. Warn at 80% projected ceiling, show resource/storage trend and oldest backlog/retention lag. Never automatically cut off core workloads at a budget threshold. Actual provider/storage/backup quote and measured resource sizing precede new paid provisioning.

## Human response

Founder is sole responder; no backup is assigned. Staffed Monday-Friday 08:00-20:00 Asia/Shanghai; weekends best effort. Urgent acknowledgment target 30 minutes and investigation start within one hour during coverage. No claim of 24/7 staffed response. Preserve alert timestamps outside staffed hours; do not fabricate response or reset incident age when coverage resumes.

Telegram is preferred only after verified delivery. Test from the actual phase topology and record harmless alert send, founder receipt and acknowledgment. Railway and TM egress configurations differ; Proxy PC availability does not route customers' device traffic. No new automatic pause/rollback/deploy authority. Alerts link sanitized evidence and the existing issue workflow. Daily error triage and weekly product review assign owned fixes; only a responsible human verifies fixes and chooses recovery actions.

The planned trusted TM handler owns agreed physical/equipment/connectivity work only after identity, access and capability are proven. The role is not an incident backup, diagnostic viewer or qualified inspection mechanic by default. No public invitations/messages are sent through this scope.

## Retention and recovery

Individual diagnostics expire after 30 days; approved non-identifying error/release aggregates after 24 months. The separately qualified durable anonymous vehicle/market dataset in 85 does not extend diagnostic or actor-linked retention. Product raw retention is 90 days under 85. Track purge failures/lag, including collector data, attachments and backups. Short-lived telemetry stays out of year-long core archives. No indefinite raw logs or diagnostic queue retention bypasses the field/retention contract.

On deletion request immediately stop linked collection and purge linked raw diagnostics/identity mappings; old queues and late envelopes must not resurrect them. Reapply eligible deletions before restored data is served. Retention and recovery copies respect lifecycle; inability to selectively delete from a chosen diagnostic system is a design blocker requiring an approved alternative.

Pilot recovery target: at most 24 hours of core data loss and restoration within four staffed hours after declared incident, measured by a drill. These are internal pilot targets, not a public SLA. Backups must be consistent across admitted database/media dependencies; record snapshot/restore timestamps, operator, restored revision, verification and loss window. A backup command succeeding alone does not demonstrate restore.

## Acceptance evidence

Record candidate SHA/build, environment, date/operator, sanitized artifacts, expected/actual results, uncertainty and gate status. Required before real users:

1. Exact native build controlled JS/native failure receipt and readable stack, correct release attribution, offline retry/restart behavior and no prohibited metadata.
2. Controlled API/worker/admin/web failure capture and distinction from ordinary expected failure.
3. Core app flows usable while telemetry endpoint fails, queues saturate or retention jobs lag.
4. Independent outage/stalled-worker detection, safe test alert receipt/acknowledgment, dedupe/repeat routing and collector failure signal.
5. Enforced resource/error-storm limits and projected costs within approved operational provisioning, with no starvation of core requests.
6. Retention, immediate collection stop, deletion/late-event/restore suppression and audited access denial fixtures.
7. Applicable admitted-region disclosures/rights and representative-network API/media/legal/telemetry evidence. Only phase-admitted regions gate that phase; unresolved longitudinal collection stays deferred as accepted.
8. Recovery and existing phase-applicable rollback/feature-pause/moderation drills, with actual human control and accepted solo coverage.

Chief of Staff assembles one combined candidate, runs one consolidated final native acceptance campaign and obtains deployed evidence under staging reservation. A screenshot, Compose file, vendor support statement or closed factual-research ticket is not proof of any gate. New paid resources, TM provisioning/cutover and store submission remain separate actions.
