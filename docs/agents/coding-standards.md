# Coding standards: modules and tests

These rules are mandatory for new or changed behavior and its code/tests under accepted ADR-0098. [Domain guidance](domain.md) owns layering, ports, migrations and secrets. [Verification](../../.claude/skills/run-issue/VERIFICATION.md) owns evidence collection; [testing guide](testing.md) provides selected examples.

## How this file is applied

Implementers satisfy these rules before handoff; Standards reviewers block violations in the changed behavior. Trace relevant existing callers/tests to validate the changed contract. Unrelated legacy debt receives a separate audit/repair task, not an opportunistic rewrite. Existing mock style does not excuse weak evidence for new or changed behavior. Refactor only what the changed outcome needs.

## Vocabulary

- **Module:** anything with an interface and an implementation: a function, a class, a hook, a screen, a package.
- **Interface:** everything a caller must know to use the module: types, invariants, error modes, ordering, configuration.
- **Deep module:** a lot of behaviour behind a small interface. **Shallow:** an interface nearly as complicated as what it hides.
- **Seam:** the place where a module's interface lives and where behaviour can be swapped without editing the caller.
- **Adapter:** a concrete thing that fills a seam, such as a Prisma repository or an in-memory fake.

## Modules

1. **Hide complexity behind a small interface.** Before adding a function, hook or file, ask what the caller no longer has to know because it exists. If the answer is nothing, write the code where it is used.
2. **Apply the deletion test.** Imagine deleting the module. If the complexity reappears in several callers, it earns its place. If it only moves, it is a pass-through.
3. **Do not extract code only to test it.** A pure helper pulled out of a screen so it can be unit-tested leaves the real risk, how the screen calls it, untested. Test through the module that owns the behaviour.
4. **Add a seam only where something varies.** A domain boundary may require an injected port even with one production adapter. Add other seams when a dependency varies.
5. **Accept dependencies; do not create them.** Time, randomness, storage, network and native modules come in through a parameter, a port or a provider.
6. **Return results where you can.** A function that returns a value is easier to use and to test than one that changes state somewhere else.
7. **Keep screens thin.** An Expo Router screen wires navigation, data and layout. Decisions, such as which step comes next, what a refusal means, or whether a selection is valid, live in a module the screen calls. The Sell wizard reducer is the model.

## Tests

1. **The interface is the test surface.** A test uses the module the way its callers do and asserts on what they can observe: a returned value, rendered text, an enabled or disabled control, a navigation, a stored record read back through the interface.
2. **Mock at system boundaries only.** These are the network, the database, storage, time, randomness and native modules. Do not mock this repository's own components, hooks or modules.
3. **Mobile network behaviour goes through the fake server (MSW)** with the real API hooks, not through a stubbed hook or a stubbed API client.
4. **Render the real feature components for new or changed behavior.** If a screen cannot be rendered with its real children, say so in the pull request; record missing evidence and a scoped repair; required acceptance remains blocked.
5. **Assert outcomes, not calls.** Do not assert how many times, or in what order, an internal collaborator was called. Asserting a call is correct when the call is the outcome: a callback prop, a navigation, or a message sent through a port's fake.
6. **Use literal expected values.** An expected value computed the way the code computes it passes by construction.
7. **One fake per port, next to the port.** A new fake goes in the module's `application/testing/` folder and is imported by its specs. Do not add another copy of an existing fake to a spec file.
8. **Name the behaviour.** A test title says what the seller, buyer or caller gets, not which function runs.
9. **Replace, do not layer.** When a module is deepened and tested at its new interface, delete the old tests of the pieces it absorbed.

## Signs a new test needs another look

- It still passes with the production code it covers deleted or stubbed.
- It breaks when code is rearranged with no change in behaviour.
- Its setup is longer than its assertions and most of it is mocks of this repository's code.
- It checks state through a back door, such as a direct database query, when the interface could show it.

## Where this comes from

The vocabulary and tests follow John Ousterhout's deep modules, Michael Feathers's seams, and the `codebase-design`, `improve-codebase-architecture` and `tdd` skills. Test-first evidence is governed by [VERIFICATION.md](../../.claude/skills/run-issue/VERIFICATION.md); mobile test mechanics by [Mobile component tests](mobile-testing.md).
