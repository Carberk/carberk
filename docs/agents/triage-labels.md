# Triage labels

The [triage](../../.claude/skills/triage/SKILL.md) skill moves issues through five roles. Carberk uses the canonical label names unchanged.

| Label | Meaning |
|---|---|
| `needs-triage` | The founder needs to evaluate it. Default for new issues. |
| `needs-info` | Waiting on the reporter for details. |
| `ready-for-agent` | Fully specified; an agent can pick it up cold. |
| `ready-for-human` | Needs the founder: a judgment call, design decision or security-sensitive work. |
| `wontfix` | Will not be done. |

An issue has exactly one of these at a time. Blocking uses GitHub's native issue dependencies (see the [issue tracker](issue-tracker.md)); the old `blocked` label is retired.

## Area labels

Add one or more beside the triage label.

| Label | Area |
|---|---|
| `api` | `apps/api` |
| `admin` | `apps/admin` |
| `web` | `apps/web` |
| `mobile` | `apps/mobile` |
| `worker` | `apps/worker` |
| `sms-gateway` | `apps/sms-gateway` and `apps/phone-agent` |
| `db` | `packages/db` schema and migrations |
| `contracts` | `packages/contracts` |
| `ui` | `packages/ui` |
| `infra` | `infra/`, Docker, CI, Railway, deployment |
| `docs` | ADRs, specs, agent docs |

## Type labels

| Label | Type |
|---|---|
| `bug` | Something is broken |
| `feature` | New capability |
| `enhancement` | Improvement to an existing capability |
| `task` | Chore or maintenance |
| `security` | Security issue; high priority |
| `perf` | Performance issue |
