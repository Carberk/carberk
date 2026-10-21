# Full-v3 contact sender/reset test preparation

TEST-ONLY writer for #901 under #897/PR904. Exact base `45a5be4cb43c6c61873117bf2201135efb763ec2`. Reused T3 checkout `/Users/bagtyyar/.t3/worktrees/carberk/t3-368c31ae`; preserved scaffold `t3/issue-901-contact-sender-reset-tests` at base. Reserved/pushed `agent/issue-901-v3-contact-sender-reset-tests-20261020` before edits. Root owns assembly and GitHub execution records. No PR, children/reviewers, services, database, integration execution, Docker, CI dispatch/poll, staging or provider operation.

## Scope and budgets derived before writing

Exactly two fresh cases, appended after all 24 existing cases. Reservations `e2` repeated sixteen times and `e3` repeated sixteen times were absent from every existing case. Independently derived literal destinations are `+99369944528` and `+99366905843` for candidate `a` repeated forty times. Existing normal HTTP contact case remains the route proof. These scheduling supplements use real PrismaOtpRequestRepository, actual OtpCode.generate and real HttpOtpSenderAdapter with the exact reserve-returned smsDelivery object. No carrier, authentication, proof or OTP rows are fabricated.

Each reservation separately uses this literal accounting, inspected before editing. Bootstrap 21 records/21 events; coordinator sign-in and first TOTP add 13/17; support sign-in, first TOTP and one founder.admission grant add 15/19; buyer-a sign-in adds 2/4; admission adds 3/3; redemption adds 2/4. Totals before reserve are 56 records/68 events. One unused contact reserve adds 1/1, yielding 57/69. No consume, confirmation, wrong attempt, resend or extra grant/session occurs. Reset deletes 52 non-audit records and redacts five audits, adding 57 events for terminal 57 records/126 events. Retry adds zero. Each case asserts 56/68, 57/69 and 57/126 literally. Headroom is 71 records and 1922 terminal events under unchanged 128/2048 guards.

Protected storage separately has one SMS binding and one ledger entry, with at most one sink entry in sender-first and zero in reset-first; disposal retains binding, ledger and hashes with zero rendered sink entries. Three ordinary email deliveries use existing exact-ID worker/ledger/tombstone cleanup; combined four delivery authorities remain below 128. Each case has 16 ordinary HTTP requests, three existing email worker children, one fixture and three reset invocations including finally cleanup. Sender-first additionally runs the same reset harness in one owned Node worker thread so synchronous SQL transport does not block the sender event loop. Its existing bounded SQL/Redis child commands are unchanged. No queue enumeration or drain.

## Scheduling and assertions

Sender-first holds SHARE on only the exact private SMS sink table, then starts real send. Bounded fresh pg_locks/pg_blocking_pids observations require a RowExclusiveLock waiter on that table, directly blocked by the known barrier PID, holding the exact single-bigint namespace advisory fence. Only then starts the real reset operator through the same existing operator/transport harness. A second bounded observation requires reset's ungranted exact namespace fence directly blocked by the sender PID. Release the sink barrier, require sender success and reset success. Namespace exclusion proves durable send commits before reset obtains its fence; callback scheduling is not used as the order proof. No public row/table lock is added to sender.

Reset-first captures committed reserve and delays all sender invocation until reset succeeds and exact OTP/User absence is asserted. Both cases create an unrelated fresh scalar Dealership using the released phone, then invoke the original carrier and require terminal refusal. They compare binding/ledger and stable manifest contract hashes, terminal journal digest, sink absence, exact job absence, full owned graph disposal, identical terminal retry, foreign control and fresh scalar reuse survival. The logger is observed at its external output boundary with output suppressed, never used to recover a code; no application provider/repository/sender is mocked. Real sender refusal prevents its gateway/logger fallback. No provider transport is enabled.

Finally releases the private barrier before settling every sender/reset promise, waits for the worker's natural exit after its existing synchronous children, closes the owned SQL connection, restores logger observation, checks only known SMS job IDs and removes exact foreign/reuse artifacts before existing reset/known-email cleanup. The sender transaction releases its advisory lock by settlement. No PID scan/termination or child kill is needed on the normal path.

