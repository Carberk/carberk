# B1 kernel repair, bounded held checkpoint

Status: IN PROGRESS, not ready for parent kernel acceptance. Sole writer in `/Users/bagtyyar/.t3/worktrees/carberk/t3-f2eb6cf5`, branch `t3/f2eb6cf5`, from held `66aaa39ca234fe8c8b166abd13e12c45647c061a`, tree `15dab4aff703c85a6389c1daa86b38e4a0eecb34`. The host scaffold initially pointed at accepted `9bcbf1e6`; only this clean owned scaffold was moved to the supplied held base. The historical writer worktree and branch remain unchanged.

The founder-authorized continuation permits one bounded repair checkpoint. Earlier attempts, holds, failure caps and the recovery decision remain in force. No caller integration, automatic admission, operational action or extra writer is authorized here. Parent owns integration, all acceptance, CI and release gates. PR904 remains the supplied remote `0ca85a62`; this writer does not change it or open a PR.

## Test-first preparation

The first repair checkpoint adds real Prisma interactive-transaction scenarios through the DB package's exported `src/index.ts` interface, alongside deliberate raw-PG guard attacks. They exercise preparation, helper assertion, callback rollback, final-effect failure, receipt reuse/wrong-operation/nesting refusal and first-observation sealing on both granted visits. Other added regressions cover ordinary Session creation, authority changes, scalar Listing updates, no-op target coverage and effective primary-key mutation by another BEFORE trigger. The previous alleged hash collision case is replaced with a real two-distinct-resource collision search over the server's actual encoder and a real lock barrier.

All SQL scenarios are AUTHORED, UNEXECUTED. The task prohibits local SQL, Docker, DB services and hosted/HTTP execution. No red or green result is claimed. This is an explicit evidence gap under repository VERIFICATION guidance, not a fake/static substitute for PostgreSQL behavior. The suite's guard fixture is prepared for the new selective trigger installation, so the historical migration alone cannot satisfy it.

An initial uncommitted broad campaign/purge draft was inspected and discarded from the delivery. It could not safely represent the existing owners' exact cleanup, retention and attribution semantics. Its diff is preserved only in `/tmp/897-b1-repair-initial-draft.diff`. No campaign or erasure behavior from that draft is accepted or executed.

Next in this same bounded checkpoint: forward-only guard repair, offline checks, exact remaining-gap receipt and a clean held handoff. Full campaign and purge repair remain required before kernel acceptance.
