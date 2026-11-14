# Native fixture sign-in

Implementers and Sol UI reviewers **must use `pnpm native:signin` for ordinary signed-in UI preparation**, reusing the appropriate fixture session first. This is setup, not auth acceptance evidence. Dedicated sign-in, auth-intent and permission tests exercise the real entry/action flow. The running native app and required UI screenshots remain mandatory.

## Prepare one owned device

1. Run the [canonical read-only readiness check](local-testing.md#1-check-and-reuse-the-local-baseline) with the selected API and worker env files and explicit existing owner/denial-account mappings. Keep its rich baseline/media versions and local target in the proof record; it does not establish device identity or the served bundle. Start sign-in with `--reuse-only`, using that API's private mock log. Confirm the installed app is running your intended Metro bundle with the same local API origin. The helper checks the API config and live environment; it cannot identify which Metro bundle an already installed app loaded.
2. Coordinate a single free iOS 26.2 simulator. In T3, call `device_list`, then `device_open` with its host and ID. Use only its returned `agent-device` command. A held device is a blocker; preserve its owner and session. Do not boot extra devices to work around contention.
3. Read `help open`, `help snapshot`, `help fill` and `help press` using that exact command on your session. Open the app with that command before reading its UI. Stop on device errors and follow the documented advice once; repeated failure requires a handoff, not a new session or alternate driver.
4. Put the returned bound executable alone in a JSON array in `/tmp/owned-device.json`, together with `worktree` (your absolute checkout path), `session` and `deviceId` from that command. The T3 wrapper already carries the target/session flags; do not add them. This is structured process input, never shell text. For example, its shape is:

```json
{
  "worktree": "/absolute/path/to/your/worktree",
  "session": "YOUR_DEVICE_OPEN_SESSION",
  "deviceId": "YOUR_SELECTED_DEVICE_ID",
  "command": ["/absolute/path/to/device/targets/YOUR_DEVICE_OPEN_SESSION/agent-device"]
}
```

The helper never selects, boots, closes, resets or takes over another device. All UI operations compose the caller's command with argument arrays, sequential fresh snapshots and current field refs. It passes code text over stdin when an editable field is exposed. For the transparent iOS OTP input, it uses the focused native number pad with fresh semantic key selectors and digit readback; it stops if focus, selectors or readback change. It suppresses action recording and captures command output in memory so code entry never becomes a saved report. Keep screenshots and recordings off during code entry; take proof only after the code screen has gone.

At handoff, use your own bound command's documented `close` first and confirm `Closed: <your-session>` with exit 0, then close the T3 device panel with `device_close`. Closing only the panel can leave the native automation lock held. Preserve the app's signed-in data: closing automation needs no logout, reset or app reopen. Never close another owner's CLI session or change its locks.

## Reuse, then sign in

```bash
pnpm native:signin --fixture seller \
  --api http://127.0.0.1:3006/api/v1 \
  --api-env /absolute/path/to/running-api/apps/api/.env \
  --api-log /tmp/your-api-3006.log \
  --device-command-file /tmp/owned-device.json
```

Use `buyer` for the buyer fixture. Add `--reuse-only` to inspect without requesting any code. Cabinet must show the fixture's Display Name and masked Sign-in Method; success reports `identityConfirmed: true`. A different identity or an unreadable/loading screen stops setup; choose an appropriate owned device or deliberately sign out through normal UI before trying again. Never silently switch an account to get a screenshot.

If signed out, the helper issues one API request, matches its returned request ID and the chosen fixture in that API's dated mock log, opens the existing OTP route with `method`, `destination` and `resendInSeconds`, and enters the code in its real native field. The app's normal verification stores the session. The helper never calls verification itself or reads/injects tokens. It then confirms the fixture identity in Cabinet. Preserve the signed-in app data for the next run.

For a code already requested through the real entry flow, add both:

```text
--request-id FULL_UUID_FROM_THAT_SUCCESSFUL_REQUEST --requested-at ISO_TIMESTAMP_OF_THAT_REQUEST
```

This retrieves that exact code and delivers it to the currently focused genuine verification UI without issuing another request or navigating away from its auth intent first. If a successful request is followed by a UI failure, the error includes only the validated request ID, request timestamp, fixture role and masked destination. Reuse that context with these flags before expiry; do not request again just because UI setup failed. Keep the context in memory or a private temporary note; never save an unredacted response. No option prints the code.

## Refusals and privacy

Only loopback HTTP APIs are accepted; `localhost` is pinned to IPv4 loopback and redirects are refused. The env file must describe the running port, `APP_ENV`/`NODE_ENV` development or test, `SMS_DRIVER=mock`, and both CI-only OTP response flags explicitly false. `/healthz` must confirm the same environment. Never enable `OTP_TEST_MODE` for native setup.

Codes require one matching request tag, the fixture's last four digits and a dated log line within five seconds of the request. Missing, undated, superseded, ambiguous or four-minute-old codes fail closed (the API's phone TTL is five minutes). This leaves time to finish verification. Log entries from unrelated requests never become a fallback. `RATE_LIMITED` stops immediately. Do not resend, reset quota, change client IP or cycle fixtures to work around a refusal. The local budget is shared across agents: five codes per destination daily and ten per IP hourly, with increasing backoff.

Failures are bounded and redact raw process/network output. Diagnose with non-secret status and your session's documented help. Keep API env files and mock logs private. Codes, tokens, credentials and raw API responses belong in neither git nor screenshots, reports, PRs or normal tool output. Evidence lives outside git and states the fixture role, device/runtime, final identity assertion and limits. If the helper cannot complete, preserve the work and report the blocker; it does not waive runtime acceptance.
