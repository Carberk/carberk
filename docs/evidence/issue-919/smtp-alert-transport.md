# Operational SMTP alert transport

This adapter is for error monitoring only. Sign-in email and OTP remain on the existing Resend driver. No production or staging activation, real send or credential operation was performed by this implementation writer.

## Runtime configuration

Set server-only variables on the separate watchdog service, never the API, web, mobile or OTP service. The default is closed. Existing `OPERATIONS_ENABLED=true`, `REDIS_URL` and a deployment-specific `OPERATIONS_SCOPE` are prerequisites for running the watchdog. Exactly one active watchdog owns a scope. Receipt updates are not a distributed lock for parallel watchdog replicas.

| Variable | Value |
|---|---|
| `OPERATIONS_ALERTS_ENABLED` | `true` only for explicitly authorized acceptance or operation |
| `OPERATIONS_ALERT_TRANSPORT` | `smtp`, otherwise defaults to the existing `http` route |
| `OPERATIONS_SMTP_HOST` | `smtp.gmail.com`, also the default and only permitted host |
| `OPERATIONS_SMTP_PORT` | `465`, also the default and only permitted port |
| `OPERATIONS_SMTP_USER` | `tkmdevelopers@gmail.com` |
| `OPERATIONS_SMTP_FROM` | `tkmdevelopers@gmail.com` |
| `OPERATIONS_SMTP_TO` | `bagtyyarkowusow.dev@gmail.com`, one recipient only |
| `OPERATIONS_SMTP_APP_PASSWORD` | Supply through the watchdog service's secret store. Never place its value in files, shell history, evidence, commands, screenshots or logs. |

Neither setting SMTP variables alone nor selecting a transport enables alerts. Turning `OPERATIONS_ALERTS_ENABLED=false` closes SMTP without changing OTP. SMTP and HTTP are exclusive. SMTP configuration errors and delivery failures never expose provider responses or credential input. Do not print the parsed configuration or enable SMTP protocol logging.

Implicit TLS verifies the peer chain and `smtp.gmail.com` hostname, with TLS 1.2 minimum. Authentication happens only after a verified handshake and is required before MAIL, including when the server omits its AUTH capability. There is no plaintext fallback, custom CA, alternate host, alternate port or TLS-verification override exposed through environment variables. An absolute three-second socket deadline covers connection, TLS, authentication and SMTP delivery. File/URL access and logging are disabled. Each message has a fixed subject, sender, single recipient, stable transition Message-ID and a plain-text JSON body. Only strict ISO timestamps and allowlisted incident/probe states are included. No attachments, customer content, identities, request data, queues, tokens, endpoints or provider errors enter the body.

## Receipts, retry and recovery

The watchdog uses `operations:<scope>:smtp-alert-receipt`, independent of the existing HTTP receipt. It stores only a bounded transition, attempt count, next attempt time and delivery boolean with a 30-day TTL. No mail payload or error body is queued. A malformed or unavailable receipt fails closed. Each attempt must be durably reserved before SMTP egress.

The watchdog ticks every 30 seconds. Each retained transition permits at most three attempts, with minimum retry delays of 30 and 60 seconds after the first and second failures. Restarts preserve the attempt budget and delay. There is one in-flight attempt per adapter. Successful SMTP acceptance plus persisted acknowledgment suppresses repeats across restart. A resolved incident has a separate transition and attempt budget, so recovery remains deliverable after opening-alert exhaustion. Only the latest incident transition is retained, matching the existing sink. A newer transition replaces an older pending transition; this is not an outage history or payload queue.

SMTP acceptance means the SMTP server accepted the message, not inbox delivery or founder acknowledgment. A crash or receipt-save failure after SMTP acceptance can produce a duplicate on retry. The stable Message-ID helps correlate it but cannot guarantee recipient-side deduplication. Reserving attempts before sending bounds ambiguous retries to three. While the receipt is retained, exhaustion has no automatic reset or replay. As with the existing HTTP receipt, state expires 30 days after its last save. Expired or lost state no longer proves prior delivery, so a later observation can start another bounded attempt budget. An authorized operator investigates the route and chooses a fresh synthetic incident for acceptance. Do not erase receipts to manufacture successful dedupe evidence.

## Secret rotation and controlled acceptance

Root owns real credential configuration and acceptance under the staging reservation workflow. Google App Passwords require account 2-Step Verification. Use a dedicated app password for this monitoring route.

