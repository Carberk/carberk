# #897 Android emulator runtime prerequisite — 2026-10-20

Environment preparation only. This is not candidate-native acceptance. No Carberk build, install, Metro, Railway, staging, production, token, signing, issue or PR action was taken. Base `0eefa49d37106c7742c482bb62b2c1855bfad203`, PR #904. It addresses [matrix](release-acceptance-matrix-20261020.md) launcher note and gap **U4** ("Android emulator boot is unproven").

## Result

The existing AVD **boots and responds**. The T3 one-step `device_open` boot path **fails** because of a hub/emulator argument incompatibility. A manual headless boot works, and T3 then attaches its stream and scoped CLI to that emulator.

| Field | Value |
|---|---|
| AVD | `Tayyn_Hyzmat_Test` (the only Android AVD on the host; `device.name` pixel_2, 1080×1920, 420 dpi, 3 GB RAM, 4 cores) |
| Image | `system-images/android-36.1/google_apis_playstore/arm64-v8a` rev 4 |
| Platform | Android 16, SDK 36, fingerprint `google/sdk_gphone64_arm64/emu64a:16/BE4B.251210.005/14574095:user/release-keys` |
| Emulator | 36.3.10.0 (build 14472402) on an Apple M5 host, `qemu-system-aarch64-headless` |
| T3 tools | hub 0.15.3, agent-device 0.21.25 |
| Serial / T3 id | `emulator-5554` (T3 lists the running device under this id, not under the AVD name) |
| Boot | `sys.boot_completed=1` and `dev.bootcomplete=1` about 15 s after launch; `adb emu avd name` returned `Tayyn_Hyzmat_Test` |
| Responsiveness | `open com.android.settings` → `Opened`; `home` → `Home`; `screenshot` → 1080×1920 PNG of the stock home screen (host artifact `home-screenshot.png`) |

## Root cause of the boot failure

`device_open Tayyn_Hyzmat_Test` failed after 0.7 s with `DeviceBootError … could not start`. The server trace contains the underlying hub error:

```
The emulator process for "Tayyn_Hyzmat_Test" exited with code 1 before coming online.
/Users/bagtyyar/Library/Android/sdk/emulator/emulator -avd Tayyn_Hyzmat_Test -no-audio -no-window -gpu auto -no-boot-anim -port 5554 -camera-back imagefile:/Users/bagtyyar/.cache/serve-emu/camera/emulator-5554-back.png -camera-front imagefile:/Users/bagtyyar/.cache/serve-emu/camera/emulator-5554-front.png
```

The same command run by hand with `-verbose` passes every compatibility, disk and GPU check, then exits:

```
ERROR | Invalid value for -camera-front <mode> parameter: imagefile:/Users/bagtyyar/.cache/serve-emu/camera/emulator-5554-front.png
Valid values are: 'emulated', 'virtualscene', 'videofile:options', 'webcam<N>', or 'none'
```

The installed emulator 36.3.10 does not accept the `imagefile:` camera mode that the T3 hub always passes. The AVD, system image, userdata and host resources are not the cause. The Oct 18 failure probably had the same cause, but it was not re-observed and remains unproven.

## Repair applied (1 of 3 allowed)

The hub's own flags, without the two camera arguments, plus `-no-snapshot-save`. This is reversible, preserves userdata and writes no snapshot. No AVD, SDK, image, package, host or T3 configuration was changed.

## Reusable launcher procedure

1. Confirm no emulator is running: `~/Library/Android/sdk/platform-tools/adb devices -l` lists no `emulator-*`, and `ps -axo pid,command | grep qemu-system` shows nothing. Do not take over a running emulator owned by someone else.
2. Boot headless and record the PID:
   ```bash
   nohup ~/Library/Android/sdk/emulator/emulator -avd Tayyn_Hyzmat_Test -no-audio -no-window -gpu auto -no-boot-anim -port 5554 -no-snapshot-save > /tmp/<run-dir>/emulator.log 2>&1 &
   echo $! > /tmp/<run-dir>/emulator.pid
   until [ "$(~/Library/Android/sdk/platform-tools/adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 5; done
   ```
   Bound the wait (this run used 36 × 5 s), and stop if the PID exits.
3. Run T3 `device_list`, then `device_open` with `deviceId: "emulator-5554"`, `hostId: "local"`, `platform: "android"`. Use the `agentDevice.command` and `targetArgs` it returns. This run returned `/Users/bagtyyar/.t3/userdata/device/bin/agent-device --platform android --serial emulator-5554 --config /Users/bagtyyar/.t3/userdata/device/hosts/25bf8e1a2393f1108d37029b.json --session <returned session>`. The session id changes on every open, so do not reuse `t3-405f8ad173af891a6e89b8b9`.
4. The scoped CLI answers `SESSION_NOT_FOUND` until `open <app>` runs. `open com.google.android.apps.nexuslauncher` fails, while `open com.android.settings` succeeds. To see the home screen, open Settings and then run `home`. A candidate run opens `com.auto_tm.ynamly` after installing it.
5. Clean up: `agent-device close <same flags>`, then T3 `device_close` with `deviceId: "emulator-5554"` and `shutdown: true`. Confirm that the PID, `netsimd` and `adb devices` entry are gone. Fallback, own serial only: `adb -s emulator-5554 emu kill`.

`device_open Tayyn_Hyzmat_Test` (the cold-boot path) keeps failing until the hub stops passing `imagefile:` camera modes, or the emulator accepts them. That is a T3 hub or emulator-version fix for the owner of the host toolchain. Changing the toolchain was outside this task.

## Process ownership and handback

- Pre-existing processes that were preserved: crashpad handlers 35865 and 36006 (age about 30 h), adb server 36506, and the T3 agent-device daemon 13345. No emulator was running and no adb device was attached.
- This task owned: emulator PID 74656 (`qemu-system-aarch64-headless`), its `netsimd` 74746 and crashpad helpers 74688 and 74740, plus T3 session `t3-405f8ad173af891a6e89b8b9`. All were closed or shut down by 13:11:50Z. Afterwards, `adb devices` was empty and no emulator processes remained. Nothing was left live.
- The iOS simulator `iPhone 17` (38747B85-…) was untouched and not booted. The preinstalled third-party test app `io.openride.driver.test` was not opened, and no app content was inspected.
- Side effects: the hub created camera placeholder PNGs in `~/.cache/serve-emu/camera/`; boot refreshed the AVD's `multiinstance.lock` and `emu-launch-params.txt`; normal boot writes went to userdata.

## Evidence limits

- This proves only that the runtime boots and responds. Candidate installs, the signed APK, network reverse forwarding and app behaviour are unproven.
- Without the `imagefile:` arguments, camera input uses the AVD defaults (back camera `emulated`, front camera `none`). Rows that need camera input (for example V3 capture paths) should check the camera source before claiming them.
- Host artifacts in `/tmp/carberk-android-runtime-20261020/` (not committed): `pre-state.txt`, `avd-config.txt`, `boot-trace-46401008.ndjson`, `manual-run1.log`, `emulator-repair1.log`, `device-identity.txt`, `cli-responsiveness.txt`, `home-screenshot.png`, `processes-live.txt`, `processes-after-close.txt`.
