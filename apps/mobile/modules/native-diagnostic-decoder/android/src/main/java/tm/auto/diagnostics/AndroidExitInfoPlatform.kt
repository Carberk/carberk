package tm.auto.diagnostics

import android.annotation.TargetApi
import android.app.ActivityManager
import android.app.Application
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.os.Process
import java.io.InputStream

/** Actual API-31+ OS boundary. Constructing this object does not read history or acquire a trace. */
internal class AndroidExitInfoPlatform(private val context: Context) : ExitInfoPlatform {
    override val apiLevel: Int get() = Build.VERSION.SDK_INT

    @TargetApi(31)
    override fun currentProcess(): ExitProcess =
        ExitProcess(context.packageName, Application.getProcessName(), Process.myUid())

    @TargetApi(31)
    override fun history(packageName: String, maxRecords: Int): List<ExitRecord>? {
        require(maxRecords == ApplicationExitInfoHost.HISTORY_LIMIT)
        val manager = context.getSystemService(ActivityManager::class.java) ?: return null
        val records = manager.getHistoricalProcessExitReasons(packageName, 0, maxRecords)
        // Refuse even an unexpectedly oversized OS answer before mapping or iterating it.
        if (records.size >= maxRecords) return null
        return records.map { AndroidExitRecord(it) }
    }

    @TargetApi(31)
    private class AndroidExitRecord(private val record: ApplicationExitInfo) : ExitRecord {
        override val nativeCrash: Boolean get() = record.reason == ApplicationExitInfo.REASON_CRASH_NATIVE
        override val timestampMs: Long get() = record.timestamp
        override val processName: String? get() = record.processName
        override val realUid: Int get() = record.realUid
        override val packageUid: Int get() = record.packageUid
        // Null includes the OS global tombstone buffer having overwritten the crash.
        override fun openTrace(): InputStream? = record.traceInputStream
    }
}

/** Deliberately unavailable. There is no installed manifest/provenance or current actor issuer.
 * This is internal source preparation only, not a bridge or a startup collection hook.
 */
internal fun dormantAndroidExitInfoHost(context: Context): ApplicationExitInfoHost =
    ApplicationExitInfoHost(AndroidExitInfoPlatform(context), UnavailableNativeHostAuthority, null,
        System::currentTimeMillis)
