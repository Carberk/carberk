# Verification

Verification is evidence collection, not a ceremonial command list. Map every integration criterion to a test, inspection or manual proof. [Coding standards](../../../docs/agents/coding-standards.md) owns test quality; [testing guide](../../../docs/agents/testing.md) supplies examples.

## Acceptance evidence

[ADR-0070](../../../docs/adr/0070-test-first-behaviour-and-ui-evidence.md) was accepted by the founder on 2026-09-30. Its procedure is recorded here as the single workflow source for test-first and UI evidence.

1. Map every acceptance criterion to its behaviour test or an explicit exemption. Before writing production code for a code-testable criterion, write and run its test. Confirm the failure is the unmet criterion, rather than a setup, import, or dependency error.
2. Commit and push the failing-test checkpoint, and record red evidence using [Execution state](EXECUTION-STATE.md#acceptance-evidence-record). Then write production code and run the same test to green. Keep earlier red evidence available when updating the state.
3. Exempt visual look, generated files, and docs-only work from red tests, recording the reason and alternative proof. Testable behaviour behind generated output still needs red evidence.
4. Prove UI behaviour with tests that render the component or screen, covering the relevant rendered content, taps, disabled states, errors, empty states, and loading states. Source-text searches do not count as behaviour evidence.
5. Prove UI look with simulator or emulator screenshots of every state listed by the governing design spec. Attach them to the PR, identify each state and spec reference, and give them to the Spec reviewer for comparison. Screenshot or snapshot matching is not required.

Missing render infrastructure or device access is missing evidence. Record the gate, reason and owner; inspect current test configuration before deciding capability exists.

## Authority and scope

1. Recheck the issue criteria and the governing requirements or decisions affected by the diff. Follow references needed to resolve a changed behavior or claim.
2. Inspect the diff for accidental scope growth and unrelated user files.
3. Check the relevant `CONTEXT.md` before and after the change.
4. Treat issue file lists as expected scope, not a ban on mechanically required tests, migrations, generated lockfiles, or documentation.
5. Treat grep/static-scan findings as leads; inspect them before calling them defects.

## Required gates

- Run typecheck, lint, and tests for every touched workspace.
- Run the narrowest useful tests during development. Before final review of the fixed commit, run the repository test and typecheck gates, affected lint, and the applicable checks below. Record commands and results in Execution state. If later changes affect a checked input, rerun the affected check before relying on its result.
- For API/domain changes, verify layer boundaries, one-use-case-per-file, cross-context ports/events, and absence of Prisma imports in domain code.
- For schema changes, require a committed Prisma migration and verify runtime consumers.
- For TypeScript package-boundary changes, follow `docs/agents/typescript-runtime.md` and run the runtime-import gate.
- For mobile/Expo work, read `docs/agents/mobile-expo.md` before dependency/config changes and run its dependency, typecheck, export, and runtime/simulator gates as applicable.
- For mobile UI, also read `docs/agents/nativewind-v4.md` and the current UI sources named by the design spec.
- For external libraries, record the `Docs:` line from `docs/agents/documentation-lookups.md`: why no lookup was needed, or the official URLs read and what each verified. Dependency upgrades also record the `peerDependencies` and `engines` checked.

The hosted required `pr` check supplies repository container-backed evidence on disposable services. Run local `pnpm test:unit`, repository typecheck and applicable non-container checks. Shared staging supplies deployed acceptance only; never point destructive repository suites at it. Native sessions follow [mobile checks](../../../docs/agents/mobile-expo.md) and [staging reservation](../../../docs/agents/shared-staging.md). Do not start local Docker to repeat hosted container gates during native proof. If CI, credentials, hardware or a simulator is unavailable, name the missing gate and where it must run; never report it as passed.

## Documentation gate

Follow [ADR-0060](../../../docs/adr/0060-source-first-agent-context-and-task-scoped-guidance.md). Inspect source and tests for changed implementation facts. Update the relevant overview in the same PR if its documented ownership, boundary, constraint, or important limitation changes. A routine field, method, route, or use-case does not require a prose inventory update.

Update `CONTEXT-MAP.md` when context ownership or locations change. Keep future requirements in their owning PRD or issue. Verify that any retained overview claims and links agree with the implementation.

Under ADR-0020:

- never edit merged ADRs; create a superseding ADR after user direction;
- never rewrite a locked sprint plan to match what happened;
- use retros for post-start scope changes;
- update mutable feature/flow docs only when the shipped behavior changes their target truth.

## Failure policy

For the same root failure, make at most three focused repair attempts. Do not count waiting for a running check as an attempt. After the cap—or immediately when authority or environment is missing—preserve state and bail using `BAIL-AND-RECOVERY.md`.

Before finalization, produce a compact evidence table:

| Acceptance criterion | Evidence | Result |
|---|---|---|
| `<criterion>` | `<test, file, command, or manual proof>` | pass / blocked |

No `<promise>COMPLETE</promise>` or “done” claim is valid while any required row is blocked.
