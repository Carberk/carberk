# Meaningful behavior tests

[Coding standards](coding-standards.md) owns requirements and [verification](../../.claude/skills/run-issue/VERIFICATION.md) owns red/green and acceptance evidence. Use this reference when choosing test boundaries or repairing an audit finding.

1. Exercise the real subject through its caller interface. Substitute external ports, HTTP, storage or native dependencies at the tested layer. A locally defined fake is not evidence for its production adapter; a fake that reimplements SQL predicates cannot prove storage selection.
2. Assert independently observable outcomes, including exact identity/session/ownership, refusal state preservation, private cache removal and persisted readback where relevant. Expected values computed by the same algorithm can repeat its bug. Failure assertions must execute; use rejection assertions rather than assertions only inside a catch.
3. Fix clocks/randomness and overlap concurrency with explicit barriers. Sequential calls do not prove concurrent safety. Real database evidence establishes SQL predicates, transactions and rollback; useful unit orchestration tests remain alongside it.
4. Render changed UI behavior with real feature components/hooks and HTTP interception where network behavior matters. Focused mocked route tests prove wiring only. Device proof establishes native keyboard/layout, virtualization, animations, accessibility and delivery claims beyond the test adapter.
5. Demonstrate the relevant unmet behavior failing before implementation and the same test passing afterward. Routine mutation testing is not required. Source/configuration, generated-output, compiled worklet and architectural tests remain valid for the contracts they actually assert.

Inspect selected existing examples before copying their setup:

- [UpdateDisplayName](../../apps/api/src/modules/identity/application/UpdateDisplayName.spec.ts) and [SetProfilePhoto](../../apps/api/src/modules/identity/application/SetProfilePhoto.spec.ts) exercise use-case outcomes through ports.
- [VerifiedContactPhone](../../apps/api/src/modules/listings/domain/VerifiedContactPhone.spec.ts) establishes expiry behavior; [RedisDailySendCap](../../apps/worker/src/email/infrastructure/RedisDailySendCap.e2e.spec.ts) exercises real concurrent reservation.
- [Rendered display name](../../apps/mobile/test/screens/display-name.spec.tsx) and [profile photo](../../apps/mobile/test/screens/profile-photo.spec.tsx) use real hooks and HTTP evidence; [OptionPickerSheet](../../apps/mobile/components/account/OptionPickerSheet.spec.tsx) exercises interactions.

A strong case does not certify its whole suite. The [test audit transition](../prd/ops/89-integration-delivery-transition.md) owns separately scoped legacy repairs and runner discovery work.
