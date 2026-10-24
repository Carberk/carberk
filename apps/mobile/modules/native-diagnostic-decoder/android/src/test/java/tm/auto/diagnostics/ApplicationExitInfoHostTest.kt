package tm.auto.diagnostics

import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import org.junit.Assert.*
import org.junit.Test

/** Source-only cases. No Android/JVM execution is claimed by this checkpoint. */
class ApplicationExitInfoHostTest {
    private val build = ProtectedNativeBuild(
        "r1", "42", "synthetic", "a".repeat(64), "arm64-v8a",
        listOf(MinimalTombstoneDecoder.ModuleManifest("/app/libcar.so", "car", "0123456789abcdef", true)),
    )
    private val lease = NativeHostAdmission(build, 7, "b".repeat(64), "c".repeat(32),
        600_000, 1_100_000, 600_000, 1_005_000)
    private val identity = ExitProcess("tm.auto.app", "tm.auto.app", 10123)

    private class Authority(var admission: NativeHostAdmission?) : NativeHostAuthority {
        override fun current() = admission
    }
    private class Trace(bytes: ByteArray = fixture()) : ByteArrayInputStream(bytes) {
        var closed = false
        var failRead = false
        var failClose = false
        var onRead: (() -> Unit)? = null
        override fun read(): Int {
            onRead?.invoke()
            if (failRead) throw IOException("private canary")
            return super.read()
        }
        override fun close() {
            closed = true
            if (failClose) throw IOException("private close canary")
            super.close()
        }
    }
    private class Record(
        override val timestampMs: Long? = 999_000,
        override val nativeCrash: Boolean = true,
        override val processName: String? = "tm.auto.app",
        override val realUid: Int? = 10123,
        override val packageUid: Int? = 10123,
        val stream: InputStream? = Trace(),
    ) : ExitRecord {
        var opened = false
        var failOpen = false
        override fun openTrace(): InputStream? {
            opened = true
            if (failOpen) throw IOException("private open canary")
            return stream
        }
    }
    private class Platform(var records: List<ExitRecord>? = listOf(Record())) : ExitInfoPlatform {
        override var apiLevel = 31
        var process = ExitProcess("tm.auto.app", "tm.auto.app", 10123)
        var queried = false
        var requestedLimit = 0
        var failHistory = false
        var onHistory: (() -> Unit)? = null
        override fun currentProcess() = process
        override fun history(packageName: String, maxRecords: Int): List<ExitRecord>? {
            assertEquals("tm.auto.app", packageName)
            queried = true
            requestedLimit = maxRecords
            if (failHistory) throw SecurityException("private platform canary")
            onHistory?.invoke()
            return records
        }
    }
    private fun host(platform: Platform, authority: NativeHostAuthority = Authority(lease), now: () -> Long = { 1_000_000 }) =
        ApplicationExitInfoHost(platform, authority, build, now)
    private fun captured(value: ExitReadOutcome): MinimizedNativeExit = (value as ExitReadOutcome.Captured).event
    private fun refused(value: ExitReadOutcome) = assertEquals(ExitReadOutcome.Refused, value)

    @Test fun `unavailable authority and missing admission never read platform history`() {
        val platform = Platform()
        assertEquals(ExitReadOutcome.Unavailable, host(platform, UnavailableNativeHostAuthority).read())
        refused(host(platform, Authority(null)).read())
        assertFalse(platform.queried)
    }

    @Test fun `preserves original death time and returns only minimized native fields`() {
        val trace = Trace(fixture() + field(2, "private fingerprint".toByteArray()))
        val record = Record(stream = trace)
        val platform = Platform(listOf(record))
        val result = captured(host(platform).read())
        assertEquals("1970-01-01T00:16:39Z", result.timestamp)
        assertEquals(1, result.schema_version)
        assertEquals("android_native", result.platform)
        assertEquals("synthetic", result.environment)
        assertEquals("r1", result.release)
        assertEquals("42", result.dist)
        assertEquals("a".repeat(64), result.manifest_id)
        assertEquals("c".repeat(32), result.event_id)
        assertEquals("arm64-v8a", result.abi)
        assertEquals(NativeSignal(11, 0), result.signal)
        assertEquals(7L, result.crashing_tid)
        assertEquals(listOf(NativeModule("car", "0123456789abcdef")), result.modules)
        assertEquals(listOf(NativeFrame("car", "1234")), result.frames)
        for (canary in listOf("/app/", "appOwned", "fingerprint", "tm.auto.app", "10123")) {
            assertFalse(result.toString().contains(canary))
        }
        assertTrue(trace.closed)
        assertEquals(9, platform.requestedLimit)
    }

