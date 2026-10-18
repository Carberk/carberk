# Foreground prepared video transfer

Red15955d19 had five behavioral failures through the public transfer boundary.6e333248 made those behaviors pass and added a failing finite-retry criterion.7bb29403 caps each unconfirmed part at three writes per foreground run.32ae6d37 had three behavioral failures at the concrete native file/journal adapter. No import or setup failure is counted as red evidence.

The transfer uses the actual shared authenticated API client. Nine tests now pass with MSW at the HTTP boundary and native filesystem/storage/hash fakes only. They cover missing-part recovery, lost PUT answers, no bearer forwarding to storage, prepared part bytes, immutable paused intent across reopening, cancellation over late answers, bounded retry, private journal validation, range reads and content-hash revalidation. Mobile typecheck and changed lint pass. Native file operations and real provider transfer remain final acceptance evidence, not proven by these fakes.

The Expo adapter rejects original paths and unknown journal fields, scopes metadata by account/target, hashes at most15MiB on recovery, reads at most5MiB per part, and never persists credentials or signed URLs. Foreground pause/cancel writes intent before contacting the server. Reopening never resumes a persisted pause. Device/lifecycle UI composition remains separate work; this module alone does not complete #894.

Docs: https://docs.expo.dev/versions/v55.0.0/sdk/filesystem/ verifies File.bytes, File.open, FileHandle.offset/readBytes/close. https://docs.expo.dev/versions/v55.0.0/sdk/crypto/ verifies binary SHA256 digest. Installed55 types checked; no dependency change. AsyncStorage existing setItem/getItem remains the native small-record boundary.
