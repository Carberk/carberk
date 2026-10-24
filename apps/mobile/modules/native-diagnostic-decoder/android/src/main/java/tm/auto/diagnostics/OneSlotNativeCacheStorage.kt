package tm.auto.diagnostics

import java.io.IOException
import java.io.InputStream
import java.io.OutputStream

/** Filesystem boundary. publish must atomically replace the sole committed slot, never recover a
 * pending/backup file. erase must remove committed and pending files or throw. No path arguments.
 */
internal interface NativeCacheFiles {
    fun openRead(): InputStream?
    fun openPending(): OutputStream
    fun publish()
    fun erase()
}

/** Bounds reads even if the filesystem length changes or lies. Close failures are refusals.
 * No unbounded readBytes(), length-based allocation, or backup recovery path.
 */
internal class OneSlotNativeCacheStorage(private val files: NativeCacheFiles) : NativeCacheStorage {
    override fun read(): ByteArray? {
        val stream = files.openRead() ?: return null
        return stream.use {
            val bytes = ByteArray(NativeCacheCodec.MAX_BYTES)
            var size = 0
            while (size < bytes.size) {
                val count = it.read(bytes, size, bytes.size - size)
                if (count < 0) return@use bytes.copyOf(size)
                if (count == 0) throw IOException()
                size += count
            }
            if (it.read() != -1) throw IOException()
            bytes
        }
    }

    override fun write(bytes: ByteArray) {
        if (bytes.isEmpty() || bytes.size > NativeCacheCodec.MAX_BYTES) throw IOException()
        files.openPending().use { it.write(bytes); it.flush() }
        // publish only after successful write, flush, sync and close.
        files.publish()
    }

    override fun erase() = files.erase()
}
