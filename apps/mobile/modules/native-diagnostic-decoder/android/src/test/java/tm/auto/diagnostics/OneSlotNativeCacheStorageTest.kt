package tm.auto.diagnostics

import java.io.IOException
import org.junit.Assert.*
import org.junit.Test

/** Real bounded storage owner with a filesystem boundary fake. Authored, UNEXECUTED. */
class OneSlotNativeCacheStorageTest {
    @Test fun `bounded storage roundtrip closes streams and erases both slot and pending`() {
        val files = NativeCacheTestFiles()
        val storage = OneSlotNativeCacheStorage(files)
        val bytes = ByteArray(16_384) { 1 }
        storage.write(bytes)
        assertTrue(files.closed)
        assertArrayEquals(bytes, storage.read())
        files.pending = byteArrayOf(9)
        storage.erase()
        assertNull(storage.read())
        assertNull(files.pending)
    }

    @Test fun `oversized nonprogress read and read close failures refuse`() {
        for (phase in 0..4) {
            val files = NativeCacheTestFiles().apply { bytes = ByteArray(if (phase == 0) 16_385 else 100) }
            when (phase) {
                1 -> files.failOpen = true
                2 -> files.failDuringRead = true
                3 -> files.zeroRead = true
                4 -> files.failClose = true
            }
            assertThrows(IOException::class.java) { OneSlotNativeCacheStorage(files).read() }
            if (phase != 1) assertTrue(files.closed)
        }
    }

    @Test fun `write or close failures cannot publish and deletion failure is visible`() {
        for (phase in 0..3) {
            val files = NativeCacheTestFiles()
            when (phase) {
                0 -> files.failOpen = true
                1 -> files.failWrite = true
                2 -> files.failClose = true
                3 -> files.failPublish = true
            }
            val storage = OneSlotNativeCacheStorage(files)
            assertThrows(IOException::class.java) { storage.write(byteArrayOf(1, 2)) }
            assertNull(files.bytes)
            storage.erase()
            assertNull(files.pending)
        }
        val files = NativeCacheTestFiles().apply { failErase = true }
        assertThrows(IOException::class.java) { OneSlotNativeCacheStorage(files).erase() }
        assertThrows(IOException::class.java) { OneSlotNativeCacheStorage(NativeCacheTestFiles()).write(ByteArray(16_385)) }
    }

    @Test fun `restart discards orphan pending instead of recovering it`() {
        val files = NativeCacheTestFiles().apply { pending = byteArrayOf(1, 2, 3) }
        assertNull(OneSlotNativeCacheStorage(files).read())
        assertNull(files.pending)
    }
}
