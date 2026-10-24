package tm.auto.diagnostics

import java.io.ByteArrayInputStream
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.*
import org.junit.Test

/** Authored source cases only. No JVM/Android execution or red/green evidence. */
class NativeCacheCoordinatorTest {
    private val build = ProtectedNativeBuild("r1", "42", "synthetic", "a".repeat(64), "arm64-v8a",
        listOf(MinimalTombstoneDecoder.ModuleManifest("/private/PATH_CANARY.so", "car", "0123456789abcdef", true)))
    private val admission = NativeHostAdmission(build, 7, "b".repeat(64), "c".repeat(32),
        1, 3_000_000, 1, 3_000_000)
    private val event = MinimizedNativeExit(1, "android_native", admission.eventId,
        "1970-01-01T00:16:39Z", "synthetic", "r1", "42", "a".repeat(64), "arm64-v8a",
        NativeSignal(11, -1), 7, listOf(NativeModule("car", "0123456789abcdef")), listOf(NativeFrame("car", "1234")))

    private class Platform : ExitInfoPlatform {
        override val apiLevel = 31
        var onHistory: (() -> Unit)? = null
        var onRead: (() -> Unit)? = null
        var onClose: (() -> Unit)? = null
        var failRead = false
        var failClose = false
        var closed = false
        var queries = 0
        var death = 999_000L
        override fun currentProcess() = ExitProcess("tm.auto.app", "tm.auto.app", 123)
        override fun history(packageName: String, maxRecords: Int): List<ExitRecord> {
            queries++
            onHistory?.invoke()
            return listOf(object : ExitRecord {
                override val nativeCrash = true
                override val timestampMs = death
                override val processName = "tm.auto.app"
                override val realUid = 123
                override val packageUid = 123
                override fun openTrace() = object : ByteArrayInputStream(fixture()) {
                    override fun read(): Int {
                        onRead?.invoke()
                        if (failRead) throw IOException("RAW_CANARY")
                        return super.read()
                    }
                    override fun close() {
                        closed = true
                        onClose?.invoke()
                        if (failClose) throw IOException("CLOSE_CANARY")
                        super.close()
                    }
                }
            })
        }
    }
    private fun owner(disk: NativeCacheTestFiles, platform: Platform = Platform(), now: () -> Long = { 1_000_000L }) =
        NativeCacheCoordinator.forSourceTests(platform, OneSlotNativeCacheStorage(disk), build, now).also { it.replaceSourceTestAuthority(admission) }
    private fun encoded(value: MinimizedNativeExit = event) = NativeCacheCodec.encode(value, admission)!!

    @Test fun `real host codec and coordinator persist one minimized event and restart readout`() {
        val disk = NativeCacheTestFiles()
        val platform = Platform()
        val first = owner(disk, platform)
        assertTrue(first.capture())
        assertTrue(platform.closed)
        assertFalse(first.capture())
        assertEquals(1, platform.queries)
        val bytes = disk.bytes!!.copyOf()
        assertTrue(bytes.size <= 16_384)
        assertEquals("1970-01-01T00:16:39Z", owner(disk).readout()!!.timestamp)
        assertArrayEquals(bytes, disk.bytes)
        val text = bytes.toString(Charsets.US_ASCII)
        for (canary in listOf("PATH_CANARY", "MESSAGE_CANARY", "CONTACT_CANARY", "TOKEN_CANARY", "SESSION_CANARY", "ACTOR_CANARY")) {
            assertFalse(text.contains(canary))
        }
        assertFalse(text.contains("/private/"))
    }

    @Test fun `codec refuses every truncated prefix unknown version trailing bytes and oversized payload`() {
        val bytes = encoded()
        for (length in 0 until bytes.size) assertNull(NativeCacheCodec.decode(bytes.copyOf(length)))
        assertNull(NativeCacheCodec.decode(bytes + byteArrayOf(0)))
        assertNull(NativeCacheCodec.decode(ByteArray(16_385)))
        assertNull(NativeCacheCodec.decode(bytes.copyOf().apply { this[3] = 99 }))
        assertNull(NativeCacheCodec.decode(bytes.copyOf().apply { this[4] = 0xff.toByte() }))
        // First length-prefixed field is epoch, after magic/version and generation.
        assertNull(NativeCacheCodec.decode(bytes.copyOf().apply { this[12] = 0x7f; this[13] = 0xff.toByte() }))
        // Counts are bytes; zero and 255 refuse before creating a list.
        assertNull(NativeCacheCodec.decode(bytes.copyOf().apply { this[14] = 0xff.toByte() }))
        for (offset in NativeCacheCodecTestOffsets.lengthOffsets(bytes)) {
            assertNull(NativeCacheCodec.decode(bytes.copyOf().apply { this[offset] = 0xff.toByte(); this[offset + 1] = 0xff.toByte() }))
        }
        val locations = NativeCacheCodecTestOffsets.countOffsets(bytes)
        for (offset in locations) for (count in listOf(0, 255)) {
            assertNull(NativeCacheCodec.decode(bytes.copyOf().apply { this[offset] = count.toByte() }))
        }
    }

