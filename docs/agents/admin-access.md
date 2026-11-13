# Local Admin access for agents

Use `pnpm admin:access --help` for local Admin preparation and proof. The helper selects explicit local targets, keeps codes out of its output, and leaves authentication to the real browser flow. It neither creates Users nor changes roles, grants, sessions, quotas or data.

## 1. Select the target and reuse the session

Record the API/Admin owner, worktree and ports. Use the **effective env file of that running API**, including any port/database/key overrides its owner used. A fresh checkout's defaults may describe another database. Preserve another agent's processes and browser session.

```bash
pnpm admin:access check \
  --api http://127.0.0.1:3006/api/v1 --admin http://127.0.0.1:3001 \
  --api-env /absolute/path/to/running-api.env
```

`check` verifies local configuration, API identity/environment/readiness and Admin liveness; it spends no code. It does not establish which API a pre-existing Admin process actually uses, browser identity, TOTP elevation or served revision. Confirm those with the owner and running UI. A missing API is started through [local testing](local-testing.md#start-only-missing-owned-services); readiness failure is not permission to reset/reseed shared data.

In T3, call `preview_status`, then use an owned tab with `preview_open`. Open the helper’s returned `loginUrl` with `preview_open({url: loginUrl})`, preserving the **exact** host. The port-based preview target can resolve to `localhost`; if Admin was configured for `127.0.0.1`, its origin check rejects the POST. Verify `location.origin` matches the configured Admin origin before submitting the form. Check the current signed-in identity and target page before requesting a code. Keep a suitable session. Cookies are host-scoped, not port-scoped: parallel Admin ports on the same host can share cookies in one browser profile. Use an appropriately isolated profile/session and coordinate ownership rather than clearing another agent's cookies or silently switching accounts.

## 2. Start only your missing Admin process

Build the workspace dependencies using the [configured runtime prerequisite order](typescript-runtime.md#typecheck-a-fresh-worktree). Then use the tool's background/PTY mode for this foreground command:

```bash
pnpm admin:access serve \
  --api http://127.0.0.1:3006/api/v1 --admin http://127.0.0.1:4301 \
  --api-env /absolute/path/to/running-api.env
```

This starts Admin from the caller's checkout with matching `API_BASE_URL`, `ADMIN_ORIGIN` and explicit port. A busy port refuses; select another owned port. It starts no API/database, performs no migration, and changes no env file. Keep its log private. Run `check` again once it is listening. Stop this owned invocation with Ctrl-C when finished; preserve processes you reused.

## 3. Finish the ordinary browser sign-in

Use an existing local admin fixture. The documented shared-local admin is `+99365000901`; an owned disposable database can have its own explicitly prepared fixture. The helper does not promote an account. For a missing fixture, follow the explicit setup branch below.

1. In the real `/login` form, request a phone code **once**. On refusal/rate limit, retain the error and wait for the applicable backoff; never clear quotas or request again just to repair automation.
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

   The JSON result contains `codeFile`, its private `directory` and `expiresAt`; it contains no code. The directory is owner-only and the file is mode 0600. Read its contents inside tool orchestration and pass them directly to the real code field without printing them into the conversation, command arguments, logs or reports. Use a current snapshot locator. Stop screenshots/recording during code entry. Remove this returned directory after use. Never choose the latest suffix-matching log entry.

4. When Admin shows authenticator verification or its enrollment QR, retrieve the current TOTP from the **same selected API database/key**:

   ```bash
   pnpm admin:access totp \
     --api http://127.0.0.1:3006/api/v1 --admin http://127.0.0.1:4301 \
     --api-env /absolute/path/to/running-api.env --phone +99365000901
   ```

   Fill the authenticator field with the private file using the same handoff and cleanup. The existing TOTP helper also supports completing pending enrollment; the real browser verify action performs it. If the window is ending, generate a new TOTP after the boundary rather than sending an expired code. Never inject tokens/cookies, skip TOTP or use CI code-return flags for UI preparation.

5. Confirm the intended signed-in actor and target page, then capture proof. Preserve the session for reuse. Close only your preview tab; stop only your owned server. Record worktree/revision, API/Admin origins and observed identity/elevation, with codes/tokens/QR/backup codes excluded.

## Explicit fixture setup, only when missing

For an agreed local target, create the fixture through ordinary phone sign-in, then run the existing `admin:promote` command against that same explicit local database with a reason. Promotion is a separate, explicit write; it is not part of `check` or code retrieval. Use a fresh sign-in after promotion, respecting `resendInSeconds`, because the older session retains its role. Reaching the QR step establishes pending enrollment; `admin:access totp` can then supply its code. Preserve any active shared fixture owner and coordinate changes rather than replacing Users.

## Refusals and proof limits

- `API_UNREACHABLE` / `ADMIN_UNREACHABLE`: check the actual origin and owned process. Default ports do not prove a server is running there.
- `API_NOT_READY`: coordinate the failed dependency; do not reset a shared stack to make the check green.
- Target/config mismatch: use the running API's effective env file. Production, remote databases/endpoints, redirects and CI OTP bypasses refuse.
- Missing/stale/ambiguous/superseded OTP: stop without resending; inspect the exact request metadata and selected log. A new request needs the normal backoff and a deliberate fresh sign-in attempt.
- `TOTP_UNAVAILABLE`: check local fixture role, pending enrollment, selected key/database and compiled DB prerequisites. Never print subprocess diagnostics that might contain codes or credentials.

These helpers prove preparation only. Authorization, session rotation, wrong-code handling and expired/revoked elevation still need their real application tests. Staging/production access follows the [environment authority](environment.md); this helper is deliberately local-only and refuses those targets.
