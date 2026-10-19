# Fixed-commit finalization

Chief of Staff owns finalization under [coding workflow](../../../docs/agents/coding-workflow.md). Use canonical [glossary](../../../docs/domain/GLOSSARY.md) terms.

## Checkpoint and pin

Inspect status and full diff, stage explicit paths, commit/push a conventional checkpoint without model-specific co-author trailers. Keep the existing integration PR and [Execution state](EXECUTION-STATE.md) current. Pin the fully assembled verified SHA for review.

## Independent review

1. Dispatch fresh, independent read-only Standards and Spec contexts on the pinned SHA. Neither implemented it. They may inspect/run non-mutating checks, but never edit, format, commit or push. Supported clients may review either axis; apply the host model profile without a provider-diversity requirement.
2. Each returns under 400 words with reviewed SHA, actual provider/client, verdict and blocking findings first, each with file/line. Spec quotes the criterion behind every finding and identifies missing/partial criteria, unrequested behavior and incorrect implementations. Chief of Staff posts both reports together.
3. Decide every finding and record acceptance/rejection/deferment. Assign one writer for the one fix round. Correctness, required standards or acceptance gaps block merge. Product/architecture disputes return to the founder; unrelated debt belongs to a scoped audit/repair issue.
4. Read the fix diff, record dispositions and rerun affected verification. Fixes and staging-discovered bugs receive verification without routine re-review. Material scope or architecture changes require another independent review. An unresolved accepted blocking finding leaves the candidate blocked.

### Spec evidence checklist

For every criterion inspect the exercised production path and assertion, its relevant red failure and same-test green result or valid exemption. UI behavior needs rendered interaction evidence; UI look/native claims need state-labelled simulator/device artifacts against the approved spec. Source searches cannot replace behavior or device proof. Read [verification](VERIFICATION.md).

### Standards scope

Check changed behavior and new/changed code/tests against [mandatory standards](../../../docs/agents/coding-standards.md), [domain guidance](../../../docs/agents/domain.md) and applicable task guides. Cite the violated rule. Trace callers/boundaries when the diff changes their contract. Keep unrelated legacy debt in separate audit tasks.

## Ready PR

Use one closing line per implementation issue and one consolidated [Execution state](EXECUTION-STATE.md) with criterion/issue evidence rows. Describe concrete behavior, relevant validation and irreversible risks such as migrations or published contracts. Mark ready only after review/fixes, applicable verification and required acceptance evidence are complete.

## Checks and merge

Required checks must be green on the resulting candidate, including hosted `pr` repository evidence. Missing, interrupted or pending results are unknown. Protect `main` with squash merge and linear history; follow the effective configuration, never self-approve or bypass it. The [approved direct exception](../../../docs/agents/coding-workflow.md#small-changes-adr-0065) is unavailable until its operational gates exist.

Disable auto-merge before pushing to an eligible PR. After inspecting the final head and evidence, Chief of Staff may mark ready and enable protected squash auto-merge. Wait for successful merge or continue independent ready work. An in-scope CI fix gets affected verification within the repair cap; material scope/architecture changes get independent review.

## Integrity and sync

Verify merge and closing issue state independently of command exit status. If a closing issue stays open, preserve evidence and escalate rather than closing it by hand. Sync local `main` without discarding user work; reconcile parent/dependency labels through [sprint transitions](../../../docs/agents/sprint-transitions.md). Verify [staging restoration](../../../docs/agents/shared-staging.md), then report [safe cleanup](../../../docs/agents/worktree-lifecycle.md#safe-cleanup-gate). Roadmap closeout belongs in the authorized delivery or `close-sprint`, never an extra direct push.
