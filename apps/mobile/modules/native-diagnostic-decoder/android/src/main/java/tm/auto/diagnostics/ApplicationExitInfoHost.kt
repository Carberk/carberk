package tm.auto.diagnostics

import java.io.IOException
import java.io.InputStream
import java.time.Instant
import java.util.Collections

/** Internal values are declarations, never proof. Only a future protected native composition
 * may supply authority. No JS, environment flag, artifact helper or public admission API exists.
 */
internal class ProtectedNativeBuild(
    val release: String,
    val dist: String,
    val environment: String,
    val manifestId: String,
    val abi: String,
    modules: List<MinimalTombstoneDecoder.ModuleManifest>,
) {
    val modules: List<MinimalTombstoneDecoder.ModuleManifest> = Collections.unmodifiableList(ArrayList(modules))

    init {
        require(release.matches(Regex("[A-Za-z0-9._-]{1,64}")))
        require(dist.matches(Regex("[A-Za-z0-9._-]{1,64}")))
        require(environment == "synthetic")
        require(manifestId.matches(Regex("[a-f0-9]{64}")))
        require(abi in setOf("armeabi-v7a", "arm64-v8a", "x86", "x86_64"))
        require(this.modules.size in 1..MinimalTombstoneDecoder.MAX_MODULES)
        require(this.modules.map { it.path }.toSet().size == this.modules.size)
        require(this.modules.map { it.alias }.toSet().size == this.modules.size)
        require(this.modules.all {
            it.appOwned && it.path.isNotEmpty() && it.path.length <= 4096 &&
                it.alias.matches(Regex("[A-Za-z0-9._/-]{1,96}")) &&
                it.buildId.matches(Regex("[a-f0-9]{8,128}"))
        })
    }

    fun matches(other: ProtectedNativeBuild): Boolean =
        release == other.release && dist == other.dist && environment == other.environment &&
            manifestId == other.manifestId && abi == other.abi && modules == other.modules
}

/** Must come from trusted host state, including the death's exact-build/actor time interval.
 * Current build equality alone cannot attribute a historical crash to this build or actor.
 * No production issuer is implemented. Range endpoints are inclusive epoch milliseconds.
 */
internal data class NativeHostAdmission(
    val build: ProtectedNativeBuild,
    val generation: Long,
    val epoch: String,
    val eventId: String,
    val admittedFromMs: Long,
    val admittedThroughMs: Long,
    val captureFromMs: Long,
    val captureThroughMs: Long,
)

internal interface NativeHostAuthority {
    fun current(): NativeHostAdmission?
}

internal object UnavailableNativeHostAuthority : NativeHostAuthority {
    override fun current(): NativeHostAdmission? = null
}

internal data class ExitProcess(val packageName: String, val processName: String, val uid: Int)

/** OS-owned records and streams stay within this module. No description/state-summary getter. */
internal interface ExitRecord {
    val nativeCrash: Boolean
    val timestampMs: Long?
    val processName: String?
    val realUid: Int?
    val packageUid: Int?
    fun openTrace(): InputStream?
}

internal interface ExitInfoPlatform {
    val apiLevel: Int
    fun currentProcess(): ExitProcess
    fun history(packageName: String, maxRecords: Int): List<ExitRecord>?
}

internal data class NativeSignal(val number: Int, val code: Int)
internal data class NativeModule(val alias: String, val build_id: String)
internal data class NativeFrame(val module: String, val rel_pc: String)

/** Exact minimized contract fields only. No record, manifest path, process or raw trace escapes. */
internal data class MinimizedNativeExit(
    val schema_version: Int,
    val platform: String,
    val event_id: String,
    val timestamp: String,
    val environment: String,
    val release: String,
    val dist: String,
    val manifest_id: String,
    val abi: String,
    val signal: NativeSignal,
    val crashing_tid: Long,
    val modules: List<NativeModule>,
    val frames: List<NativeFrame>,
)

internal sealed class ExitReadOutcome {
    object Unavailable : ExitReadOutcome()
    object Refused : ExitReadOutcome()
    data class Captured(val event: MinimizedNativeExit) : ExitReadOutcome()
}

/** One bounded read attempt. This is preparation, with no cache, receiver, transport or activation.
 * A lease is revalidated across blocking OS work. Later receiver/lifecycle composition must fence
 * transfer atomically too; this local check cannot establish downstream delivery authority.
 */