    @Test fun `strict event validation rejects unmapped fields and mutable list substitution`() {
        for (invalid in listOf(event.copy(schema_version = 2), event.copy(platform = "RAW_CANARY"),
            event.copy(environment = "production"), event.copy(event_id = "TOKEN_CANARY"),
            event.copy(timestamp = "bad"), event.copy(crashing_tid = 4_294_967_296),
            event.copy(signal = NativeSignal(65, 0)), event.copy(modules = emptyList()),
            event.copy(modules = event.modules + event.modules), event.copy(frames = List(51) { event.frames[0] }),
            event.copy(frames = listOf(NativeFrame("other", "1"))),
            event.copy(frames = listOf(NativeFrame("car", "0001"))),
            event.copy(release = "x".repeat(65)), event.copy(modules = listOf(NativeModule("car", "f".repeat(129)))))) {
            assertNull(NativeCacheCodec.encode(invalid, admission))
        }
        val modules = event.modules.toMutableList()
        val frames = event.frames.toMutableList()
        val bytes = encoded(event.copy(modules = modules, frames = frames))
        modules.clear(); frames.clear()
        val decoded = NativeCacheCodec.decode(bytes)!!.event
        assertEquals(event, decoded)
        bytes.fill(0)
        assertEquals(event, decoded)
    }

    @Test fun `original age inclusive endpoints survive restart without retimestamping`() {
        for (now in listOf(994_000L, 1_299_000L)) {
            val disk = NativeCacheTestFiles().apply { bytes = encoded() }
            assertEquals(event, owner(disk, now = { now }).readout())
        }
        for (now in listOf(993_999L, 1_299_001L, 0L, Long.MAX_VALUE)) {
            val disk = NativeCacheTestFiles().apply { bytes = encoded() }
            assertNull(owner(disk, now = { now }).readout())
            assertNull(disk.bytes)
        }
    }

    @Test fun `foreign build generation epoch event and unavailable authority erase without rebinding`() {
        for (replacement in listOf(null, admission.copy(generation = 8), admission.copy(epoch = "d".repeat(64)),
            admission.copy(eventId = "e".repeat(32)), admission.copy(build = ProtectedNativeBuild("r2", "42", "synthetic",
                "a".repeat(64), "arm64-v8a", build.modules)), admission.copy(captureThroughMs = 998_999))) {
            val disk = NativeCacheTestFiles()
            val cache = owner(disk)
            cache.replaceSourceTestAuthority(replacement)
            disk.bytes = encoded() // Represents stale bytes found on a subsequent startup/read.
            assertNull(cache.readout())
            assertNull(disk.bytes)
        }
        val disk = NativeCacheTestFiles().apply { bytes = encoded() }
        val closed = NativeCacheCoordinator.dormant(Platform(), OneSlotNativeCacheStorage(disk))
        closed.replaceSourceTestAuthority(admission)
        assertFalse(closed.capture())
        assertNull(closed.readout())
        assertNull(disk.bytes)
    }

    @Test fun `cache rejects foreign exact build payload even with matching lifecycle binding`() {
        val foreignBuilds = listOf(
            ProtectedNativeBuild("r2", "42", "synthetic", "a".repeat(64), "arm64-v8a", build.modules),
            ProtectedNativeBuild("r1", "43", "synthetic", "a".repeat(64), "arm64-v8a", build.modules),
            ProtectedNativeBuild("r1", "42", "synthetic", "d".repeat(64), "arm64-v8a", build.modules),
            ProtectedNativeBuild("r1", "42", "synthetic", "a".repeat(64), "x86_64", build.modules),
            ProtectedNativeBuild("r1", "42", "synthetic", "a".repeat(64), "arm64-v8a",
                listOf(build.modules.single().copy(buildId = "fedcba9876543210"))),
        )
        for (foreign in foreignBuilds) {
            val disk = NativeCacheTestFiles()
            val cache = owner(disk)
            val value = event.copy(release = foreign.release, dist = foreign.dist, manifest_id = foreign.manifestId,
                abi = foreign.abi, modules = listOf(NativeModule("car", foreign.modules.single().buildId)))
            disk.bytes = NativeCacheCodec.encode(value, admission.copy(build = foreign))!!
            assertNull(cache.readout())
            assertNull(disk.bytes)
        }
    }

