# Native prepared content hash

Checkpoint red `55080769` ran the real VideoPreparation boundary: 16 passed, two failed because missing/malformed SHA-256 was accepted. Native handoff now requires a lowercase SHA-256 of the completed prepared file. AVFoundation and Android engines hash in bounded 64KiB chunks before atomic output commit and persist the hash in the prepared journal. Original phone bytes never enter transfer.

Green: all18 focused preparation tests; mobile typecheck, changed TS lint, Expo dependency alignment and iOS production export passed. Swift engine typecheck for arm64 iOS simulator target passed with existing AVFoundation deprecation warnings. This is compilation, not a device session or native hash execution receipt. Android compile/runtime and application wiring remain required in final acceptance.

Docs: https://developer.apple.com/documentation/cryptokit/sha256 verifies incremental SHA256 hashing. https://developer.android.com/reference/java/security/MessageDigest verifies incremental SHA-256 digest support. Official pages fetched successfully. No dependency/version changes.
