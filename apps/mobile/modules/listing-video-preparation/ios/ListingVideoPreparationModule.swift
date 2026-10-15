import ExpoModulesCore

struct VideoPrepareRequest: Record {
  @Field var jobId: String = ""
  @Field var sourceUri: String = ""
  @Field var startMs: Int64 = 0
  @Field var endMs: Int64 = 0
  @Field var maxBytes: Int64 = 0
}

public class ListingVideoPreparationModule: Module {
  private let engine = VideoPreparationEngine()
  public func definition() -> ModuleDefinition {
    Name("ListingVideoPreparation")
    AsyncFunction("prepare") { (request: VideoPrepareRequest, promise: Promise) in
      self.engine.prepare(.init(jobId: request.jobId, sourceUri: request.sourceUri,
        startMs: request.startMs, endMs: request.endMs, maxBytes: request.maxBytes)) { result in
        switch result {
        case .success(let value): promise.resolve(value)
        case .failure(let error): promise.reject("PREPARATION_FAILED", error.localizedDescription)
        }
      }
    }
    AsyncFunction("cancel") { (jobId: String) in self.engine.cancel(jobId) }
    AsyncFunction("discard") { (jobId: String) in self.engine.discard(jobId) }
  }
}
