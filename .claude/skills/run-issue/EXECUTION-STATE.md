# Durable execution state

## Reservation and first checkpoint

Chief of Staff owns one parent integration record and draft PR. Each issue writer reserves its branch from the supplied integration SHA and maintains one execution comment until assembly. After assembly, copy criterion evidence into the integration PR and link the issue record; update the PR rather than appending competing summaries.

Record after every checkpoint, verification phase, failure, review finding and handoff:

- Owner, role, parent/issue, branch, supplied base and last pushed checkpoint SHA.
- Status: reserved, implementing, verifying, assembling, reviewing, fixing, accepting, ready, blocked or merged.
- Criteria completed and evidence below; commands/results marked pass, fail or unknown.
- Current root failure, interrupted commands/processes and missing authority or environment.
- Documentation changes and external dependency `Docs:` receipts from the lookup guide.
- Review target/verdicts and finding dispositions: fixed SHA, deferred issue or rejection reason.
- Staging reservation/evidence/restoration link when applicable.
- One concrete next action and the responsible owner.

Silence or interrupted output is unknown. A checkpoint preserves work; [verification](VERIFICATION.md) establishes evidence. Never query provider quota before starting work.

## Acceptance evidence record

Keep a row for every criterion and preserve red output after green:

| Criterion | Red checkpoint/run | Green SHA/run | Exemption or device proof |
|---|---|---|---|
| Required behavior | SHA, exact command and relevant failure | SHA, same test and result | Reason and alternative proof; state/spec/artifact links |

Docs-only and visual claims use explicit exemptions from artificial red tests under [acceptance evidence](VERIFICATION.md#acceptance-evidence). A missing required gate stays blocked with its owner and next action.

## Handoff inspection

An incoming writer inspects issue/spec, branch heads, worktree diff, PR/comments/checks, review SHAs and processes. A legacy per-issue or batch PR is preserved and reconciled by Chief of Staff into the integration attempt. Resume in an owned checkout; use [resume-issue](../resume-issue/SKILL.md).
