package tm.auto.diagnostics

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.IOException
import java.time.Instant

/** Private versioned binary representation of strict minimized fields, never a platform record.
 * Epoch + generation are the sole extra binding: opaque lifecycle identity, not an actor ID or
 * admission credential. Event/build identity is already part of the minimized event.
 */
internal object NativeCacheCodec {
    const val MAX_BYTES = 16_384
    private const val FORMAT = 0x434e4301
    private const val MAX_TIME = 253_402_300_799_999L
    data class Entry(val event: MinimizedNativeExit, val generation: Long, val epoch: String)

    fun encode(event: MinimizedNativeExit, admission: NativeHostAdmission): ByteArray? {
        return try {
            if (!validEvent(event) || !matches(event, admission) || admission.generation < 0 ||
                !admission.epoch.matches(Regex("[a-f0-9]{64}"))) return null
            val bytes = ByteArrayOutputStream()
            DataOutputStream(bytes).use { out ->
                out.writeInt(FORMAT)
                out.writeLong(admission.generation)
                fun text(value: String) {
                    // All permitted strings are bounded ASCII, checked before this allocation.
                    out.writeShort(value.length)
                    out.write(value.toByteArray(Charsets.US_ASCII))
                }
                text(admission.epoch)
                text(event.event_id); text(event.timestamp); text(event.release); text(event.dist)
                text(event.manifest_id); text(event.abi)
                out.writeInt(event.signal.number); out.writeInt(event.signal.code); out.writeLong(event.crashing_tid)
                out.writeByte(event.modules.size)
                for (module in event.modules) { text(module.alias); text(module.build_id) }
                out.writeByte(event.frames.size)
                for (frame in event.frames) { text(frame.module); text(frame.rel_pc) }
            }
            bytes.toByteArray().takeIf { it.size <= MAX_BYTES }
        } catch (_: IOException) { null } catch (_: RuntimeException) { null }
    }

    fun decode(bytes: ByteArray): Entry? {
        if (bytes.size > MAX_BYTES) return null
        return try {
            val input = DataInputStream(ByteArrayInputStream(bytes))
            if (input.readInt() != FORMAT) return null
            val generation = input.readLong()
            if (generation < 0) return null
            fun text(max: Int): String {
                val size = input.readUnsignedShort()
                if (size !in 1..max || size > input.available()) throw IOException()
                val value = ByteArray(size)
                input.readFully(value)
                if (value.any { it.toInt() !in 0..127 }) throw IOException()
                return String(value, Charsets.US_ASCII)
            }
            val epoch = text(64)
            if (!epoch.matches(Regex("[a-f0-9]{64}"))) return null
            val eventId = text(32)
            val timestamp = text(30)
            val release = text(64)
            val dist = text(64)
            val manifest = text(64)
            val abi = text(16)
            val signal = NativeSignal(input.readInt(), input.readInt())
            val tid = input.readLong()
            val moduleCount = input.readUnsignedByte()
            if (moduleCount !in 1..16) return null
            val modules = ArrayList<NativeModule>(moduleCount)
            repeat(moduleCount) { modules += NativeModule(text(96), text(128)) }
            val frameCount = input.readUnsignedByte()
            if (frameCount !in 1..50) return null
            val frames = ArrayList<NativeFrame>(frameCount)
            repeat(frameCount) { frames += NativeFrame(text(96), text(16)) }
            if (input.available() != 0) return null
            val event = MinimizedNativeExit(1, "android_native", eventId, timestamp, "synthetic",
                release, dist, manifest, abi, signal, tid, modules.toList(), frames.toList())
            if (!validEvent(event)) return null
            Entry(event, generation, epoch)
        } catch (_: IOException) { null } catch (_: RuntimeException) { null }
    }

    fun admissible(entry: Entry, admission: NativeHostAdmission, build: ProtectedNativeBuild, now: Long): Boolean {
        if (!validEvent(entry.event) || entry.generation != admission.generation || entry.epoch != admission.epoch ||
            !validAuthority(admission, build, now) || !matches(entry.event, admission)) return false
        val death = Instant.parse(entry.event.timestamp).toEpochMilli()
        return death in admission.captureFromMs..admission.captureThroughMs && now - death in -5_000L..300_000L
    }

    fun validAuthority(admission: NativeHostAdmission, build: ProtectedNativeBuild, now: Long): Boolean =
        build.matches(admission.build) && admission.generation >= 0 &&
            admission.epoch.matches(Regex("[a-f0-9]{64}")) && admission.eventId.matches(Regex("[a-f0-9]{32}")) &&
            now in 1..MAX_TIME && admission.admittedFromMs > 0 &&
            admission.admittedThroughMs >= admission.admittedFromMs &&
            now in admission.admittedFromMs..admission.admittedThroughMs && admission.captureFromMs > 0 &&
            admission.captureThroughMs >= admission.captureFromMs

    private fun matches(event: MinimizedNativeExit, admission: NativeHostAdmission): Boolean {
        val build = admission.build
        if (event.event_id != admission.eventId || event.release != build.release || event.dist != build.dist ||
            event.environment != build.environment || event.manifest_id != build.manifestId || event.abi != build.abi) return false
        return event.modules.all { module -> build.modules.any { it.alias == module.alias && it.buildId == module.build_id } }
    }

    private fun validEvent(event: MinimizedNativeExit): Boolean {
        if (event.schema_version != 1 || event.platform != "android_native" || event.environment != "synthetic" ||
            !event.event_id.matches(Regex("[a-f0-9]{32}")) || !event.release.matches(Regex("[A-Za-z0-9._-]{1,64}")) ||
            !event.dist.matches(Regex("[A-Za-z0-9._-]{1,64}")) || !event.manifest_id.matches(Regex("[a-f0-9]{64}")) ||
            event.abi !in setOf("armeabi-v7a", "arm64-v8a", "x86", "x86_64") ||
            event.signal.number !in 1..64 || event.crashing_tid !in 1L..4_294_967_295L ||
            event.modules.size !in 1..16 || event.frames.size !in 1..50 || event.timestamp.length !in 1..30) return false
        val timestamp = try { Instant.parse(event.timestamp).also { it.toEpochMilli() } } catch (_: RuntimeException) { return false }
        // Host emits canonical millisecond-precision UTC. Never normalize/retimestamp foreign data.
        if (timestamp.toEpochMilli() !in 1..MAX_TIME || timestamp.nano % 1_000_000 != 0 || timestamp.toString() != event.timestamp) return false
        val aliases = HashSet<String>()
        for (module in event.modules) {
            if (!module.alias.matches(Regex("[A-Za-z0-9._/-]{1,96}")) ||
                !module.build_id.matches(Regex("[a-f0-9]{8,128}")) || !aliases.add(module.alias)) return false
        }
        val used = HashSet<String>()
        for (frame in event.frames) {
            if (frame.module !in aliases || !frame.rel_pc.matches(Regex("(0|[1-9a-f][0-9a-f]{0,15})"))) return false
            used.add(frame.module)
        }
        return used == aliases
    }
}