internal class ApplicationExitInfoHost(
    private val platform: ExitInfoPlatform,
    private val authority: NativeHostAuthority,
    private val protectedBuild: ProtectedNativeBuild?,
    private val nowMs: () -> Long,
) {
    fun read(): ExitReadOutcome {
        if (authority === UnavailableNativeHostAuthority || protectedBuild == null) return ExitReadOutcome.Unavailable
        return try {
            readAdmitted(protectedBuild)
        } catch (_: IOException) {
            ExitReadOutcome.Refused
        } catch (_: RuntimeException) {
            // Includes OS permission/binder failures. Do not log exception messages or raw records.
            ExitReadOutcome.Refused
        }
    }

    private fun readAdmitted(build: ProtectedNativeBuild): ExitReadOutcome {
        val admission = authority.current() ?: return ExitReadOutcome.Refused
        if (!validAdmission(admission, build, nowMs()) || platform.apiLevel < 31) return ExitReadOutcome.Refused
        val process = platform.currentProcess()
        if (process.uid < 0 || process.packageName.isEmpty() || process.processName.isEmpty()) return ExitReadOutcome.Refused
        // One sentinel record detects saturation. Never ask Android for unlimited history (zero).
        val records = platform.history(process.packageName, HISTORY_LIMIT) ?: return ExitReadOutcome.Refused
        if (records.size >= HISTORY_LIMIT) return ExitReadOutcome.Refused
        var selected: ExitRecord? = null
        for (record in records) {
            if (!record.nativeCrash || record.processName != process.processName ||
                record.realUid != process.uid || record.packageUid != process.uid) continue
            // More than one own native crash is ambiguous, even with different timestamps.
            // Never guess newest, fall back to another record, or repair a missing timestamp.
            if (selected != null) return ExitReadOutcome.Refused
            selected = record
        }
        val record = selected ?: return ExitReadOutcome.Refused
        val death = record.timestampMs ?: return ExitReadOutcome.Refused
        if (!stillAdmitted(admission, build, death)) return ExitReadOutcome.Refused
        val decoded = (record.openTrace() ?: return ExitReadOutcome.Refused).use { stream ->
            MinimalTombstoneDecoder.decode(ProgressInput(stream), MinimalTombstoneDecoder.Manifest(build.abi, build.modules))
        } ?: return ExitReadOutcome.Refused
        // use closes before both success and this post-read refusal, including IO/decoder exceptions.
        if (!stillAdmitted(admission, build, death)) return ExitReadOutcome.Refused
        return ExitReadOutcome.Captured(MinimizedNativeExit(
            1, "android_native", admission.eventId, Instant.ofEpochMilli(death).toString(),
            build.environment, build.release, build.dist, build.manifestId, decoded.architecture,
            NativeSignal(decoded.signalNumber, decoded.signalCode), decoded.crashingTid,
            decoded.modules.map { NativeModule(it.alias, it.buildId) },
            decoded.frames.map { NativeFrame(it.module, it.relativePc) },
        ))
    }

    private fun stillAdmitted(admission: NativeHostAdmission, build: ProtectedNativeBuild, death: Long): Boolean {
        val current = authority.current() ?: return false
        val now = nowMs()
        if (current != admission || !validAdmission(current, build, now) || death <= 0 || death > MAX_TIMESTAMP_MS ||
            death !in current.captureFromMs..current.captureThroughMs) return false
        // Positive operands keep this subtraction within signed Long, including adversarial dates.
        val age = now - death
        return age >= -5_000 && age <= 300_000
    }

    private fun validAdmission(admission: NativeHostAdmission, build: ProtectedNativeBuild, now: Long): Boolean =
        now in 1..MAX_TIMESTAMP_MS && admission.generation >= 0 && admission.epoch.matches(Regex("[a-f0-9]{64}")) &&
            admission.eventId.matches(Regex("[a-f0-9]{32}")) && build.matches(admission.build) &&
            admission.admittedFromMs > 0 && admission.admittedThroughMs >= admission.admittedFromMs &&
            now in admission.admittedFromMs..admission.admittedThroughMs &&
            admission.captureFromMs > 0 && admission.captureThroughMs >= admission.captureFromMs

    /** InputStream implementations must make progress for nonempty reads. Refuse a broken
     * platform stream rather than letting the decoder's readFully loop wait without a bound.
     * The outer use owns the actual OS stream, including on this refusal.
     */
    private class ProgressInput(private val stream: InputStream) : InputStream() {
        override fun read(): Int = stream.read()
        override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
            val count = stream.read(bytes, offset, length)
            if (length > 0 && count == 0) throw IOException()
            return count
        }
    }

    companion object {
        private const val MAX_TIMESTAMP_MS = 253_402_300_799_999L // strict four-digit ISO year
        const val HISTORY_LIMIT = 9 // at most 8 records examined; the ninth refuses the whole batch
    }
}