    @Test fun `revocation during history stream close and disk commit cannot leave an event`() {
        for (phase in 0..3) {
            val disk = NativeCacheTestFiles()
            val platform = Platform()
            val cache = owner(disk, platform)
            val revoke = { cache.invalidate(NativeCacheInvalidation.AUTHORITY_LOSS); Unit }
            when (phase) {
                0 -> platform.onHistory = revoke
                1 -> platform.onRead = revoke
                2 -> platform.onClose = revoke
                3 -> disk.duringWrite = revoke
            }
            assertFalse(cache.capture())
            assertNull(disk.bytes)
            assertNull(cache.readout())
        }
    }

    @Test fun `each destructive lifecycle transition erases and rejects old late completion`() {
        for (reason in NativeCacheInvalidation.values()) {
            val disk = NativeCacheTestFiles()
            val platform = Platform()
            val cache = owner(disk, platform)
            platform.onRead = {
                cache.invalidate(reason)
                cache.replaceSourceTestAuthority(admission.copy(generation = 8, epoch = "e".repeat(64)))
            }
            assertFalse(cache.capture())
            assertNull(disk.bytes)
            assertNull(cache.readout())
        }
    }

    @Test fun `generation change uses same gate and invalidates blocked OS work`() {
        val disk = NativeCacheTestFiles()
        val platform = Platform()
        val cache = owner(disk, platform)
        val entered = CountDownLatch(1)
        val resume = CountDownLatch(1)
        platform.onHistory = { entered.countDown(); check(resume.await(2, TimeUnit.SECONDS)) }
        val outcome = AtomicReference<Boolean>()
        val thread = Thread { outcome.set(cache.capture()) }
        thread.start()
        try {
            assertTrue(entered.await(2, TimeUnit.SECONDS))
            assertFalse(cache.capture()) // No second in-flight host query.
            cache.replaceSourceTestAuthority(admission.copy(generation = 8))
        } finally { resume.countDown(); thread.join(2_000) }
        assertFalse(thread.isAlive)
        assertEquals(false, outcome.get())
        assertNull(disk.bytes)
    }

    @Test fun `old completion cannot erase a separately admitted newer crash`() {
        val disk = NativeCacheTestFiles()
        val platform = Platform()
        val cache = owner(disk, platform)
        val entered = CountDownLatch(1)
        val resume = CountDownLatch(1)
        platform.onRead = { entered.countDown(); check(resume.await(2, TimeUnit.SECONDS)) }
        val oldOutcome = AtomicReference<Boolean>()
        val oldReader = Thread { oldOutcome.set(cache.capture()) }
        oldReader.start()
        try {
            assertTrue(entered.await(2, TimeUnit.SECONDS))
            cache.invalidate(NativeCacheInvalidation.LOGOUT)
            // New source-test declaration is for a different death, never a rebind of the old one.
            cache.replaceSourceTestAuthority(admission.copy(generation = 8, epoch = "e".repeat(64),
                eventId = "d".repeat(32), captureFromMs = 1_000_000))
            platform.onRead = null
            platform.death = 1_000_000L
            assertTrue(cache.capture())
        } finally { resume.countDown(); oldReader.join(2_000) }
        assertFalse(oldReader.isAlive)
        assertEquals(false, oldOutcome.get())
        val stored = cache.readout()!!
        assertEquals("d".repeat(32), stored.event_id)
        assertEquals("1970-01-01T00:16:40Z", stored.timestamp)
    }

    @Test fun `read write close delete failures refuse and failed erase poisons owner`() {
        for (phase in 0..4) {
            val disk = NativeCacheTestFiles()
            val platform = Platform()
            val cache = owner(disk, platform)
            when (phase) {
                0 -> disk.failRead = true
                1 -> disk.failWrite = true
                2 -> platform.failRead = true
                3 -> platform.failClose = true
                4 -> { disk.bytes = encoded(); disk.failErase = true; cache.invalidate(NativeCacheInvalidation.DELETION) }
            }
            assertFalse(cache.capture())
            assertNull(cache.readout())
            if (phase == 4) {
                disk.failErase = false
                cache.replaceSourceTestAuthority(admission)
                assertFalse(cache.capture())
                assertNull(cache.readout())
                assertNull(disk.bytes)
            } else assertNull(disk.bytes)
        }
    }

    @Test fun `restart after lifecycle change refuses restored bytes under new protected binding`() {
        for (reason in NativeCacheInvalidation.values()) {
            val disk = NativeCacheTestFiles()
            val first = owner(disk)
            assertTrue(first.capture())
            val oldBytes = disk.bytes!!.copyOf()
            assertTrue(first.invalidate(reason))
            assertNull(disk.bytes)
            val restarted = NativeCacheCoordinator.forSourceTests(Platform(), OneSlotNativeCacheStorage(disk), build) { 1_000_000L }
            restarted.replaceSourceTestAuthority(admission.copy(generation = 8, epoch = "e".repeat(64)))
            disk.bytes = oldBytes // A custom restore must still be fenced by current authority.
            assertNull(restarted.readout())
            assertNull(disk.bytes)
        }
    }

