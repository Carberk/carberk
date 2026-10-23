# Private consumption authority acceptance assembly

Root inspected test-only checkpoint `507653d4082a784f2c173f4834071c0302f09c3e`, tree `cac5220320f9f19148d5809e295346cbf5b78410`, on `agent/issue-914-consumption-authority-c384f7e5`. It is based on published integration `0169758a`. Its three commits were incorporated without conflicts as `63217c7f`, `bab9b38d`, `cca89a29`. The assembled tree at `cca89a29` is identical to the checkpoint tree. Main `9fde309c3da17f2661fe9c266504e6e56a1b97c9` remains an ancestor. No production source, schema, contract, CI policy or protected reset body changed.

The [writer's evidence](../issue-914/consumption-authority-test-slice-20261021.md) records 16 new real HTTP/PostgreSQL acceptance cases. Root inspected all added code, the reused fixture helpers and the consumption/read implementation. This is assembly inspection, not independent Standards/Spec review.

## Preservation and scope

- Removing only the appended block reconstructs the entire original proof spec byte-for-byte, SHA-256 `d7741dd07628ef533aaa2e30af152bd673dafb45c2ea83cab3cb1f4b3d16acff`.
- All 27 original `it`/`it.each` call expressions are unchanged. SHA-256 of their JSON array is `3a58c6df0b74d5fe48a6ef33a1726618862d79a40359a7e1fb9ac4b0d49495ee`.
- Root's TypeScript AST count finds four appended test declarations. Their expansions add 1 + 7 + 6 + 2 cases. The writer's static collection count of 33 entries is not an AST declaration count. Expanded collection on the assembled checkout confirms 91 cases, the original 75 plus 16.
- The source checkpoint changes only the proof spec and its evidence file. Git tree comparison therefore proves every other tracked path, including protected reset/guard/budget/schema/contract/CI files, is unchanged.

The new cases require B-only linking-technician consumption after A assignment is removed before issuance; no new access to A material; current issuer/technician authority refusals with the same JWT; generic real/unknown input denials; no report/proof/audit partial writes; and permanent invalidation despite ordinary reviewer assignment restoration. A technician Session expiry/restore case is intended to isolate the current Session recheck where the proof has not been invalidated. Its runtime reachability is unknown.

## Verification

All root logs below are in `/tmp/carberk-resume-20261021/`. Unit commands use a synthetic unreachable database URL and start no service.

- Expanded collection with a temporary config, no setup/global hooks: 91 cases. `authority-assembly-collection.json` and `.err`.
- `pnpm test:unit`: 10/10 tasks pass, nine cached; API reran with 2425 passed and two existing skips. `authority-assembly-unit.log`. The writer's five `next/navigation` resolution failures did not recur in the parent's actual API unit run. No dependency change was made.
- `pnpm typecheck`: 11/11 tasks pass, ten cached; API reran. `authority-assembly-typecheck.log`.
- `pnpm --filter @auto-tm/api exec tsc6 --noEmit`; API lint: pass. `authority-assembly-api-ts6-lint.log`.
- `pnpm test:agent-docs`: 8/8; `pnpm check:glossary`; `pnpm check:runtime-imports`; `git diff --check`: pass. `authority-assembly-docs.log`.

The initial parent preservation script invocation used the wrong Node options shape, then a reconstruction with an extra newline; neither result was accepted. The corrected complete-file reconstruction and original-call comparison both pass with the hashes above. No test/source changes were needed.

The [0169758a terminal receipt](../issue-901/prelaunch-hosted-receipt-0169758a-20261022.md) establishes the original 75 cases passing before this test-only addition. The 16 new cases are runtime-unreached until a new hosted candidate executes them. No runtime GREEN or source repair is claimed from collection or compilation. Rights-expiry boundary, concurrency, atomic rollback and later-erasure consumption acceptance remain separate required slices. No reset, Railway retry, deployment, merge, promotion or submission occurred.
