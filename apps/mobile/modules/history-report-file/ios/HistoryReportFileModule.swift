import ExpoModulesCore
import QuickLook
import UIKit

public final class HistoryReportFileModule: Module {
  private var documentExport: ReportDocumentExport?

  public func definition() -> ModuleDefinition {
    Name("HistoryReportFile")

    AsyncFunction("present") { (action: String, address: String, promise: Promise) in
      guard let url = URL(string: address), url.isFileURL, FileManager.default.isReadableFile(atPath: url.path),
            let presenter = self.appContext?.utilities?.currentViewController(),
            presenter.viewIfLoaded?.window != nil, presenter.presentedViewController == nil else {
        promise.reject("HISTORY_PDF_UNAVAILABLE", "The PDF cannot be presented.")
        return
      }
      switch action {
      case "open":
        let preview = ReportPreview(url: url, promise: promise)
        guard QLPreviewController.canPreview(url as NSURL) else {
          promise.reject("HISTORY_PDF_UNAVAILABLE", "The PDF cannot be opened.")
          return
        }
        presenter.present(preview, animated: true)
      case "download":
        let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
        self.documentExport = ReportDocumentExport { [weak self] in
          self?.documentExport = nil
          promise.resolve(nil)
        }
        picker.delegate = self.documentExport
        presenter.present(picker, animated: true)
      case "share":
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = presenter.view
        sheet.completionWithItemsHandler = { _, _, _, error in
          if error != nil { promise.reject("HISTORY_PDF_UNAVAILABLE", "The PDF could not be shared.") }
          else { promise.resolve(nil) }
        }
        presenter.present(sheet, animated: true)
      default:
        promise.reject("HISTORY_PDF_UNAVAILABLE", "The PDF action is unavailable.")
      }
    }.runOnQueue(.main)
  }
}

private final class ReportPreview: QLPreviewController, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
  private let url: URL
  private let promise: Promise

  init(url: URL, promise: Promise) {
    self.url = url
    self.promise = promise
    super.init(nibName: nil, bundle: nil)
    dataSource = self
    delegate = self
  }

  required init?(coder: NSCoder) { return nil }

  func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
  func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { url as NSURL }
  func previewControllerDidDismiss(_ controller: QLPreviewController) { promise.resolve(nil) }
}

private final class ReportDocumentExport: NSObject, UIDocumentPickerDelegate {
  private let finish: () -> Void

  init(finish: @escaping () -> Void) { self.finish = finish }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { finish() }
  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finish() }
}
