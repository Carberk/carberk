# #897 R7g standards source review, round 1

Provider/model: OpenAI Codex, `gpt-6.1-sol`, high reasoning effort.

Base: `776fad4a6bdbc7be2cd54f9d2b95b93233a0d8ef`  
Base tree: `1fb93ae50da22246e57b27f56aea600c32e5ef93`  
Reviewed target: `a3de0cb72c238ae271f9bc1e63e00172f75eaf9c`  
Target tree: `5b8efa3a582c8ff43304e04355af898bb85bb38e`.

Read the immutable two-point diff across all 16 paths and the five commits `6816e08a`, `288cdc46`, `55d30436`, `cb7cfbff`, `a3de0cb7`, plus target guidance, overview, relevant callers and tests. Checkout HEAD and dirty ledger were not used as candidate source.

## Documented breaches

1. **P2: Consolidate the new inline storage fakes.** `packages/db/tests/maintenance-finite.r7g.e2e.spec.ts:111-112,143` introduces two separate `ObjectStore` implementations inside the spec. `docs/agents/coding-standards.md:35`, Tests rule 7, requires "One fake per port, next to the port" and says a new fake belongs in the module's `application/testing/` folder and is imported by specs. These are new fakes, so the legacy-test exemption does not apply. Their contracts already differ: `emptyStore.list` ignores prefixes and its removal clears everything, while the other fake filters prefixes and removes selected keys. Use one reusable, seedable ObjectStore fake in the module-owned testing location, with explicit refusal behavior where needed, and import it for both scenarios. Real MinIO coverage does not remove this structural requirement.

## Optional smell judgements

None reported.

## Review limits and observations

Traced the real maintenance adapter and command callers, database-boundary fakes, reviewer store extraction and import boundary, preparation using the supplied transaction, time/storage dependencies and documented availability. Existing reviewer clock/photo dependencies were already present in the base, so they are not introduced findings.

This was read-only source inspection. Supplied verification receipts and parent hash inspection were context, not acceptance executed by this reviewer. No tests, compilers, builds, imports, collection, SQL, HTTP, services, PR calls or delegation were performed. Only this report was written. No Spec or runtime verdict is given. Activation remains CLOSED; B1, G1 and candidate remain OPEN.
