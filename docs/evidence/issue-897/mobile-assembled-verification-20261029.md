# Assembled mobile gate, 29 October 2026

Source `f86dd089` on the owned recovery branch includes inspected service usability, immutable PDF identity/reader changes, Expo patch alignment and the read-only reset slice. PR #904 head remains unchanged. This is an export/compiler gate, not native or deployed acceptance.

Executed sequentially during a coordinator-owned CPU window, with R6c and R7g source-only:

1. `pnpm --filter @auto-tm/mobile typecheck` initially failed because the workspace's built contracts still predated `releaseIdentity`. The [original diagnostics](mobile-assembled-20261029/typecheck-stale-contracts.txt) are preserved. This was an omitted build prerequisite; no product source changed.
2. `pnpm --filter @auto-tm/contracts build` passed.
3. `pnpm --filter @auto-tm/mobile typecheck` passed against those rebuilt declarations.
4. `CI=1 pnpm --filter @auto-tm/mobile exec expo install --check` passed. The deliberate TypeScript exclusion remains effective.
5. `CI=1 pnpm --filter @auto-tm/mobile exec expo export -p ios --clear` passed. It produced `dist` with one 9.1 MB Hermes iOS bundle and metadata. The generated export remains ignored and is not an installable APK or AAB.

[Command logs](mobile-assembled-20261029/) retain stdout/stderr. Original temporary log SHA-256 values before copying:

| Log | SHA-256 |
|---|---|
| contracts-build.log | b7f0ea1d214cf2fa8644e73701e08d32e0227cf23b7651d28eb59fe30e0c3616 |
| typecheck.log, stale prerequisite | 445e4f253c41c16b7ae52b96770e2a0473c4ccfbef03c532daf2540767b21bd0 |
| typecheck-after-contracts.log | 8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92 |
| expo-check.log | 37f3d668062ec0922e15f23b73e810f8f22bce63c83325c24f1f2f22a21a6c41 |
| ios-export.log | c664da4db2df1d2c6d361afb60317eaab7e89e48691315a8ff20048225c35c1d |

Invocation 35516 exited zero and drained before the window was released. No device, Metro, browser, Docker, database, Railway mutation, EAS build, signing or upload ran. Final combined CI, emulator journeys, exact package/backend mapping, signed installable artifacts and founder physical-device proof remain separate gates.
