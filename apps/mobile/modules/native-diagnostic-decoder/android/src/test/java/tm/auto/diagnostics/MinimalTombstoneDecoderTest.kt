package tm.auto.diagnostics

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream

class MinimalTombstoneDecoderTest {
    private fun varint(value: Long): ByteArray { var v=value; val out=ArrayList<Byte>(); do { var b=(v and 127).toInt(); v = v ushr 7; if(v != 0L) b = b or 128; out += b.toByte() } while(v != 0L); return out.toByteArray() }
    private fun key(number: Int) = varint((number shl 3 or 2).toLong())
    private fun field(number: Int, value: ByteArray) = key(number) + varint(value.size.toLong()) + value
    private fun scalar(number: Int, value: Long) = varint((number shl 3).toLong()) + varint(value)
    private fun frame() = scalar(1, 0x1234) + field(6, "/app/libcar.so".toByteArray()) + field(8, "0123456789abcdef".toByteArray())
    private fun fixture(rootTid: Long = 7, mapKey: Long = 7, threadId: Long = 7, extra: ByteArray = byteArrayOf()): ByteArray {
        val thread = scalar(1, threadId) + field(4, frame())
        val entry = scalar(1, mapKey) + field(2, thread)
        val signal = scalar(1, 11) + scalar(3, 0)
        return scalar(1, 1) + scalar(6, rootTid) + field(10, signal) + field(16, entry) + extra
    }
    private val manifest = MinimalTombstoneDecoder.Manifest("arm64-v8a", listOf(MinimalTombstoneDecoder.ModuleManifest("/app/libcar.so", "car", "0123456789abcdef", true)))

    @Test fun `decodes crashing thread only and keeps relative pc lossless`() {
        val result = MinimalTombstoneDecoder.decode(ByteArrayInputStream(fixture()), manifest)
        assertNotNull(result); assertEquals("1234", result!!.frames.single().relativePc); assertEquals(listOf(MinimalTombstoneDecoder.ModuleReference("car", "0123456789abcdef")), result.modules)
        assertFalse(result.modules.toString().contains("/app/libcar.so")); assertFalse(result.modules.toString().contains("appOwned"))
    }
    @Test fun `unknown fields are bounded and prohibited absolute fields are ignored`() {
        val unknown = field(99, ByteArray(3) { 1 }) + field(2, "fingerprint".toByteArray())
        val result = MinimalTombstoneDecoder.decode(fixture(extra = unknown), manifest)
        assertNotNull(result); assertFalse(result.toString().contains("fingerprint"))
    }
    @Test fun `refuses invalid frame wire types and duplicate root tids`() {
        val malformed = field(1, byteArrayOf(0x01)) + field(6, byteArrayOf(0xC3.toByte(), 0x28)) + field(8, "0123456789abcdef".toByteArray())
        assertNull(MinimalTombstoneDecoder.decode(scalar(1, 1) + scalar(6, 7) + field(10, scalar(1, 11) + scalar(3, 0)) + field(16, scalar(1, 7) + field(2, scalar(1, 7) + field(4, malformed))), manifest))
        assertNull(MinimalTombstoneDecoder.decode(fixture() + scalar(6, 8), manifest))
    }
    @Test fun `refuses truncated varints unsigned tid overflow inconsistent thread ids unsupported abi and missing app frame`() {
        assertNull(MinimalTombstoneDecoder.decode(byteArrayOf(0x08, 0x80.toByte()), manifest))
        assertNull(MinimalTombstoneDecoder.decode(fixture(rootTid = 0x1_0000_0000L), manifest))
        assertNull(MinimalTombstoneDecoder.decode(fixture(mapKey = 0x1_0000_0000L), manifest))
        assertNull(MinimalTombstoneDecoder.decode(fixture(threadId = 8), manifest))
        assertNull(MinimalTombstoneDecoder.decode(fixture(threadId = -1), manifest))
        assertNull(MinimalTombstoneDecoder.decode(fixture(), manifest.copy(abi = "x86")))
        assertNull(MinimalTombstoneDecoder.decode(fixture().dropLast(20).toByteArray(), manifest))
        assertNull(MinimalTombstoneDecoder.decode(fixture(), manifest.copy(modules = listOf(manifest.modules.single().copy(appOwned = false)))))
    }

    @Test fun `rejects unsigned length overflow for known and skipped fields without throwing`() {
        val overflowLength = ByteArray(9) { 0x80.toByte() } + byteArrayOf(0x01)
        // This is the first signal_info field, so its length reaches bytes() directly.
        val known = scalar(1, 1) + scalar(6, 7) + key(10) + overflowLength
        val validPrefix = fixture()
        assertEquals("1234", MinimalTombstoneDecoder.decode(validPrefix, manifest)?.frames?.single()?.relativePc)
        val skipped = validPrefix + key(99) + overflowLength
        assertNull(MinimalTombstoneDecoder.decode(known, manifest))
        assertNull(MinimalTombstoneDecoder.decode(skipped, manifest))
    }

    @Test fun `rejects duplicate manifest paths and aliases at the source boundary`() {
        assertThrows(IllegalArgumentException::class.java) {
            MinimalTombstoneDecoder.Manifest("arm64-v8a", listOf(
                manifest.modules.single(),
                MinimalTombstoneDecoder.ModuleManifest("/app/libcar.so", "other", "fedcba9876543210", true),
            ))
        }
        assertThrows(IllegalArgumentException::class.java) {
            MinimalTombstoneDecoder.Manifest("arm64-v8a", listOf(
                manifest.modules.single(),
                MinimalTombstoneDecoder.ModuleManifest("/app/libother.so", "car", "fedcba9876543210", true),
            ))
        }
    }
}
