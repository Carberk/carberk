# Carberk 2.0.4 integration evidence

## Source and ownership

Final code checkpoint `8b433e97f82368ad2d11b7a5b4869ca17af305f1` merges ordinary main `62819bd1f2b6350ce63674f4eafdda7a758d7874` into PR #848. It retains the approved release UI/media, version 2.0.4, native-session tooling and reviewed #850/#857 toolchain. Separately reviewed #861 repairs API image runtime pnpm verification and patch availability. Separately reviewed #863 adds bounded full width to undeleted Listing-reference bubbles.

The only conflict combined independent MessageBubble tests. Release image/reference ThumbHash tests and all six geometry cases are retained. API runtime files are byte-identical to reviewed main `54b29afa6c9ded0dfc57370ed041f6a70074900d`; the mobile product delta is exactly the reviewed `w-full` condition. No new product fix was introduced. Existing independent release reviews and their one fix round remain intact; root authorized mechanical integration without a new round.

The sole integration writer owns source and evidence. The operations owner controls devices, deployments, stored media and cloud builds. PR #848 stays draft with auto-merge off until root's release disposition. T3 registration is confirmed.

## Local and hosted checks

Node 22.22.2 and pnpm 12.11.2 ran the local checks on the integrated source. Focused MessageBubble renderer tests passed 31/31; full mobile tests passed 3405 across 310 files. Repository unit passed 10/10 tasks, TypeScript 7 typecheck 11/11, lint 11/11 and build 7/7. Root tests passed 232/232 including native-session. Runtime-import checks, TypeScript 6 in all nine typechecking packages, Expo alignment, and iOS/Android JavaScript exports passed. These exports are not release binaries. Local container gates were left to the hosted required check.

Exact source [PR Checks 38402171644](https://github.com/bagtyyarkovusov/auto.tm-rewrite/actions/runs/38402171644) passed all required jobs, including `pr`. [API image runtime 38402171611](https://github.com/bagtyyarkovusov/auto.tm-rewrite/actions/runs/38402171611) also passed at the same code SHA. These checks cover the integrated source, rather than relying on the earlier green release head.

## Staging media receipts

Operations receipts attribute normal Profile, chat and Listing photo adoption to `904a48099230499d8d3d76714cb3312ec0c0529f`. Five-member conditional-v1 manifests and decoded metadata-free WebP readback passed, with no new JPEG. Older main-based attempts had produced twelve empty JPEG derivatives and were recorded as failed acceptance, then included in the guarded cleanup.

The second maintenance deployment stopped normal API/worker writers, drained them, and waited the conservative 600-second presign expiry. The old saved plan refused legitimate current-state drift. Fresh backups and a current-state plan preceded conversion and independent verification. Guarded deletion removed 1793 JPEG objects; independent inventory contained 1868 objects and zero JPEG. ThumbHash backfill filled and verified 355 Listing/chat hashes. All 147 current AuditLog rows and the original 135 baseline rows remained unchanged.

These are staging receipts at `904a4809`. That runtime attempted pnpm dependency auto-install, which failed because patch inputs were absent, then continued into the converter and correctly refused the stale plan. Successful later conversion used the installed tsx runner directly. This distinction is preserved. The repaired final integrated-image pnpm converter path, including a real stale-plan refusal, still requires its own operations proof. Production promotion, production data/media checks and the cloud production AAB remain separate gates.

## Native media proof and limits

The `904a4809` viewer probe showed a central blue ThumbHash on a genuinely unvisited hero under 384 kbit/s and 400 ms shaping. It did not reach sharp in the 50-second cold recording. Full-network fresh sharp images and cached reopen passed separately. This is not a shaped cold-handoff pass or a reproduced onLoad/onDisplay gap.

Later temporary operations source `9244b17154` combined the release source with the reviewed geometry fix. A fresh active Lexus reference was sent through the normal authenticated API while the conversation was visible. Full bandwidth with fixed 250 ms latency produced continuous cold cover blur-to-sharp. Network settings were restored. [Pending blur](cold-reference-thumbhash-blur.png), [sharp cover](cold-reference-sharp.png) and [continuous handoff preview](cold-reference-handoff-preview.mp4) show the same reference. This proof retains its temporary source attribution; it is not a production-binary claim. Reviewed geometry and actual BMW detail/action evidence are recorded in [issue-862 verification](../issue-862/verification.md).

## Native UI proof and remaining evidence

[Earlier motion and cold large-text evidence](../pr-848-motion/README.md) remains attributed to `378727bd`. Cold accessibility-large/max phone-entry glyphs are intact, and maximum Russian legal copy is reachable by scroll. The scrolled screenshot has no keyboard. Hot font-category changes can transiently clip glyphs; ordinary route-remount recovery, a maximum-size keyboard form and a general accessibility pass are not established.

At temporary source `9244b17154`, the [account code screenshot](account-code-gboard-numeric.png) shows actual Gboard numeric keyboard, all six code cells, target, countdown and change-number action above the keyboard. The reserved reviewer number was not verified and identity was unchanged. An automation helper IME without a visible input view explains the earlier missing-keyboard probe. The Debug launch recording shows C-dot, Carberk/By Alpha and Home; trimmed waiting is not production launch timing.

Normal phone OTP/error/loading follow-up and Android offline FCM display/tap are operations-owned pending evidence. Debug client 41 lacks compiled Firebase resources; provider readiness alone does not establish notification display. The older staging APK has compiled Firebase resources and unchanged notification paths, but any proof from it must retain its older source/binary attribution. Physical Android/human evidence is unperformed. Root records dedicated-emulator operator applicability for this outcome; iOS APNS remains deferred under ADR-0047 Android-first scope.

No new staging APK, local release binary, Play submission, production operation or PR #848 merge was performed by the writer.
