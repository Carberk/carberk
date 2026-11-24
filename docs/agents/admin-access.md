# Local Admin access for agents

Use `pnpm admin:access --help` for local Admin preparation and proof. The helper selects explicit local targets, keeps codes out of its output, and leaves authentication to the real browser flow.
It neither creates Users nor changes roles, grants, sessions, quotas or data.

## 1. Select the target and reuse the session

Record the API/Admin owner, worktree and ports. Use the **effective env file of that running API**, including any port/database/key overrides its owner used. A fresh checkout's defaults may describe another database. Preserve another agent's processes and browser session.

```bash
pnpm admin:access check \
  --api http://127.0.0.1:3006/api/v1 --admin http://127.0.0.1:3001 \
  --api-env /absolute/path/to/running-api.env
```

`check` verifies local configuration, API identity/environment/readiness and Admin liveness without spending a code. Add `--purpose vehicle-history` to get the History desk target URL and its scoped login URL. Start at the target page to check for a usable session. Use the scoped login URL when the browser is signed out. Confirm the running Admin's API binding, served revision, actor and elevation in the running UI. Start a missing API through [local testing](local-testing.md#start-only-missing-owned-services).

Follow the [browser proof policy](environment.md#browser-proof-and-service-administration). In T3, call `preview_status`, then use `preview_open` for an owned usable tab when needed; an empty active-tab status alone is not an unsupported-browser result. Open the helper’s returned `loginUrl` with `preview_open({url: loginUrl})`, preserving the **exact** host. The port-based preview target can resolve to `localhost`; if Admin was configured for `127.0.0.1`, its origin check rejects the POST. Verify `location.origin` matches the configured Admin origin before submitting the form. Check the current signed-in identity and target page before requesting a code. Keep a suitable session. Cookies are host-scoped, not port-scoped: parallel Admin ports on the same host can share cookies in one browser profile. Use an appropriately isolated profile/session and coordinate ownership rather than clearing another agent's cookies or silently switching accounts.

## 2. Start only your missing Admin process

Build the workspace dependencies using the [configured runtime prerequisite order](typescript-runtime.md#typecheck-a-fresh-worktree). Then use the tool's background/PTY mode for this foreground command:

```bash
pnpm admin:access serve \
  --api http://127.0.0.1:3006/api/v1 --admin http://127.0.0.1:4301 \
  --api-env /absolute/path/to/running-api.env
```

This starts Admin from the caller's checkout with matching `API_BASE_URL`, `ADMIN_ORIGIN` and explicit port. A busy port refuses; select another owned port. It starts no API/database, performs no migration, and changes no env file. Keep its log private. Run `check` again once it is listening. Stop this owned invocation with Ctrl-C when finished; the helper terminates and waits for its own process group, including Next descendants. TOTP timeouts use the same cleanup so they do not leave database connections behind. Preserve processes you reused.

## 3. Finish the ordinary browser sign-in

Use an existing local actor authorized for the selected flow. The documented shared-local legacy Admin fixture is `+99365000901`; an owned disposable database can have its own explicitly prepared fixture. The helper does not promote an account. For a missing fixture, follow the explicit setup branch below.

1. In the real scoped login form, request a phone code once. For a short backoff, wait for the reported time before making one new attempt. For an exhausted disposable fixture quota, use the [named-runtime reset](environment.md#local-development) before a new attempt. Shared, staging and production sign-ins follow their normal backoff.
2. Read the non-secret request metadata from the current OTP form using the browser tool:

   ```js
   (() => {
     const form = document.querySelector('form[data-otp-request-id]');
     return form ? { requestId: form.dataset.otpRequestId, requestedAt: form.dataset.otpRequestedAt } : null;
   })()
   ```

3. Retrieve only that request's code from the selected API's private log:

   ```bash
   pnpm admin:access otp \
     --api http://127.0.0.1:3006/api/v1 --admin http://127.0.0.1:4301 \
     --api-env /absolute/path/to/running-api.env --api-log /absolute/path/to/private-api.log \
     --phone +99365000901 --request-id <UUID> --requested-at <ISO_TIMESTAMP>
   ```

   The JSON result contains `codeFile`, its private `directory` and `expiresAt`; it contains no code. The directory is owner-only and the file is mode 0600. Read its contents inside tool orchestration and pass them directly to the real code field without printing them into the conversation, command arguments, logs or reports. Use a current snapshot locator. Stop screenshots/recording during code entry. Never choose the latest suffix-matching log entry.

   Clean up using the exact paths returned by this invocation. Unlink the code file first, then remove its empty directory. Recursive shell removal can trigger a separate T3 approval.

   ```bash
   unlink "$code_file" && rmdir "$code_directory"
   ```

4. When Admin shows authenticator verification or its enrollment QR, retrieve the current TOTP from the **same selected API database/key**:

   ```bash
   pnpm admin:access totp \
     --api http://127.0.0.1:3006/api/v1 --admin http://127.0.0.1:4301 \
     --api-env /absolute/path/to/running-api.env --phone +99365000901
   ```

   Fill the authenticator field with the private file using the same handoff and cleanup. The helper waits for a new 30-second window if fewer than 15 seconds remain. If the file expires before input, retrieve a fresh TOTP for the existing browser challenge. The real browser verify action completes pending enrollment and elevates the session.

   For an existing purpose-granted History staff actor, keep the same explicit targets and effective env, and select the browser flow's purpose:

   ```bash
   pnpm admin:access totp \
     --api http://127.0.0.1:3006/api/v1 --admin http://127.0.0.1:4301 \
     --api-env /absolute/path/to/running-api.env --phone <existing-staff-phone> \
     --purpose vehicle-history
   ```

   History purposes are `vehicle-history`, `vehicle-history-payment-evidence`, `vehicle-history-staff-management`, `vehicle-history-refund-decision` and `vehicle-history-refund-execution`. Each requires its exact current nonrevoked, nonfuture grant and an eligible User. Marketplace admin role or another purpose's grant does not substitute. Omitted purpose defaults to `legacyAdmin`, which requires the admin role. Both pending and verified enrollment use the same private-file handoff; only the real browser verification elevates the session.

5. Confirm the intended signed-in actor and target page, then capture proof. Preserve the session for reuse. Close only your preview tab; stop only your owned server. Record worktree/revision, API/Admin origins and observed identity/elevation, with codes/tokens/QR/backup codes excluded.

## Explicit fixture setup, only when missing

For a missing History staff fixture or grant, coordinate separately with its owner through the approved staff setup procedure.
Code retrieval creates no authority; a legitimate History actor needs no marketplace role promotion.

For an agreed local legacy Admin target, create the fixture through ordinary phone sign-in, then run the existing `admin:promote` command against that same explicit local database with a reason. Promotion is a separate, explicit write; it is not part of `check` or code retrieval. Use a fresh sign-in after promotion, respecting `resendInSeconds`, because the older session retains its role. Reaching the QR step establishes pending enrollment; `admin:access totp` can then supply its code. Preserve any active shared fixture owner and coordinate changes rather than replacing Users.

## Owned local History fixtures

The separate `node scripts/history-ui-fixture.mjs --help` entrypoint prepares an explicitly approved, empty local `_ui` database. It does not start services, create/migrate databases or establish resource ownership.
Use the running API's private effective env file (0600 inside a 0700 directory), development/test with mock SMS and disabled code bypasses, and the helper's fixed synthetic actor admission. Phones come from the existing canonical fixture source; there are no actor-selection flags.

```bash
node scripts/history-ui-fixture.mjs init --api http://127.0.0.1:3067/api/v1 --admin http://localhost:3068 --api-env <absolute-private-env> --api-log <absolute-private-log> --expected-db <owned_ui> --reason "Approved initial synthetic fixture"
node scripts/history-ui-fixture.mjs run --api http://127.0.0.1:3067/api/v1 --admin http://localhost:3068 --api-env <absolute-private-env> --api-log <absolute-private-log> --expected-db <owned_ui>
```

`init` requires an empty target and atomically creates only two default buyers, one History grant and an initial-fixture audit. It seeds no Session, TOTP enrollment or elevation, and is not a staff-management workflow.
`run` logs in each fixed client once through ordinary OTP and purpose-specific operator TOTP, then confirms enrollment, elevation, and the expected synthetic operator identity at the protected desk API. It creates populated and empty claimed requests and three operator and fifty requester texts. Tokens remain in process memory.
Wait for its safe summary before entering deliberate stdin stages: `delivered`, then `read` fetch contiguous requester pages before explicit acknowledgement; `unassigned` and `incoming` each permit one ordinary HTTP write.
`facts` reads actual receipt facts through GET only, without acknowledging messages; `quit` ends the client. Client activity proves no native or Admin visibility.
The reported browser eligibility time is a preflight hint. A browser session uses the real forms separately. If the process exits with Node status 13 after printing request IDs, inspect those IDs before running another fixture setup. Older helpers could lose piped commands while authentication was in progress.
Any refusal or uncertain operation stops the invocation. Preserve partial data and inspect the reported stage. If a sign-in quota is exhausted, use the named runtime recovery above for the next deliberate attempt.
The utility removes only code directories returned by the existing private-code helper after use. Stop only your owned runtime processes separately and retain fixture/storage data; the utility owns no service lifecycle.

## Refusals and proof limits

- `API_UNREACHABLE` / `ADMIN_UNREACHABLE`: check the actual origin and owned process. Default ports do not prove a server is running there.
- `API_NOT_READY`: coordinate the failed dependency; do not reset a shared stack to make the check green.
- Target/config mismatch: use the running API's effective env file. Production, remote databases/endpoints, redirects and CI OTP bypasses refuse.
- Missing/stale/ambiguous/superseded OTP: inspect the exact request metadata and selected log. Use the current request if still valid, or make a deliberate fresh request after the applicable backoff.
- `TOTP_UNAVAILABLE`: check the selected purpose's role/grant, User lifecycle, pending enrollment, selected key/database and compiled DB prerequisites. Coordinate missing authority with the fixture owner. Never print subprocess diagnostics that might contain codes or credentials.
- If the old Admin server refused the Next.js security startup check, use the current pinned dependency in a current checkout, with `pnpm install --frozen-lockfile` and a fresh owned Admin process. A browser cookie cannot bring back a stopped listener.
- If the preview reports “The browser is not producing screenshot frames,” its page may still be available. On an owned tab, read the current origin, form state and exact request metadata with the browser's page evaluation capability. Use the supported browser fallback for visual evidence if screenshot frames remain unavailable.

These helpers prove preparation only. Authorization, session rotation, wrong-code handling and expired/revoked elevation still need their real application tests. Staging/production access follows the [environment authority](environment.md); this helper is deliberately local-only and refuses those targets.
