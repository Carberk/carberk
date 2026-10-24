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
    private fun host(platform: ExitInfoTestPlatform, authority: NativeHostAuthority = Authority(lease), now: () -> Long = { 1_000_000 }) =
        ApplicationExitInfoHost(platform, authority, build, now)
    private fun captured(value: ExitReadOutcome): MinimizedNativeExit = (value as ExitReadOutcome.Captured).event
    private fun refused(value: ExitReadOutcome) = assertEquals(ExitReadOutcome.Refused, value)

    @Test fun `unavailable authority and missing admission never read platform history`() {
        val platform = ExitInfoTestPlatform()
        assertEquals(ExitReadOutcome.Unavailable, host(platform, UnavailableNativeHostAuthority).read())
        refused(host(platform, Authority(null)).read())
        assertFalse(platform.queried)
    }

    @Test fun `preserves original death time and returns only minimized native fields`() {
        val trace = ExitInfoTestTrace(nativeTraceFixture() + nativeTraceField(2, "private fingerprint".toByteArray()))
        val record = ExitInfoTestRecord(stream = trace)
        val platform = ExitInfoTestPlatform(listOf(record))
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
        assertEquals("1970-01-01T00:11:40Z", captured(host(ExitInfoTestPlatform(listOf(ExitInfoTestRecord(700_000)))).read()).timestamp)
        assertEquals("1970-01-01T00:16:45Z", captured(host(ExitInfoTestPlatform(listOf(ExitInfoTestRecord(1_005_000)))).read()).timestamp)
        assertEquals("1970-01-01T00:16:39.123Z", captured(host(ExitInfoTestPlatform(listOf(ExitInfoTestRecord(999_123)))).read()).timestamp)
    }

    @Test fun `refuses stale future missing nonpositive and overflow timestamps before opening trace`() {
        for (time in listOf(699_999L, 1_005_001L, null, 0L, -1L, Long.MAX_VALUE)) {
            val record = ExitInfoTestRecord(time)
            refused(host(ExitInfoTestPlatform(listOf(record))).read())
            assertFalse(record.opened)
        }
    }

    @Test fun `selects own native crash while excluding Java ANR other process and foreign UID`() {
        val unrelated = listOf(ExitInfoTestRecord(nativeCrash = false), ExitInfoTestRecord(processName = "tm.auto.app:other"),
            ExitInfoTestRecord(realUid = 999), ExitInfoTestRecord(packageUid = 999), ExitInfoTestRecord(processName = null))
        val selected = ExitInfoTestRecord()
        assertEquals("1234", captured(host(ExitInfoTestPlatform(unrelated + selected)).read()).frames.single().rel_pc)
        assertTrue(selected.opened)
        assertTrue(unrelated.none { it.opened })
        refused(host(ExitInfoTestPlatform(unrelated)).read())
    }

    @Test fun `refuses empty null ambiguous and saturated history without opening any trace`() {
        refused(host(ExitInfoTestPlatform(emptyList())).read())
        refused(host(ExitInfoTestPlatform(null)).read())
        for (records in listOf(listOf(ExitInfoTestRecord(), ExitInfoTestRecord()), listOf(ExitInfoTestRecord(998_000), ExitInfoTestRecord()), List(9) { ExitInfoTestRecord() })) {
            refused(host(ExitInfoTestPlatform(records)).read())
            assertTrue(records.none { it.opened })
        }
    }

    @Test fun `unsupported Android and invalid host identity cannot read history`() {
        val old = ExitInfoTestPlatform().apply { apiLevel = 30 }
        refused(host(old).read())
        assertFalse(old.queried)
        val invalid = ExitInfoTestPlatform().apply { process = identity.copy(uid = -1) }
        refused(host(invalid).read())
        assertFalse(invalid.queried)
    }

    @Test fun `missing overwritten trace and bounded platform failures refuse without throwing`() {
        refused(host(ExitInfoTestPlatform(listOf(ExitInfoTestRecord(stream = null)))).read())
        refused(host(ExitInfoTestPlatform().apply { failHistory = true }).read())
        refused(host(ExitInfoTestPlatform(listOf(ExitInfoTestRecord().apply { failOpen = true }))).read())
    }

    @Test fun `closes actual trace after decoder refusal IO failure and close failure`() {
        val malformed = ExitInfoTestTrace(byteArrayOf(0x08, 0x80.toByte()))
        val badRead = ExitInfoTestTrace().apply { failRead = true }
        val badClose = ExitInfoTestTrace().apply { failClose = true }
        for (trace in listOf(malformed, badRead, badClose)) {
            refused(host(ExitInfoTestPlatform(listOf(ExitInfoTestRecord(stream = trace)))).read())
            assertTrue(trace.closed)
        }
    }

    @Test fun `non progressing stream refuses and closes instead of spinning in decoder`() {
        var closed = false
        val stream = object : InputStream() {
            val source = ByteArrayInputStream(nativeTraceFixture())
            override fun read() = source.read()
            override fun read(bytes: ByteArray, offset: Int, length: Int) = 0
            override fun close() { closed = true }
        }
        refused(host(ExitInfoTestPlatform(listOf(ExitInfoTestRecord(stream = stream)))).read())
        assertTrue(closed)
    }

    @Test fun `real decoder refuses mismatched ABI build ID and oversized trace and closes each`() {
        for (bytes in listOf(nativeTraceFixture(arch = 3), nativeTraceFixture(buildId = "fedcba9876543210"),
            nativeTraceFixture() + nativeTraceField(99, ByteArray(MinimalTombstoneDecoder.MAX_BYTES)))) {
            val trace = ExitInfoTestTrace(bytes)
            refused(host(ExitInfoTestPlatform(listOf(ExitInfoTestRecord(stream = trace)))).read())
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
            val platform = ExitInfoTestPlatform()
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
            refused(host(ExitInfoTestPlatform(), Authority(invalid)).read())
        }
    }

    @Test fun `authority and invalid clock failures refuse without querying history`() {
        val platform = ExitInfoTestPlatform()
        val broken = object : NativeHostAuthority {
            override fun current(): NativeHostAdmission? = throw IllegalStateException("private authority canary")
        }
        refused(host(platform, broken).read())
        refused(host(platform, now = { Long.MAX_VALUE }).read())
        assertFalse(platform.queried)
    }

    @Test fun `revocation after history prevents stream acquisition`() {
        val authority = Authority(lease)
        val record = ExitInfoTestRecord()
        val platform = ExitInfoTestPlatform(listOf(record)).apply { onHistory = { authority.admission = null } }
        refused(host(platform, authority).read())
        assertFalse(record.opened)
    }

    @Test fun `generation epoch build and admission changes during reading discard closed result`() {
        for (replacement in listOf(null, lease.copy(generation = 8), lease.copy(epoch = "e".repeat(64)),
            lease.copy(build = ProtectedNativeBuild("other", "42", "synthetic", "a".repeat(64), "arm64-v8a", build.modules)),
            lease.copy(admittedThroughMs = 1_000_001))) {
            val authority = Authority(lease)
            val trace = ExitInfoTestTrace().apply { onRead = { authority.admission = replacement } }
            refused(host(ExitInfoTestPlatform(listOf(ExitInfoTestRecord(stream = trace))), authority).read())
            assertTrue(trace.closed)
        }
    }

    @Test fun `age is checked again after stream closes`() {
        var now = 1_000_000L
        val trace = ExitInfoTestTrace().apply { onRead = { now = 1_300_001 } }
        refused(host(ExitInfoTestPlatform(listOf(ExitInfoTestRecord(stream = trace))), Authority(lease.copy(admittedThroughMs = 2_000_000)), now = { now }).read())
        assertTrue(trace.closed)
    }


}
