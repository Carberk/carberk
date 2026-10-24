package tm.auto.diagnostics

import java.io.IOException

/** One slot. Implementations must bound reads, atomically replace writes and erase recovery files.
 * Throws on any open/read/write/close/delete failure. Only the coordinator owns this boundary.
 */
internal interface NativeCacheStorage {
    fun read(): ByteArray?
    fun write(bytes: ByteArray)
    fun erase()
}

internal enum class NativeCacheInvalidation { LOGOUT, DELETION, RESET, RESTORE, AUTHORITY_LOSS }

/** Sole lifecycle gate, including authority transitions, disk commit/readout and erase.
 * Blocking OS work runs outside it using a unique, single-use revision ticket. No production
 * issuer exists: test authority replacement is disabled in the dormant factory, permanently.
 * One owner per private slot is required; no other writer may access that file.
 */
internal class NativeCacheCoordinator private constructor(
    private val platform: ExitInfoPlatform,
    private val storage: NativeCacheStorage,
    private val build: ProtectedNativeBuild?,
    private val nowMs: () -> Long,
    private val sourceTests: Boolean,
) {
    private val gate = Any()
    private var admission: NativeHostAdmission? = null
    private var revision = Any()
    private var pending: Any? = null
    private var attempted = false
    private var poisoned = false

    /** Source-test declarations only. This is deliberately NOT a production admission API.
     * Generation/epoch/build/range changes invalidate work and erase under the exact same gate.
     * Initial admission preserves disk for restart validation; later transitions erase it.
     */
    internal fun replaceSourceTestAuthority(value: NativeHostAdmission?) {
        synchronized(gate) {
            if (!sourceTests || poisoned) {
                invalidateLocked()
            } else if (admission != value) {
                val initial = admission == null && !attempted && pending == null
                revision = Any()
                pending = null
                attempted = false
                admission = value
                if (!initial || value == null) clearLocked()
            }
        }
    }

    fun invalidate(reason: NativeCacheInvalidation): Boolean = synchronized(gate) {
        // All destructive causes have identical local semantics; none may rebind old work.
        when (reason) {
            NativeCacheInvalidation.LOGOUT, NativeCacheInvalidation.DELETION, NativeCacheInvalidation.RESET,
            NativeCacheInvalidation.RESTORE, NativeCacheInvalidation.AUTHORITY_LOSS -> {
                invalidateLocked()
            }
        }
    }

    fun capture(): Boolean {
        val ticket: Any
        val lease: NativeHostAdmission
        synchronized(gate) {
            val current = currentLocked() ?: return false
            if (pending != null || attempted) return false
            attempted = true
            val beforeRead = revision
            // An occupied slot is never replaced by another OS read. Invalid data erases/refuses.
            try {
                val bytes = storage.read()
                if (bytes != null) {
                    val entry = NativeCacheCodec.decode(bytes)
                    if (entry == null || !validLocked(entry, current)) invalidateLocked()
                    return false
                }
            } catch (_: IOException) { invalidateLocked(); return false }
              catch (_: RuntimeException) { invalidateLocked(); return false }
            if (revision !== beforeRead || admission != current || poisoned) { invalidateLocked(); return false }
            ticket = revision
            lease = current
            pending = ticket
        }
        val authority = object : NativeHostAuthority {
            override fun current(): NativeHostAdmission? = synchronized(gate) {
                if (pending !== ticket || revision !== ticket || admission != lease) null
                else if (!authorityValidLocked(lease)) { invalidateLocked(); null }
                else admission
            }
        }
        val outcome = ApplicationExitInfoHost(platform, authority, build, nowMs).read()
        return synchronized(gate) {
            if (revision !== ticket || pending !== ticket || admission != lease || poisoned) return@synchronized false
            pending = null // Completion can be accepted at most once.
            val event = (outcome as? ExitReadOutcome.Captured)?.event
            if (event == null) { invalidateLocked(); return@synchronized false }
            val entry = NativeCacheCodec.Entry(event, lease.generation, lease.epoch)
            if (!validLocked(entry, lease)) { invalidateLocked(); return@synchronized false }
            val bytes = NativeCacheCodec.encode(event, lease)
            if (bytes == null) { invalidateLocked(); return@synchronized false }
            try {
                // Recheck after encoding and before the only durable commit.
                if (revision !== ticket || !validLocked(entry, lease)) { invalidateLocked(); return@synchronized false }
                storage.write(bytes)
                // Also handles reentrant boundary callbacks in adversarial source tests.
                if (revision !== ticket || !validLocked(entry, lease)) { invalidateLocked(); return@synchronized false }
                true
            } catch (_: IOException) { invalidateLocked(); false }
              catch (_: RuntimeException) { invalidateLocked(); false }
        }
    }

    /** Local readout only, not network admission or delivery. No newer actor is ever resolved. */
    fun readout(): MinimizedNativeExit? = synchronized(gate) {
        val current = currentLocked() ?: return@synchronized null
        val ticket = revision
        try {
            val bytes = storage.read() ?: return@synchronized null
            val entry = NativeCacheCodec.decode(bytes)
            if (entry == null || revision !== ticket || !validLocked(entry, current)) {
                invalidateLocked()
                return@synchronized null
            }
            // Decoder allocates independent bounded lists and strings, never caller/storage aliases.
            entry.event
        } catch (_: IOException) { invalidateLocked(); null }
          catch (_: RuntimeException) { invalidateLocked(); null }
    }

    private fun currentLocked(): NativeHostAdmission? {
        val current = admission
        if (poisoned || !sourceTests || build == null || current == null) {
            invalidateLocked()
            return null
        }
        if (!authorityValidLocked(current)) { invalidateLocked(); return null }
        return current
    }

    private fun authorityValidLocked(expected: NativeHostAdmission): Boolean {
        return try { !poisoned && admission == expected && build != null && NativeCacheCodec.validAuthority(expected, build, nowMs()) }
        catch (_: RuntimeException) { false }
    }

    private fun validLocked(entry: NativeCacheCodec.Entry, expected: NativeHostAdmission): Boolean {
        return try { !poisoned && admission == expected && build != null && NativeCacheCodec.admissible(entry, expected, build, nowMs()) }
        catch (_: RuntimeException) { false }
    }

    private fun invalidateLocked(): Boolean {
        revision = Any()
        pending = null
        attempted = true
        admission = null
        return clearLocked()
    }

    private fun clearLocked(): Boolean {
        return try { storage.erase(); true }
        catch (_: IOException) { poisoned = true; false }
        catch (_: RuntimeException) { poisoned = true; false }
    }

    companion object {
        fun dormant(platform: ExitInfoPlatform, storage: NativeCacheStorage): NativeCacheCoordinator =
            NativeCacheCoordinator(platform, storage, null, System::currentTimeMillis, false)

        /** Internal test fixture capability, not protected historical actor/build proof. */
        fun forSourceTests(platform: ExitInfoPlatform, storage: NativeCacheStorage,
            build: ProtectedNativeBuild, nowMs: () -> Long): NativeCacheCoordinator =
            NativeCacheCoordinator(platform, storage, build, nowMs, true)
    }
}
