package tm.auto.diagnostics

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream

/** Single filesystem boundary fake shared by real storage/coordinator source cases. */
internal class NativeCacheTestFiles : NativeCacheFiles {
    var bytes: ByteArray? = null
    var pending: ByteArray? = null
    var failOpen = false
    var failRead = false
    var failDuringRead = false
    var zeroRead = false
    var failWrite = false
    var failClose = false
    var failPublish = false
    var failErase = false
    var closed = false
    var duringRead: (() -> Unit)? = null
    var duringWrite: (() -> Unit)? = null
    override fun openRead(): InputStream? {
        pending = null
        if (failOpen) throw IOException("OPEN_CANARY")
        if (failRead) throw IOException("READ_CONTACT_CANARY")
        val source = bytes?.copyOf() ?: return null
        return object : ByteArrayInputStream(source) {
            override fun read(bytes: ByteArray, offset: Int, length: Int): Int {
                duringRead?.invoke()
                if (failDuringRead) throw IOException("STREAM_CANARY")
                if (zeroRead) return 0
                return super.read(bytes, offset, length)
            }
            override fun close() { closed = true; if (failClose) throw IOException("CLOSE_CANARY") }
        }
    }
    override fun openPending(): OutputStream {
        if (failOpen) throw IOException("OPEN_CANARY")
        return object : ByteArrayOutputStream() {
            override fun write(bytes: ByteArray, offset: Int, length: Int) {
                if (failWrite) throw IOException("WRITE_TOKEN_CANARY")
                super.write(bytes, offset, length)
            }
            override fun close() {
                closed = true
                pending = toByteArray()
                if (failClose) throw IOException("CLOSE_CANARY")
            }
        }
    }
    override fun publish() {
        if (failPublish) throw IOException("PUBLISH_CANARY")
        bytes = pending
        pending = null
        duringWrite?.invoke()
    }
    override fun erase() {
        if (failErase) throw IOException("DELETE_CANARY")
        bytes = null
        pending = null
    }
}
