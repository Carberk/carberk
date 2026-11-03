# Listing video upload prototype receipt

- Issue: #943
- Source base SHA: `5b60645bae20e416781cda66b98123635f209341`
- Source implementation SHA: `fe9edb505a260b7758dfd285b08231694fa8eabf`
- Evidence directory: `docs/evidence/issue-897/video-upload-prototype-20261104/`
- Prototype deep link: `autotm://video-upload-prototype` (Expo Router path `/video-upload-prototype`)
- Build guard: `__DEV__ === true`; production renders `Review prototype unavailable` and does not mount the prototype.
- Synthetic clip hash: `sha256:listing-video-prototype-synthetic-clip-v1`
- Prepared output hash: `sha256:prepared-synthetic-clip-v1`
- Network/service statement: the prototype uses only a deterministic in-memory reducer and local adapter. It calls no API, DB, Redis, MinIO, Railway, Postgres, queue, or external video provider. The original source is never an upload fallback.

## Source verification

Focused behavior tests cover empty, selection, preview, trim handles, exact 90-second acceptance, `>90s` rejection, poster, preparing, uploading/progress, paused, processing, failed, retry retention, remove cleanup, and optional-video-pending with photos preserved.

## Device walkthrough

Target device: iPhone 17 simulator, iOS 26.2, `hostId=local`, `deviceId=38747B85-BB39-48A2-BF0D-4DD6A5ED1D13`.

Device tools used:

1. `device_list({hostId: "local"})` confirmed the target is booted and available.
2. `device_open({hostId: "local", deviceId: "38747B85-BB39-48A2-BF0D-4DD6A5ED1D13"})` opened the device panel and returned the bound `agent-device` session.
3. Launch command attempted through the returned bound command:
   `/Users/bagtyyar/.t3/userdata/device/targets/t3-c8808a8116fdce98c735caf7/agent-device open tm.auto.app --metro-port 8083 --launch-url autotm://video-upload-prototype --relaunch --timeout 120000`
4. The tool returned `DEVICE_IN_USE`; owner session was `t3-bc92ee6e4ac5fbee9b39785a`.
5. The permitted retry with `--wait 5000` waited the full budget and returned the same `DEVICE_IN_USE` condition.

No simulator screenshot or recording was captured because the device remained held by the other session. No `simctl`, `idb`, `adb`, SSH, API, backend, staging, or real media resource was used for device driving.

## Verification commands

- `pnpm --filter @auto-tm/contracts build` (required clean-base package build; generated output is ignored)
- `pnpm --filter @auto-tm/mobile exec vitest run test/video-prototype` — 2 files, 14 tests passed
- `pnpm --filter @auto-tm/mobile typecheck` — passed
- `pnpm --filter @auto-tm/mobile lint` — passed
- `git diff --check` — passed

The initial unprepared focused command also attempted the full mobile suite and failed to resolve the clean-base `@auto-tm/contracts` dist; building contracts and rerunning the explicitly scoped prototype command passed. No repository source outside the issue allow-list was changed.