1. Set `OPERATIONS_ALERTS_ENABLED=false` on the watchdog and stop/redeploy that service so no old attempt remains in flight. Preserve scope and receipts.
2. The credential owner creates a replacement Google app password and replaces only `OPERATIONS_SMTP_APP_PASSWORD` in the watchdog secret store. Keep values out of evidence and terminal arguments. Never reuse it for OTP.
3. Restart the watchdog with alerts still closed. Confirm valid startup from static logs. Then reserve staging and follow its controls before enabling and sending a harmless synthetic incident from the intended topology.
4. Record candidate SHA, scope/environment, UTC time, expected opening and recovery, sanitized SMTP acceptance, actual recipient receipt and founder acknowledgment. Verify repeat and restart suppression. Provider acceptance alone does not close #919/#920.
5. Revoke the prior app password in Google account settings after replacement acceptance. If compromise is suspected, revoke it immediately, keep alerts closed and perform replacement acceptance before reopening.
6. Close alerts if acceptance fails. Preserve receipts, restore the staging baseline and release its reservation. Changing the secret or route never authorizes production activation.

Gmail can block new server locations and enforce account sending limits. Failures consume the bounded attempt budget. They do not change core service availability or trigger deployment, rollback or feature pauses.

## Implementation evidence

Base: `ef85f17f308a36cf7a7c8e8c45717d45b534f864`. RED checkpoints: `66a99b16` rejects the valid SMTP route in existing configuration; `82203444` executes the protocol assertions against the closed adapter and fails delivery/retry/concurrency expectations; `6c7fc44d` records the failing date-shaped private-content regression after the protocol implementation. `6a4d5ff5` records a missing-AUTH-capability regression: the library otherwise attempts unauthenticated mail. Each checkpoint was pushed before its fix.

The local fixture uses generated disposable TLS certificates, a Gmail-like SMTP conversation and synthetic credentials only. It covers verified TLS authentication, untrusted chain and hostname denial before AUTH, failed authentication and missing AUTH capability, recipient rejection, persistent retry limits/delay, successful restart dedupe, recovery, unavailable/corrupt storage, pre-egress receipt-save failure, bounded ambiguous acceptance after acknowledgment-save failure, stable Message-ID, concurrent suppression, silent-server timeout, slow DATA acknowledgment deadline and payload minimization. This is adapter evidence, not real Gmail or deployed acceptance.

| Criterion | Evidence | Result |
|---|---|---|
| Explicit closed configuration and fixed recipient | `OperationsSmtpConfig.spec.ts` | pass |
| Real SMTP protocol, verified TLS before AUTH, rejection and timeout | `SmtpAlertSink.spec.ts` local TLS fixture | pass |
| Restart dedupe, bounded durable attempts and recovery | Same adapter with a persistent storage-boundary fixture | pass |
| Private fields/date-shaped content excluded, errors redacted | Local SMTP message inspection, strict-date regression and static error/log policy | pass |
| OTP remains Resend; existing HTTP semantics preserved | Unchanged OTP source, existing `AlertSink.spec.ts` and worker unit suite | pass |
| Real Gmail receipt and deployed topology acceptance | Root under a staging lease | pending, deliberately outside this writer's authority |

Docs: https://nodemailer.com/smtp/ verifies implicit TLS, hostname/chain validation, socket provider, timeouts and file/URL/log restrictions. https://nodemailer.com/guides/using-gmail verifies App Password prerequisites, Gmail From rewriting, location blocks and sending limits. https://github.com/nodemailer/nodemailer/blob/v10.1.2/CHANGELOG.md records SMTP connection/deadline and message-work hardening. Nodemailer 10.1.2 is pinned in worker only, published 2026-10-16; its recent fixes justify selecting it over an older stable version. Registry metadata requires Node >=20, compatible with this workspace's Node >=22.13.0; no peer dependencies. Bundled declarations were read and both workspace TypeScript compilers check the adapter. Only worker package.json and the generated pnpm lockfile change for the dependency; no workspace/global configuration changes.

Final writer verification: focused config/SMTP/existing HTTP tests passed, 13 tests in three files. The full worker unit suite passed, 284 tests in 38 files. Worker TypeScript 7 typecheck, TypeScript 6 `tsc6 --noEmit`, workspace lint and Nest build passed. The built SMTP adapter loaded under CommonJS. Runtime-import and agent-documentation guards passed, and `git diff --check` was clean. Logs are retained under `/tmp/carberk-smtp-*.log` in this host session. Exact assembled-candidate repository gates, independent reviews, hosted disposable-service evidence and reserved real SMTP acceptance remain assembly/root responsibilities.
