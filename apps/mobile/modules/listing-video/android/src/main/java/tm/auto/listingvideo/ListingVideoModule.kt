package tm.auto.listingvideo

import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/** Expo glue for [ListingVideoExporter]; the same contract as the iOS module. */
class ListingVideoModule : Module() {
  private val exporter by lazy {
    ListingVideoExporter(requireNotNull(appContext.reactContext) { "No React context" }.applicationContext)
  }

  override fun definition() = ModuleDefinition {
    Name("ListingVideo")

    Events("onProgress")

    AsyncFunction("prepare") { sourceUri: String, startS: Double, endS: Double, _: Double, jobId: String, promise: Promise ->
      val uri = Uri.parse(sourceUri)
      val path = uri.path
      if (uri.scheme != "file" || path.isNullOrEmpty()) {
        // `CodedException(code)` survives the bridge as the JS error's `code`.
        promise.reject(CodedException("invalid-source", "Source must be a file URL", null))
        return@AsyncFunction
      }
      exporter.prepare(
        File(path), startS, endS, jobId,
        onProgress = { fraction -> sendEvent("onProgress", mapOf("jobId" to jobId, "fraction" to fraction)) },
        onDone = { result ->
          result.fold(
            onSuccess = { info ->
              promise.resolve(
                mapOf(
                  "uri" to Uri.fromFile(info.file).toString(),
                  "durationS" to info.durationS,
                  "sizeBytes" to info.sizeBytes.toDouble(),
                  "width" to info.width,
                  "height" to info.height,
                  "fps" to info.fps,
                  "hasAudio" to info.hasAudio,
                ),
              )
            },
            onFailure = { error ->
              val code = (error as? ListingVideoExportException)?.code ?: "export-failed"
              promise.reject(CodedException(code, error.message ?: code, null))
            },
          )
        },
      )
    }

    Function("cancel") { jobId: String ->
      exporter.cancel(jobId)
    }
  }
}
