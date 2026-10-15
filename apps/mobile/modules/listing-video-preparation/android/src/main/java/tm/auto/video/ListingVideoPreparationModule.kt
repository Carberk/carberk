package tm.auto.video

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ListingVideoPreparationModule : Module() {
  private val engine by lazy { VideoPreparationEngine(requireNotNull(appContext.reactContext)) }
  override fun definition() = ModuleDefinition {
    Name("ListingVideoPreparation")
    AsyncFunction("prepare") { request: Map<String, Any>, promise: Promise ->
      engine.prepare(VideoPreparationEngine.Selection(
        request["jobId"] as String, request["sourceUri"] as String,
        (request["startMs"] as Number).toLong(), (request["endMs"] as Number).toLong(),
        (request["maxBytes"] as Number).toLong()), object : VideoPreparationEngine.Completion {
        override fun success(value: Map<String, Any?>) { promise.resolve(value) }
        override fun failure(code: String, message: String) { promise.reject(code, message, null) }
      })
    }
    AsyncFunction("cancel") { jobId: String, promise: Promise -> engine.cancel(jobId) { promise.resolve(null) } }
    AsyncFunction("discard") { jobId: String, promise: Promise -> engine.discard(jobId) { promise.resolve(null) } }
  }
}
