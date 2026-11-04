# ADR-0110: Draft pull requests use a short CI lane until ready

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Carberk founder

## Context

Agents often push several checkpoints while a pull request is still a draft. Running the static, API, database and frontend jobs for each checkpoint repeats work on code that is not yet ready for review. A successful `pr` check also establishes a tested head for ADR-0091's docs shortcut, so a draft-only run must not produce that success.

## Decision

The pull request workflow runs only `lane` while a pull request is a draft; `pr` and the work jobs are skipped. Ready pull requests run the normal docs or full lane when opened, marked ready for review, or pushed. Adding `run-full-ci` forces the full matrix on a draft or ready pull request. Converting a ready pull request back to a draft cancels its preceding run and uses the short draft run.

The required `pr` job retains `always()` for ready and explicitly requested runs. Its existing failure checks do not change. A skipped draft `pr` check cannot satisfy ADR-0091's requirement for a previous successful `pr` check, so later documentation changes cannot hide untested code.

## Consequences

### Positive

- Draft checkpoints avoid the four full test runners and their disposable services.
- A ready pull request receives the same complete checks as before.
- A maintainer can request the complete checks for an unfinished draft.
- Draft-only runs cannot be reused as proof of a fully tested head.

### Negative / accepted costs

- Draft code does not receive full CI feedback until the author marks it ready.
- A draft that is marked ready starts a fresh docs or full run, even if its previous lane was green.

## Alternatives considered

- **Run full CI on every draft push** — repeats work while agents are still assembling a change.
- **Skip all checks for drafts** — removes the visible required status and gives no workflow proof that the draft is recognized.
- **Require ready status for every full run** — removes the explicit full-check escape hatch for a draft that needs early CI evidence.

## References

- [Issue #856](https://github.com/Carberk/carberk/issues/856)
- [Coding workflow](../agents/coding-workflow.md)
- [PR Checks workflow](../../.github/workflows/pr-checks.yml)
- [GitHub Actions pull request events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request), accessed 2026-11-05
