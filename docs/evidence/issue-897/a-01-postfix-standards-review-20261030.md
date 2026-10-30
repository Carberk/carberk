# A-01 post-fix Standards review, 2026-10-30

**Disposition: FAIL/open.** Reviewed assembled source SHA
`99097510f84c6d682bf9838f82a629f36dd5b442` through docs-only review checkout
`235332721741f158bfb99cdf5d2dae85f7400234`.

Review identity:

- Worktree: `/Users/bagtyyar/.t3/worktrees/carberk/t3-6c283b43`
- Branch: `t3/issue-897-post-fix-standards-review`
- Actual HEAD: `235332721741f158bfb99cdf5d2dae85f7400234`
- Provider/model: `codex_work`, `gpt-6.1-sol`, xhigh/priority
- Source equality: `git diff --quiet 99097510f84c6d682bf9838f82a629f36dd5b442...235332721741f158bfb99cdf5d2dae85f7400234 -- apps packages scripts .github infra pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json` exited 0.

## S1 disposition

The A-09 fix correctly replaced operation-site reads with injected `idGenerator`
and `now`, preserved frozen retry commands, and kept `expiry <= now` behavior.

## Blocking S2 composition finding

The new seams remain optional ambient fallbacks:

- `apps/admin/src/app/diagnostics/DiagnosticIdentity.tsx:21,23` defines
  `defaultIdGenerator` using `crypto.randomUUID()`.
- `apps/admin/src/app/diagnostics/DiagnosticContinuity.tsx:17,19` defines the
  same fallback.
- `apps/admin/src/app/(admin)/services/UploadRightsForm.tsx:7,10` defines
  `defaultNow` using `Date.now()`.
- Production parents omit these props at
  `DiagnosticWorkspace.tsx:64,66` and `ServiceWorkspace.tsx:107`.

The direct component tests inject props, but they do not prove production
composition. This violates `docs/agents/coding-standards.md` rule 5, which
requires time and randomness to enter through a parameter, port or provider.

**Required bounded disposition:** make the dependencies required and bind them
at the composition/provider boundary. Preserve frozen IDs, expiry semantics,
real rendered/network-boundary verification and the existing A-02 seam. S2 is
open until the assembled fix, affected checks and another independent review.

The separate one-expression A-02 worker test seam has no additional Standards
finding. No tests, builds, runtime resources or edits were performed by this
review.
