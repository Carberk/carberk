# Bail and recovery

Preserve work when authority, required evidence, safe recovery or host access is unavailable, or three focused attempts fail for the same root cause. Waiting does not count as a repair attempt.

1. Stop owned processes safely. Preserve uncommitted diffs and recoverable refs; never discard user changes or write in another owner's checkout.
2. Push a safe checkpoint when authorized and possible. Record exact local/pushed SHAs, diff/artifact paths, current failure, commands/results, interrupted processes and next owner/action in [Execution state](EXECUTION-STATE.md).
3. Keep the existing integration PR draft when incomplete. Disable auto-merge before any head change. Record missing evidence as unknown/blocked, never pass.
4. Chief of Staff recovers any active [staging reservation](../../../docs/agents/shared-staging.md) and restores latest `main` before releasing ownership. Failed restoration remains an active blocked reservation.
5. Return a compact handoff with preserved state and exact guard message. Use [resume-issue](../resume-issue/SKILL.md) for continuation; destructive or ambiguous recovery needs direction.

## Pushed checkpoint without a draft PR

Keep the issue's execution comment with owner, parent, branch/base/head, criteria/evidence, failures and next action. Chief of Staff opens or resumes the single integration draft after its first checkpoint. The issue writer opens no replacement PR.
