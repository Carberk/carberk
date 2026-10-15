import UIKit
import Foundation

/// Fixture-only simulator application. It exercises the production AVFoundation engine.
@main
final class NativeVideoProof: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  private var records: [[String: Any]] = []
  private let engine = VideoPreparationEngine(root: FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("proof-v2"))
  private let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
  private let label = UILabel()

  func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    let controller = UIViewController()
    controller.view.backgroundColor = .systemBackground
    label.numberOfLines = 0; label.text = "Native video preparation proof running"
    label.frame = CGRect(x: 24, y: 90, width: 340, height: 600)
    controller.view.addSubview(label)
    window = UIWindow(frame: UIScreen.main.bounds); window?.rootViewController = controller; window?.makeKeyAndVisible()
    next(0)
    return true
  }

  private func next(_ index: Int) {
    let cases: [(String, String, Int64, Int64)] = [
      ("flower", "flower", 1000, 4000),
      ("landscape60", "synthetic-4k60", 0, 1000),
      ("portrait60", "synthetic-portrait60", 500, 1500),
      ("exact90", "synthetic-91s", 0, 90_000)
    ]
    guard index < cases.count else { cancellationProof(); return }
    let (id, fixture, start, end) = cases[index]
    let source = Bundle.main.url(forResource: fixture, withExtension: "mp4")!
    engine.prepare(.init(jobId: id, sourceUri: source.absoluteString, startMs: start, endMs: end, maxBytes: 15 * 1024 * 1024)) { result in
      switch result {
      case .success(let facts): self.records.append(["case": id, "result": "pass", "facts": facts])
      case .failure(let error): self.records.append(["case": id, "result": "failed", "error": error.localizedDescription])
      }
      self.save()
      self.next(index + 1)
    }
  }

  private func cancellationProof() {
    let source = Bundle.main.url(forResource: "synthetic-91s", withExtension: "mp4")!
    engine.prepare(.init(jobId: "cancelled", sourceUri: source.absoluteString, startMs: 0, endMs: 90_000, maxBytes: 15 * 1024 * 1024)) { result in
      let refused: Bool
      switch result { case .success: refused = false; case .failure: refused = true }
      self.records.append(["case": "cancelled", "result": refused ? "pass" : "failed"])
      self.engine.prepare(.init(jobId: "../../unsafe", sourceUri: source.absoluteString, startMs: 0, endMs: 1000, maxBytes: 100_000)) { invalid in
        switch invalid {
        case .success: self.records.append(["case": "unsafe-id", "result": "failed"])
        case .failure: self.records.append(["case": "unsafe-id", "result": "pass"])
        }
        self.recoveryProof()
      }
    }
    DispatchQueue.global().asyncAfter(deadline: .now() + 0.05) { self.engine.cancel("cancelled") }
  }

  private func recoveryProof() {
    let output = documents.appendingPathComponent("proof-v2/flower/prepared.mp4")
    let journal = documents.appendingPathComponent("proof-v2/flower/prepared.json")
    do {
      let recreated = VideoPreparationEngine(root: documents.appendingPathComponent("proof-v2"))
      let facts = try recreated.inspect(output)
      let record = try JSONSerialization.jsonObject(with: Data(contentsOf: journal)) as! [String: Any]
      let valid = (facts["durationMs"] as! Double) == (record["durationMs"] as! Double)
      records.append(["case": "recreated-engine-completed-file", "result": valid ? "pass" : "failed"])
      let source = Bundle.main.url(forResource: "flower", withExtension: "mp4")!
      recreated.prepare(.init(jobId: "flower", sourceUri: source.absoluteString, startMs: 0, endMs: 1000, maxBytes: 1_000_000)) { duplicate in
        let retained = FileManager.default.fileExists(atPath: output.path)
        switch duplicate {
        case .success: self.records.append(["case": "duplicate-retains-completed", "result": "failed"])
        case .failure: self.records.append(["case": "duplicate-retains-completed", "result": retained ? "pass" : "failed"])
        }
        self.save(finished: true)
      }
    } catch {
      records.append(["case": "recreated-engine-completed-file", "result": "failed", "error": error.localizedDescription])
      save(finished: true)
    }
  }

  private func save(finished: Bool = false) {
    let receipt: [String: Any] = ["finished": finished, "records": records, "system": UIDevice.current.systemVersion]
    try! JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys])
      .write(to: documents.appendingPathComponent("receipt.json"), options: .atomic)
    DispatchQueue.main.async { self.label.text = self.records.map { "\($0["case"]!): \($0["result"]!)" }.joined(separator: "\n") + (finished ? "\nFinished" : "\nRunning") }
  }
}
