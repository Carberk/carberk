package tm.auto.diagnostics

import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream

/** Shared ExitInfoPlatform boundary fake for host and cache coordinator source cases. */
internal class ExitInfoTestTrace(bytes: ByteArray = nativeTraceFixture()) : ByteArrayInputStream(bytes) {
    var closed = false
    var failRead = false
    var failClose = false
    var onRead: (() -> Unit)? = null
    var onClose: (() -> Unit)? = null

    override fun read(): Int {
        onRead?.invoke()
        if (failRead) throw IOException("RAW_CANARY")
        return super.read()
    }

    override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
        onRead?.invoke()
        if (failRead) throw IOException("RAW_CANARY")
        return super.read(bytes, offset, length)
    }

    override fun close() {
        closed = true
        onClose?.invoke()
        if (failClose) throw IOException("CLOSE_CANARY")
        super.close()
    }
}

internal class ExitInfoTestRecord(
    override val timestampMs: Long? = 999_000,
    override val nativeCrash: Boolean = true,
    override val processName: String? = "tm.auto.app",
    override val realUid: Int? = 10123,
    override val packageUid: Int? = 10123,
    val stream: InputStream? = ExitInfoTestTrace(),
) : ExitRecord {
    var opened = false
    var failOpen = false

    override fun openTrace(): InputStream? {
        opened = true
        if (failOpen) throw IOException("OPEN_CANARY")
        return stream
    }
}

internal class ExitInfoTestPlatform(
    var records: List<ExitRecord>? = listOf(ExitInfoTestRecord()),
    private val dynamicRecords: Boolean = false,
) : ExitInfoPlatform {
    override var apiLevel = 31
    var process = ExitProcess("tm.auto.app", "tm.auto.app", 10123)
    var queried = false
    var requestedLimit = 0
    var failHistory = false
    var onHistory: (() -> Unit)? = null
    var onRead: (() -> Unit)? = null
    var onClose: (() -> Unit)? = null
    var failRead = false
    var failClose = false
    var closed = false
    var queries = 0
    var death = 999_000L

    override fun currentProcess() = process

    override fun history(packageName: String, maxRecords: Int): List<ExitRecord>? {
        check(packageName == "tm.auto.app")
        queried = true
        queries++
        requestedLimit = maxRecords
        if (failHistory) throw SecurityException("PLATFORM_CANARY")
        onHistory?.invoke()
        return if (dynamicRecords && records == null) listOf(ExitInfoTestRecord(
            timestampMs = death,
            processName = process.packageName,
            realUid = process.uid,
            packageUid = process.uid,
            stream = ExitInfoTestTrace(nativeTraceFixture(includeCanaries = true)).apply {
                onRead = this@ExitInfoTestPlatform.onRead
                onClose = {
                    closed = true
                    this@ExitInfoTestPlatform.onClose?.invoke()
                }
                failRead = this@ExitInfoTestPlatform.failRead
                failClose = this@ExitInfoTestPlatform.failClose
            },
        )) else records
    }
}

internal fun nativeTraceVarint(value: Long): ByteArray {
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

internal fun nativeTraceScalar(field: Int, value: Long) = nativeTraceVarint((field shl 3).toLong()) + nativeTraceVarint(value)
internal fun nativeTraceField(field: Int, bytes: ByteArray) = nativeTraceVarint((field shl 3 or 2).toLong()) + nativeTraceVarint(bytes.size.toLong()) + bytes

internal fun nativeTraceFixture(
    arch: Long = 1,
    buildId: String = "0123456789abcdef",
    includeCanaries: Boolean = false,
): ByteArray {
    val frame = nativeTraceScalar(1, 0x1234) + nativeTraceField(6, "/app/libcar.so".toByteArray()) + nativeTraceField(8, buildId.toByteArray())
    val thread = nativeTraceScalar(1, 7) + nativeTraceField(4, frame)
    val base = nativeTraceScalar(1, arch) + nativeTraceScalar(6, 7) + nativeTraceField(10, nativeTraceScalar(1, 11) + nativeTraceScalar(3, 0)) +
        nativeTraceField(16, nativeTraceScalar(1, 7) + nativeTraceField(2, thread))
    return if (includeCanaries) base + nativeTraceField(99, "MESSAGE_CANARY CONTACT_CANARY TOKEN_CANARY SESSION_CANARY ACTOR_CANARY".toByteArray()) else base
}
