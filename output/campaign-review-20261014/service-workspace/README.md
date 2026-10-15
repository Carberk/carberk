# Carberk service workspace prototype

Open `commitments.prototype.html` directly for the final commitment model. Open `index.html` for the original broad workspace. Or run from this directory:

    python3 -m http.server 4887 --bind 127.0.0.1

Then visit http://localhost:4887/commitments.prototype.html. Refresh resets in-memory state. The checked-in directory is `output/campaign-review-20261014/service-workspace` on `prototype/campaign-services-897`.

This throwaway workflow prototype explores the shared operator workspace, Vehicle History requests, General Support and internal vehicle archive. All customers, listings, payment actions and report artifacts are synthetic. Provider eligibility is a manually selected fixture, not a real VIN or provider lookup. The educational sample is a text explanation, not an actual report PDF. No external messages or payment destinations exist.

## Walkthrough

Use the guided walkthroughs below each page. Each button advances one step. Switch between Admin workspace and Customer journey to inspect what each side sees. Use Reset demo to start over. Free-play actions reject several invalid transitions but are not a complete production authorization model.

## Verification on 14 October 2026

Browser-exercised all eight guided scenarios: both-provider delivery, AutoCheck-only delivery, expired booking, failed fulfilment with founder-approved refund, archived-report delivery, Support close/reopen, full capacity and invalid VIN. Checked explicit handover, prior operator blocked, questions without VIN, VIN input through browser controls, missing/malformed VIN blocked before availability, unconfirmed payment before receipt, and report date absent from customer prepayment quote. Inspected 1440px desktop and 1024px tablet layout; no page horizontal overflow in those inspected views. Browser diagnostics showed no console entries. Node syntax check passed. Static Impeccable detector returned no findings, which does not establish accessibility compliance.

## Focused commitment walkthrough

The new `commitments.prototype.html` models the agreed paid FIFO, two-hour payment hold, explicit late-payment rebooking, daily 09:00–20:00 Ashgabat staffing, feasible same-day promises, next-day 10:00 capacity, immediate missed-promise escalation, one consented staffed recovery hour and founder refund decisions. Approval and returned funds are separate states. It also explores handover, own-customer access, founder-only historical payment evidence and permitted dated archive reuse.

Ten guides execute model actions, with free-play controls and visible state. TK/RU/EN apply to the focused page. The original broad workspace remains an earlier English prototype. This model supported the agreed rules without a new product decision. A walkthrough found that preparing during recovery could trigger the original deadline again. The model now preserves the recovery deadline until delivery or expiry.

On 15 October 2026 UTC, still 14 October Eastern time, all ten guides were clicked through and their state inspected after each step. TK recovery and RU late-payment guides were replayed at 1024px without horizontal overflow. The recovery-ready correction was checked through free play: ready at 11:30 stayed ready, expiry at 12:00 entered refund decision, and delivery at 11:30 succeeded. The final browser snapshot had no console or network entries. See [evidence](evidence/README.md). No automated tests were written or run, following the throwaway-prototype skill.

## Deliberate limits

All records and roles are synthetic and visible in page source. There is no real sign-in, security enforcement, upload, PDF, report link, external payment, provider integration or personal-data purge engine. The serial reducer explores orderings, not concurrent database atomicity, worker recovery or purchase idempotency. Two-order capacity is a fixture, not measured staffing throughput or supplier allowance. Calendar arithmetic uses a fixed October fixture. TK/RU/EN strings need production language review. No device or simulator checks were run.

Actual payment reconciliation and refund operations, supplier entitlement and coverage/quota/cost evidence, measured capacity and permitted archive rights remain implementation or launch evidence requirements. Long-term vehicle knowledge does not authorize indefinite private chat/payment retention. Governing proposal approval and implementation planning remain with the parent campaign review. Existing production behavior has not changed.
