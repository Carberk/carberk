# Native diagnostic decoder

This Android API 31+ source checkpoint decodes the documented `ApplicationExitInfo` tombstone protobuf in memory. It keeps only the numeric architecture/signal/code and crashing TID, the crashing thread's relative PCs, and output-only module aliases/build IDs matched to an actual protected release manifest. Manifest paths and ownership flags remain internal to the decoder and never enter the result. Unknown fields, absolute addresses, registers, paths, logs, memory, file descriptors, text and unrelated threads never enter the result.

The parser enforces the official `uint32` bounds for the root TID and thread-map keys. When the optional official `Thread.id` (`int32`) is present, it must be positive and equal to the map key; otherwise the record is refused as ambiguous. The source manifest constructor rejects duplicate paths and aliases before decoding, and unsigned length varints are bounded before any allocation.

The decoder is pure and has no Expo module registration, startup hook, persistence, network, SDK, signal handler or admission authority. A later host must provide the actual `getTraceInputStream()` record, validate run/build authority, preserve the original death timestamp and apply the existing five-minute age bound before delivery. Missing or ambiguous records refuse closed.

The package intentionally has no JavaScript `main` entrypoint while the Expo module remains unregistered and inert.

Bounds are finite implementation limits: 2 MiB total wire bytes, nesting depth 16, 50 frames and 16 modules. Skipped unknown fields count toward the same byte cap. These limits do not change retention policy. Kotlin tests are authored beside the decoder but were not executed because native compilation is excluded for this source checkpoint.
