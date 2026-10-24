package tm.auto.diagnostics

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream

class MinimalTombstoneDecoderTest {
    private fun varint(value: Long): ByteArray { var v=value; val out=ArrayList<Byte>(); do { var b=(v and 127).toInt(); v = v ushr 7; if(v != 0L) b = b or 128; out += b.toByte() } while(v != 0L); return out.toByteArray() }
    private fun field(number: Int, value: ByteArray) = byteArrayOf((number shl 3 or 2).toByte()) + varint(value.size.toLong()) + value
    private fun scalar(number: Int, value: Long) = varint((number shl 3).toLong()) + varint(value)
    private fun frame() = field(1, varint(0x1234)) + field(6, "/app/libcar.so".toByteArray()) + field(8, "0123456789abcdef".toByteArray())
    private fun fixture(extra: ByteArray = byteArrayOf()): ByteArray {
        val thread = scalar(1, 7) + field(4, frame())
        val entry = scalar(1, 7) + field(2, thread)
        val signal = scalar(1, 11) + scalar(3, 0)
        return scalar(1, 1) + scalar(6, 7) + field(10, signal) + field(16, entry) + extra
    }
    private val manifest = MinimalTombstoneDecoder.Manifest("arm64-v8a", listOf(MinimalTombstoneDecoder.ModuleManifest("/app/libcar.so", "car", "0123456789abcdef", true)))

    @Test fun `decodes crashing thread only and keeps relative pc lossless`() {
        val result = MinimalTombstoneDecoder.decode(ByteArrayInputStream(fixture()), manifest)
        assertNotNull(result); assertEquals("1234", result!!.frames.single().relativePc); assertEquals("car", result.modules.single().alias)
    }
    @Test fun `unknown fields are bounded and prohibited absolute fields are ignored`() {
        val unknown = field(99, ByteArray(3) { 1 }) + field(2, "fingerprint".toByteArray())
        val result = MinimalTombstoneDecoder.decode(fixture(unknown), manifest)
        assertNotNull(result); assertFalse(result.toString().contains("fingerprint"))
    }
    @Test fun `refuses malformed utf8 duplicate fields missing build ids and ambiguous modules`() {
        val malformed = field(1, byteArrayOf(0x01)) + field(6, byteArrayOf(0xC3.toByte(), 0x28)) + field(8, "0123456789abcdef".toByteArray())
        assertNull(MinimalTombstoneDecoder.decode(scalar(1, 1) + scalar(6, 7) + field(10, scalar(1, 11) + scalar(3, 0)) + field(16, scalar(1, 7) + field(2, scalar(1, 7) + field(4, malformed))), manifest))
        assertNull(MinimalTombstoneDecoder.decode(fixture() + scalar(6, 8), manifest))
    }
    @Test fun `refuses truncated varints oversized frames unsupported abi and missing app frame`() {
        assertNull(MinimalTombstoneDecoder.decode(byteArrayOf(0x08, 0x80.toByte()), manifest))
        assertNull(MinimalTombstoneDecoder.decode(fixture(), manifest.copy(abi = "x86")))
        assertNull(MinimalTombstoneDecoder.decode(fixture().dropLast(20).toByteArray(), manifest))
        assertNull(MinimalTombstoneDecoder.decode(fixture(), manifest.copy(modules = listOf(manifest.modules.single().copy(appOwned = false)))))
    }
}