    @Test fun `accepts exact age and future tolerance endpoints without retimestamping`() {
        assertEquals("1970-01-01T00:11:40Z", captured(host(Platform(listOf(Record(700_000)))).read()).timestamp)
        assertEquals("1970-01-01T00:16:45Z", captured(host(Platform(listOf(Record(1_005_000)))).read()).timestamp)
        assertEquals("1970-01-01T00:16:39.123Z", captured(host(Platform(listOf(Record(999_123)))).read()).timestamp)
    }

    @Test fun `refuses stale future missing nonpositive and overflow timestamps before opening trace`() {
        for (time in listOf(699_999L, 1_005_001L, null, 0L, -1L, Long.MAX_VALUE)) {
            val record = Record(time)
            refused(host(Platform(listOf(record))).read())
            assertFalse(record.opened)
        }
    }

    @Test fun `selects own native crash while excluding Java ANR other process and foreign UID`() {
        val unrelated = listOf(Record(nativeCrash = false), Record(processName = "tm.auto.app:other"),
            Record(realUid = 999), Record(packageUid = 999), Record(processName = null))
        val selected = Record()
        assertEquals("1234", captured(host(Platform(unrelated + selected)).read()).frames.single().rel_pc)
        assertTrue(selected.opened)
        assertTrue(unrelated.none { it.opened })
        refused(host(Platform(unrelated)).read())
    }

    @Test fun `refuses empty null ambiguous and saturated history without opening any trace`() {
        refused(host(Platform(emptyList())).read())
        refused(host(Platform(null)).read())
        for (records in listOf(listOf(Record(), Record()), listOf(Record(998_000), Record()), List(9) { Record() })) {
            refused(host(Platform(records)).read())
            assertTrue(records.none { it.opened })
        }
    }

    @Test fun `unsupported Android and invalid host identity cannot read history`() {
        val old = Platform().apply { apiLevel = 30 }
        refused(host(old).read())
        assertFalse(old.queried)
        val invalid = Platform().apply { process = identity.copy(uid = -1) }
        refused(host(invalid).read())
        assertFalse(invalid.queried)
    }

    @Test fun `missing overwritten trace and bounded platform failures refuse without throwing`() {
        refused(host(Platform(listOf(Record(stream = null)))).read())
        refused(host(Platform().apply { failHistory = true }).read())
        refused(host(Platform(listOf(Record().apply { failOpen = true }))).read())
    }

    @Test fun `closes actual trace after decoder refusal IO failure and close failure`() {
        val malformed = Trace(byteArrayOf(0x08, 0x80.toByte()))
        val badRead = Trace().apply { failRead = true }
        val badClose = Trace().apply { failClose = true }
        for (trace in listOf(malformed, badRead, badClose)) {
            refused(host(Platform(listOf(Record(stream = trace)))).read())
            assertTrue(trace.closed)
        }
    }

    @Test fun `non progressing stream refuses and closes instead of spinning in decoder`() {
        var closed = false
        val stream = object : InputStream() {
            val source = ByteArrayInputStream(fixture())
            override fun read() = source.read()
            override fun read(bytes: ByteArray, offset: Int, length: Int) = 0
            override fun close() { closed = true }
        }
        refused(host(Platform(listOf(Record(stream = stream)))).read())
        assertTrue(closed)
    }

    @Test fun `real decoder refuses mismatched ABI build ID and oversized trace and closes each`() {
        for (bytes in listOf(fixture(arch = 3), fixture(buildId = "fedcba9876543210"),
            fixture() + field(99, ByteArray(MinimalTombstoneDecoder.MAX_BYTES)))) {
            val trace = Trace(bytes)
            refused(host(Platform(listOf(Record(stream = trace)))).read())
            assertTrue(trace.closed)
        }
    }

    @Test fun `protected build metadata and complete module set must match admitted build`() {
        val mismatches = listOf(
            ProtectedNativeBuild("other", "42", "synthetic", "a".repeat(64), "arm64-v8a", build.modules),
            ProtectedNativeBuild("r1", "43", "synthetic", "a".repeat(64), "arm64-v8a", build.modules),
            ProtectedNativeBuild("r1", "42", "synthetic", "d".repeat(64), "arm64-v8a", build.modules),
            ProtectedNativeBuild("r1", "42", "synthetic", "a".repeat(64), "x86_64", build.modules),
            ProtectedNativeBuild("r1", "42", "synthetic", "a".repeat(64), "arm64-v8a", listOf(build.modules.single().copy(buildId = "fedcba9876543210"))),
            ProtectedNativeBuild("r1", "42", "synthetic", "a".repeat(64), "arm64-v8a", build.modules + build.modules.single().copy(path = "/app/extra.so", alias = "extra")),
        )
        for (mismatch in mismatches) {
            val platform = Platform()
            refused(host(platform, Authority(lease.copy(build = mismatch))).read())
            assertFalse(platform.queried)
        }
    }

