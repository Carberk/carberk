# Native Listing video preparation proof #888

Supplied base `7af49d4c1474b2c3d841b14736c4ef59ce155a4e`, campaign #897. This writer owns `agent/issue-888`; no issue PR. Current work proves only the preparation boundary, not seller UI or video rollout.

## Red checkpoint

`pnpm --filter @auto-tm/mobile exec vitest run src/listings/videoPreparation/VideoPreparation.spec.ts` on 2026-10-14: 14 failed, 1 passed. The initial pass-through native adapter returned overlong/unvalidated/original/late-cancelled output and allowed concurrent preparation. These are behavior failures, not missing imports. Exact90s test passed. Native-export verification is separate from these boundary-fake tests.

`CI=1 pnpm --filter @auto-tm/mobile exec expo install --check`: PASS on installed Expo55.0.31/RN0.83.10, before dependency changes.

Native output/HDR, provider persistence, hardware acceleration and native compilation are NOT passed by this checkpoint. Physical founder samples and final native acceptance remain later campaign gates. Provisional10min/2GiB/15MiB caps remain assumptions.