## Evidence and limits

Preparation checkpoint. Offline verification receipts will be appended after checks finish. Source SQL remains unexecuted/UNKNOWN. No prior sender/reset RED, runtime ordering, GREEN, universal producer isolation or operational activation is claimed. The source handoff's existing offline results are not this writer's results.

The first possible reached barrier remains fixture SQL and ordinary authentication/TOTP/grant/admission/redemption setup, including the unchanged global baseline guard. Real reserve then must return the campaign carrier. Serving AUTOTM_COMMIT_SHA must already equal the selected candidate; this test asserts the prerequisite and never enables it. Failure there is a documented setup gap, not race RED. Sender-first's first ordering barrier is the real sink INSERT holding its namespace fence; reset-first's is actual successful disposal plus exact OTP/User absence. Hosted execution belongs to root on the assembled candidate. The supplied base's pending CI is untouched.

Wider collisions, malformed/missing storage/carriers, lost sink responses, expiry/resend, Sales/wrong-purpose, suspended/deleting/stale-session paths, fresh phone authentication and pre-preparation ordinary producer draining remain outside these two cases. Scalar Dealership reuse proves only scalar reuse. The selected plan's deployment gate remains effective.

Docs: no external lookup needed; this reuses checked-in SQL lock observations, operator transport and Identity interfaces. No dependency or service contract changes. Only the spec and this new handoff are owned. Stop after push and handoff.

## Hosted setup evidence

Root reports hosted run `API118967370288`, run `39521844904`, on base `45a5be4c`. Full-v3 reached 21/24, with all four coordinator cases and the original 17 passing. The contact request now commits its reservation, then real `HttpOtpSenderAdapter.send` refuses at initial validation before its namespace fence because the fixture remote process had `AUTOTM_COMMIT_SHA` set to candidate `a` repeated forty times while the real API suite never configured that variable; `SMS_DRIVER` was also not explicitly set to `mock`. The unchanged contact case then fails its digest-preservation branch because the committed reservation correctly remains counted after delivery failure. This is a suite setup mismatch, not a product verdict for the later contact flow. The hosted log is `/tmp/carberk-next-release-20261020/45a5be4c/api.plain.log`, lines 2429-2437.

This checkpoint fixes only that setup mismatch in `beforeAll`/`afterAll`: it saves and restores `AUTOTM_COMMIT_SHA`, `SMS_DRIVER` and `OTP_TEST_MODE`, sets the exact fixture candidate and explicit mock driver before real module construction, and leaves all 24 case bodies unchanged. The two scheduling cases continue to use the real carrier and require the same serving-candidate prerequisite.

## Offline receipts for this checkpoint

- `node /tmp/issue901-sender-reset-compare.cjs`: passed. It found 24 original `it` calls byte-identical, 26 final calls, preserved the 125497-byte original helper/case block (SHA-256 `16069a2c42cec07d24ea8897db7b0393cacb7412700ee5179346a489f8d82b0a`), and parsed the embedded reset worker JavaScript without executing it.
- `pnpm --filter @auto-tm/api typecheck`: passed (TypeScript 7).
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`: passed (TypeScript 6).
- `pnpm --filter @auto-tm/api exec eslint src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts --max-warnings 0`: passed.
- `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest list src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts`: passed static collection, 26 cases listed, no hooks executed.
- `pnpm check:agent-docs`: passed. `git diff --check`: passed.
- The first offline DB build attempt ran before the contracts output existed and reported only the pre-existing workspace declaration gap; contracts were built, then the configured API checks above passed. No database or service was contacted.

Final pushed checkpoint after the environment correction: `50057052` (subsequent test-only assertion tightening is pending this final push). Working tree is clean after that push requirement is satisfied by the next commit. Hosted sender/reset ordering, SQL compilation, HTTP contact GREEN and all downstream verification remain UNKNOWN.
