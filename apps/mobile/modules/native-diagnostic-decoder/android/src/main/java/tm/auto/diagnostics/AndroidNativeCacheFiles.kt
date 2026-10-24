package tm.auto.diagnostics

import android.content.Context
import android.system.Os
import android.system.OsConstants
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.OutputStream

/** Android app-private no-backup storage. Not external/cache/JS-controlled storage. No backup
 * restore or AtomicFile backup recovery: orphan pending bytes are deleted, never promoted.
 * Construction does not read/write events. Sole coordinator ownership is mandatory.
 */
internal class AndroidNativeCacheFiles(context: Context) : NativeCacheFiles {
    private val directory = File(context.noBackupFilesDir, "native-diagnostic-minimized-v1")
    private val slot = File(directory, "event")
    private val pending = File(directory, "event.pending")

    override fun openRead(): FileInputStream? {
        remove(pending)
        if (!slot.exists()) return null
        if (!slot.isFile) throw IOException()
        return FileInputStream(slot)
    }

    override fun openPending(): OutputStream {
        if (!directory.isDirectory && !directory.mkdirs()) throw IOException()
        remove(pending)
        val stream = FileOutputStream(pending, false)
        return object : OutputStream() {
            override fun write(value: Int) = stream.write(value)
            override fun write(bytes: ByteArray, offset: Int, length: Int) = stream.write(bytes, offset, length)
            override fun flush() = stream.flush()
            override fun close() {
                // Always attempt actual close even on sync failure. No exception text escapes logs.
                try { stream.fd.sync() } finally { stream.close() }
            }
        }
    }

    override fun publish() {
        try {
            Os.rename(pending.absolutePath, slot.absolutePath)
            syncDirectory()
        } catch (_: android.system.ErrnoException) { throw IOException() }
    }

    override fun erase() {
        // Try every deletion even if an earlier one fails; never silently accept partial erasure.
        var failed = false
        for (file in listOf(slot, pending)) {
            try { remove(file) } catch (_: IOException) { failed = true }
        }
        if (directory.exists()) {
            try { syncDirectory() } catch (_: android.system.ErrnoException) { failed = true }
        }
        if (failed) throw IOException()
    }

    private fun remove(file: File) {
        if (file.exists() && !file.delete()) throw IOException()
    }

    private fun syncDirectory() {
        val descriptor = Os.open(directory.absolutePath, OsConstants.O_RDONLY or OsConstants.O_DIRECTORY, 0)
        try { Os.fsync(descriptor) } finally { Os.close(descriptor) }
    }
}

/** Dormant, unregistered factory. It cannot acquire authority or query OS history. */
internal fun dormantAndroidNativeCache(context: Context): NativeCacheCoordinator =
    NativeCacheCoordinator.dormant(AndroidExitInfoPlatform(context),
        OneSlotNativeCacheStorage(AndroidNativeCacheFiles(context)))
