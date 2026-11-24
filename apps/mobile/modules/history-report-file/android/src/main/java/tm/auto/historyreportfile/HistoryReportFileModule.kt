package tm.auto.historyreportfile

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HistoryReportFileModule : Module() {
  private val reportRequest = 17428
  private var pending: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("HistoryReportFile")

    AsyncFunction("present") { action: String, address: String, promise: Promise ->
      val activity = appContext.currentActivity
      val uri = Uri.parse(address)
      if (activity == null || uri.scheme != "content" || pending != null || action !in setOf("open", "share")) {
        promise.reject("HISTORY_PDF_UNAVAILABLE", "The PDF cannot be presented.", null)
        return@AsyncFunction
      }

      val intent = if (action == "open") {
        Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/pdf")
      } else {
        Intent(Intent.ACTION_SEND).setType("application/pdf").putExtra(Intent.EXTRA_STREAM, uri)
      }
      intent.clipData = ClipData.newRawUri(null, uri)
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      pending = promise
      try {
        activity.startActivityForResult(if (action == "share") Intent.createChooser(intent, null) else intent, reportRequest)
      } catch (_: Exception) {
        pending = null
        promise.reject("HISTORY_PDF_UNAVAILABLE", "The PDF could not be opened or shared.", null)
      }
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)

    OnActivityResult { _, result ->
      if (result.requestCode == reportRequest) {
        pending?.resolve(null)
        pending = null
      }
    }
  }
}
