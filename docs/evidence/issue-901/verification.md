# Issue 901 implementation evidence

Base `7af49d4c1474b2c3d841b14736c4ef59ce155a4e`. Scope is reserved staging controls only. No live staging mutation is authorized in this implementation phase.

## Red checkpoint

`node --test scripts/staging-ledger.test.mjs` failed on 15 October 2026 UTC with `exactly one exclusive owner must win`, expected 1, observed 0. The transport skeleton cannot acquire a durable owner. The test creates a disposable local bare Git remote and two independent repositories. No GitHub coordination ref was created.

The public seams under test are durable compare-and-swap, reservation commands and the Railway network/process boundary. The coordinator authorized these bounded executable controls and actual concurrent Git ref contention, without a separate architecture approval round.

Docs: https://git-scm.com/docs/git-push verified explicit expected-value force-with-lease and concurrent ref protection. https://docs.railway.com/api/llms-docs.md verified project-token scope, variables, service identity and specific-commit deployment API. https://docs.railway.com/cli/ssh.md verified explicit project/environment/service SSH selection. Installed Railway 4.57.1 lacks the newer documented `railway api` command, so the adapter uses the documented GraphQL endpoint directly. No dependency upgrades.
