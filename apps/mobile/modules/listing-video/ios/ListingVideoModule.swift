import ExpoModulesCore
import Foundation

/// Expo glue for `ListingVideoExporter`. All export logic lives in the
/// exporter so the same file is exercised by the Simulator proof harness.
public final class ListingVideoModule: Module {
  private let exporter = ListingVideoExporter()

  public func definition() -> ModuleDefinition {
    Name("ListingVideo")

    Events("onProgress")

    AsyncFunction("prepare") {
      (sourceUri: String, startS: Double, endS: Double, coverS: Double, jobId: String) -> [String: Any] in
      guard let source = URL(string: sourceUri), source.isFileURL else {
        throw Exception(
          name: "ListingVideoException",
          description: "Source must be a file URL",
          code: "invalid-source")
      }
      do {
        let info = try await exporter.prepare(
          source: source.path.isEmpty ? source : URL(fileURLWithPath: source.path),
          startS: startS, endS: endS, coverS: coverS, jobId: jobId
        ) { [weak self] fraction in
          self?.sendEvent("onProgress", ["jobId": jobId, "fraction": fraction])
        }
        return [
          "uri": info.url.absoluteString,
          "durationS": info.durationS,
          "sizeBytes": info.sizeBytes,
          "width": info.width,
          "height": info.height,
          "fps": info.fps,
          "hasAudio": info.hasAudio,
        ]
      } catch let error as ListingVideoExportError {
        // `Exception(code:)` survives the bridge as the JS error's `code`;
        // a bare NSError would surface as ERR_UNEXPECTED instead.
        throw Exception(
          name: "ListingVideoException",
          description: "\(error)",
          code: error.code)
      }
    }

    Function("cancel") { (jobId: String) in
      exporter.cancel(jobId: jobId)
    }
  }
}
