# ADR-0080: A New car skips the "Damaged / needs repair" question

- **Status**: Accepted
- **Date**: 2026-10-02
- **Deciders**: AutoTM founder, who chose option A for decision D12 on [#354](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/354#issuecomment-5950697656) on 2026-10-02 (recorded by the queue orchestrator). The founder approved ADR-0080 and the rules for edits, drafts and the API below on 2026-10-03 in Codex desktop, [recorded on PR #565](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/565#issuecomment-5959936203).
- **Amends**: the "required to publish" rule for **Damaged / needs repair** in [ADR-0052](0052-seller-condition-disclosure-is-damaged-plus-known-issues.md). The rest of ADR-0052 stays in force.

## Context

ADR-0052 made **Damaged / needs repair** (`damaged: boolean`) a required yes/no answer on every Listing. The Sell wizard's Details step asks it after Condition, whatever Condition is.

While reviewing the Sell wizard and My listings prototype for [#354](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/354), the founder asked why a seller who chose **New** is asked whether the car is damaged or needs repair, and asked for a decision in the spirit of Auto.ru ([D12](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/354#issuecomment-5947666654)). A New car is by definition not damaged, so the question reads as odd and adds a step that can only be answered one way. Auto.ru appears to offer New to dealers only. AutoTM has no dealer-only rule for Condition, and the founder chose not to add one.

## Decision

**When Condition is New, the seller is not asked "Damaged / needs repair", and the Listing stores `damaged: false`.** Any seller may choose New. When Condition is Used, ADR-0052's rule is unchanged: the answer is required to publish.

- **Sell wizard.** The Details step hides the question while Condition is New and saves `damaged: false` to the draft. When the seller changes Condition from New to Used, the wizard clears the stored answer and shows the question, so a Used car is never published on an answer the seller did not give.
- **Publish and edit.** The publish and edit use-cases require an answer only for a Used Listing. For a New Listing they store `damaged: false` when the answer is missing, and reject `damaged: true` with a validation error, since a damaged car is not New. The seller who means a damaged car chooses Used.
- **Known issues** stays optional free text for both conditions, as in ADR-0052.
- **No schema change.** The `damaged` column and the contracts keep their shape. Only the validation rule changes. Fixture and reviewer seed Listings that are New set `damaged: false`.

## Consequences

### Positive

- A seller listing a New car answers one question fewer, and is not asked something that cannot apply.
- Every published Listing still has a stored `damaged` value, so ADR-0052's buyer signal and any future "Exclude damaged" filter work without a special case.
- The API and the wizard enforce the same rule, so a client that skips the wizard cannot publish a "damaged New car".

### Negative / accepted costs

- `damaged: false` on a New Listing is derived from Condition, not stated by the seller. It still sits under "Condition, as stated by the seller", which is accurate only because the seller stated New.
- A seller who lists a damaged car as New is rejected instead of being saved silently. The message must say to choose Used.
- The rule touches the wizard schema in `@auto-tm/contracts`, the API publish and edit use-cases, the Sell wizard Details step and its translations, and the seed scripts. It lands with the #354 build slices.

### Neutral

- Who may choose New is unchanged. A dealer-only rule would be a separate decision.
- Listing detail presentation of the condition fields follows the approved design and is not decided here.

## Alternatives considered

- **Keep asking every seller (ADR-0052 as written).** Rejected by the founder. The question is odd for a New car and has only one honest answer.
- **Offer New to dealers only, as Auto.ru appears to.** Rejected by the founder. AutoTM lets any seller choose New.
- **Hide the question and leave `damaged` empty for New.** Rejected. Every Listing would no longer carry the value, and readers and a future filter would need a New special case.
- **Hide the question and silently store `false` even when a client sends `true`.** Rejected. It would overwrite a seller's explicit statement; rejecting it keeps the contradiction visible.

## References

- [ADR-0052](0052-seller-condition-disclosure-is-damaged-plus-known-issues.md)
- [ADR-0037](0037-trust-inspection-competitive-wedge.md)
- [ADR-0020](0020-document-hierarchy-and-mutability.md)
- [Redesign the Sell wizard and My listings](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/354), the [D12 question](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/354#issuecomment-5947666654) and the [D12 decision](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/354#issuecomment-5950697656)
- [API listings current state](../../apps/api/src/modules/listings/CONTEXT.md)