    @Test fun `cache readout refuses authority mutation and commit refuses newly expired age`() {
        val disk = NativeCacheTestFiles()
        val cache = owner(disk)
        disk.bytes = encoded()
        disk.duringRead = {
            cache.invalidate(NativeCacheInvalidation.RESTORE)
            cache.replaceSourceTestAuthority(admission.copy(generation = 8))
        }
        assertNull(cache.readout())
        assertNull(disk.bytes)
        var now = 1_000_000L
        val commitDisk = NativeCacheTestFiles()
        val committing = owner(commitDisk, now = { now })
        commitDisk.duringWrite = { now = 1_299_001L }
        assertFalse(committing.capture())
        assertNull(commitDisk.bytes)
    }

    @Test fun `destructive invalidation serializes behind disk commit then clears it`() {
        val disk = NativeCacheTestFiles()
        val cache = owner(disk)
        val inCommit = CountDownLatch(1)
        val finishCommit = CountDownLatch(1)
        val invalidatorStarted = CountDownLatch(1)
        disk.duringWrite = { inCommit.countDown(); check(finishCommit.await(2, TimeUnit.SECONDS)) }
        val writer = Thread { cache.capture() }
        val invalidator = Thread {
            invalidatorStarted.countDown()
            cache.invalidate(NativeCacheInvalidation.DELETION)
        }
        writer.start()
        try {
            assertTrue(inCommit.await(2, TimeUnit.SECONDS))
            invalidator.start()
            assertTrue(invalidatorStarted.await(2, TimeUnit.SECONDS))
        } finally {
            finishCommit.countDown()
            writer.join(2_000)
            if (invalidator.state != Thread.State.NEW) invalidator.join(2_000)
        }
        assertFalse(writer.isAlive)
        assertFalse(invalidator.isAlive)
        assertNull(disk.bytes)
        assertNull(cache.readout())
        assertFalse(cache.capture())
    }

    @Test fun `corrupt cache drops and refuses instead of falling back to OS`() {
        for (bytes in listOf(byteArrayOf(1), ByteArray(16_385), encoded().apply { this[0] = 0 })) {
            val disk = NativeCacheTestFiles()
            val platform = Platform()
            val cache = owner(disk, platform)
            disk.bytes = bytes
            assertFalse(cache.capture())
            assertEquals(0, platform.queries)
            assertNull(disk.bytes)
        }
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
        private fun fixture(): ByteArray {
            val frame = scalar(1, 0x1234) + field(6, "/private/PATH_CANARY.so".toByteArray()) + field(8, "0123456789abcdef".toByteArray())
            return scalar(1, 1) + scalar(6, 7) + field(10, scalar(1, 11) + scalar(3, 0)) +
                field(16, scalar(1, 7) + field(2, scalar(1, 7) + field(4, frame))) +
                field(99, "MESSAGE_CANARY CONTACT_CANARY TOKEN_CANARY SESSION_CANARY ACTOR_CANARY".toByteArray())
        }
    }
}

/** Test-only wire offsets, independent of decoder internals. */
private object NativeCacheCodecTestOffsets {
    fun lengthOffsets(bytes: ByteArray): List<Int> {
        val input = java.io.DataInputStream(ByteArrayInputStream(bytes))
        val offsets = ArrayList<Int>()
        var offset = 12
        input.skipBytes(12)
        fun text() {
            offsets += offset
            val size = input.readUnsignedShort()
            input.skipBytes(size)
            offset += 2 + size
        }
        repeat(7) { text() }
        input.skipBytes(16); offset += 16
        val moduleCount = input.readUnsignedByte(); offset++
        repeat(moduleCount * 2) { text() }
        val frameCount = input.readUnsignedByte(); offset++
        repeat(frameCount * 2) { text() }
        return offsets
    }

    fun countOffsets(bytes: ByteArray): List<Int> {
        val input = java.io.DataInputStream(ByteArrayInputStream(bytes))
        var offset = 12
        input.skipBytes(12)
        // epoch, event ID, timestamp, release, dist, manifest ID, ABI
        repeat(7) { val size = input.readUnsignedShort(); input.skipBytes(size); offset += 2 + size }
        input.skipBytes(16); offset += 16 // signal pair and TID
        val modulesOffset = offset
        val count = input.readUnsignedByte(); offset++
        repeat(count * 2) { val size = input.readUnsignedShort(); input.skipBytes(size); offset += 2 + size }
        return listOf(modulesOffset, offset)
    }
}
