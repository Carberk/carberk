# Provider quota observation, 2026-10-21

Read-only CLIProxyAPI observation retrieved at 00:38:05 UTC. This changes implementation scheduling only. No routing, credential, Railway service, quota-refresh request, model inference or billing configuration was changed. Account identifiers and credentials are omitted. Sanitized private receipt: `/tmp/carberk-chief-preparation-20261020/quota-refresh-20261021.json`.

| Account | Observation | Remaining and reset | Scheduling consequence |
| --- | --- | --- | --- |
| Claude | 00:34:55 UTC, active/allowed, no cooldown | Five-hour 100%, resets 05:30 UTC; seven-day 40%, resets Oct 26 04:00 UTC | Next implementer uses founder-selected Opus 5.5 medium. The Opus-specific cached 99%-used observation is from Oct 20 14:34:14 UTC, older than this account result. Account evidence supports renewed availability, not a new model-specific usage measurement. |
| Recently used Sol account | 00:38:00 UTC, active, no cooldown | Five-hour 2%, resets 05:16:09 UTC; seven-day 53%, resets Oct 27 08:41:07 UTC | Preserve the active writer and its checkpoints. Avoid new Sol implementation work while this window is nearly exhausted. |
| Three other active Codex accounts | Latest cached observations Oct 20 15:32–15:58 UTC | Five-hour observations showed exhaustion but their reset times have passed; no fresh quota measurement | Availability remains UNKNOWN; elapsed reset times alone do not prove recovery. |
| Unavailable Codex account | Oct 20 15:05:09 UTC, unavailable/error, three cooldown entries | Seven-day 0%, resets Oct 27 12:12:34 UTC | Do not select from this stale unavailable observation. |

The sender/reset test writer remains Sol 6.1 medium because its task is already active. No duplicate or mid-task model switch. Final independent Standards and Spec reviewers retain founder-selected Sol 6.1 high; their account allowance must be checked when that fixed-SHA round is ready. Historical execution records saying Opus was exhausted describe the earlier observation, not current capacity. Muse availability is not established by this read.
