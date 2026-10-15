# Carberk service workspace prototype

Open index.html directly, or run:

    python3 -m http.server 4877 --bind 127.0.0.1 --directory /tmp/carberk-service-prototype

Then visit http://localhost:4877/. Refresh resets the in-memory state.

This throwaway workflow prototype explores the shared operator workspace, Vehicle History requests, General Support and internal vehicle archive. All customers, listings, payment actions and report artifacts are synthetic. Provider eligibility is a manually selected fixture, not a real VIN or provider lookup. The educational sample is a text explanation, not an actual report PDF. No external messages or payment destinations exist.

## Walkthrough

Use the guided walkthroughs below each page. Each button advances one step. Switch between Admin workspace and Customer journey to inspect what each side sees. Use Reset demo to start over. Free-play actions reject several invalid transitions but are not a complete production authorization model.

## Verification on 14 October 2026

Browser-exercised all eight guided scenarios: both-provider delivery, AutoCheck-only delivery, expired booking, failed fulfilment with founder-approved refund, archived-report delivery, Support close/reopen, full capacity and invalid VIN. Checked explicit handover, prior operator blocked, questions without VIN, VIN input through browser controls, missing/malformed VIN blocked before availability, unconfirmed payment before receipt, and report date absent from customer prepayment quote. Inspected 1440px desktop and 1024px tablet layout; no page horizontal overflow in those inspected views. Browser diagnostics showed no console entries. Node syntax check passed. Static Impeccable detector returned no findings, which does not establish accessibility compliance.

## Deliberate limits

No real sign-in, uploads, PDFs, report links, external payments, provider integration, retention implementation or localization. Demo staff permissions and capacity counters are illustrative. FIFO queue enforcement, late-payment reconciliation, specific delayed-delivery agreement, closing-hour scheduling, deadline escalation and real throughput still need fuller modeling before implementation. Existing production chat/admin behavior has not changed.

Launch facts still needed: workable payment/return process, supplier account and coverage/quota evidence, and reconciliation of indefinite personal-data retention with current deletion policy. Prototype review precedes canonical PRD/ADR updates and implementation issues.