    @Test fun `protected manifest rejects non synthetic malformed and ambiguous declarations and copies input`() {
        assertThrows(IllegalArgumentException::class.java) {
            ProtectedNativeBuild("r1", "42", "production", "a".repeat(64), "arm64-v8a", build.modules)
        }
        for (modules in listOf(emptyList(), build.modules + build.modules,
            listOf(build.modules.single().copy(appOwned = false)), listOf(build.modules.single().copy(alias = "private text")),
            listOf(build.modules.single().copy(buildId = "BAD")))) {
            assertThrows(IllegalArgumentException::class.java) {
                ProtectedNativeBuild("r1", "42", "synthetic", "a".repeat(64), "arm64-v8a", modules)
            }
        }
        val input = build.modules.toMutableList()
        val snapshot = ProtectedNativeBuild("r1", "42", "synthetic", "a".repeat(64), "arm64-v8a", input)
        input.clear()
        assertEquals(1, snapshot.modules.size)
        assertThrows(UnsupportedOperationException::class.java) { (snapshot.modules as MutableList<MinimalTombstoneDecoder.ModuleManifest>).clear() }
    }

    @Test fun `expired admission and death outside trusted capture range refuse`() {
        for (invalid in listOf(lease.copy(generation = -1), lease.copy(epoch = ""),
            lease.copy(admittedFromMs = 1_000_001), lease.copy(admittedThroughMs = 999_999),
            lease.copy(captureFromMs = 999_001), lease.copy(captureThroughMs = 998_999),
            lease.copy(captureFromMs = 1_000_001, captureThroughMs = 999_999), lease.copy(eventId = "invalid"))) {
            refused(host(Platform(), Authority(invalid)).read())
        }
    }

    @Test fun `authority and invalid clock failures refuse without querying history`() {
        val platform = Platform()
        val broken = object : NativeHostAuthority {
            override fun current(): NativeHostAdmission? = throw IllegalStateException("private authority canary")
        }
        refused(host(platform, broken).read())
        refused(host(platform, now = { Long.MAX_VALUE }).read())
        assertFalse(platform.queried)
    }

    @Test fun `revocation after history prevents stream acquisition`() {
        val authority = Authority(lease)
        val record = Record()
        val platform = Platform(listOf(record)).apply { onHistory = { authority.admission = null } }
        refused(host(platform, authority).read())
        assertFalse(record.opened)
    }

    @Test fun `generation epoch build and admission changes during reading discard closed result`() {
        for (replacement in listOf(null, lease.copy(generation = 8), lease.copy(epoch = "e".repeat(64)),
            lease.copy(build = ProtectedNativeBuild("other", "42", "synthetic", "a".repeat(64), "arm64-v8a", build.modules)),
            lease.copy(admittedThroughMs = 1_000_001))) {
            val authority = Authority(lease)
            val trace = Trace().apply { onRead = { authority.admission = replacement } }
            refused(host(Platform(listOf(Record(stream = trace))), authority).read())
            assertTrue(trace.closed)
        }
    }

    @Test fun `age is checked again after stream closes`() {
        var now = 1_000_000L
        val trace = Trace().apply { onRead = { now = 1_300_001 } }
        refused(host(Platform(listOf(Record(stream = trace))), Authority(lease.copy(admittedThroughMs = 2_000_000)), now = { now }).read())
        assertTrue(trace.closed)
    }

    companion object {
        private fun varint(value: Long): ByteArray {
            var remaining = value
            val bytes = ArrayList<Byte>()
            do {
                var next = (remaining and 127).toInt()
                remaining = remaining ushr 7
                if (remaining != 0L) next = next or 128
                bytes += next.toByte()
            } while (remaining != 0L)
            return bytes.toByteArray()
        }
        private fun scalar(field: Int, value: Long) = varint((field shl 3).toLong()) + varint(value)
        private fun field(field: Int, bytes: ByteArray) = varint((field shl 3 or 2).toLong()) + varint(bytes.size.toLong()) + bytes
        private fun fixture(arch: Long = 1, buildId: String = "0123456789abcdef"): ByteArray {
            val frame = scalar(1, 0x1234) + field(6, "/app/libcar.so".toByteArray()) + field(8, buildId.toByteArray())
            val thread = scalar(1, 7) + field(4, frame)
            return scalar(1, arch) + scalar(6, 7) + field(10, scalar(1, 11) + scalar(3, 0)) +
                field(16, scalar(1, 7) + field(2, thread))
        }
    }
}
