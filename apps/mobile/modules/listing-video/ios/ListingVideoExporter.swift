import AVFoundation
import CoreMedia
import Foundation

/// Errors the TypeScript layer maps 1:1 onto `ListingVideoErrorCode`.
public enum ListingVideoExportError: Error, Equatable {
  case sourceUnreadable
  case unsupportedSource
  case insufficientStorage
  case cancelled
  case outputTooLarge
  case exportFailed(String)

  public var code: String {
    switch self {
    case .sourceUnreadable: return "source-unreadable"
    case .unsupportedSource: return "unsupported-source"
    case .insufficientStorage: return "insufficient-storage"
    case .cancelled: return "cancelled"
    case .outputTooLarge: return "output-too-large"
    case .exportFailed: return "export-failed"
    }
  }
}

public struct PreparedVideoInfo {
  public let url: URL
  public let durationS: Double
  public let sizeBytes: Int64
  public let width: Int
  public let height: Int
  public let fps: Double
  public let hasAudio: Bool
}

/// Re-encodes only the kept interval of a library video into a staged
/// H.264/AAC file: at most 30 fps, fitted inside 1280x720 / 720x1280
/// without upscaling, HDR normalised to BT.709 SDR, at most 15 MiB.
///
/// Output is written to `prepared.partial.mp4` first and only moved to
/// `prepared.mp4` after `validateOutput` reopens it, so a half-written
/// file is never handed to a caller.
public final class ListingVideoExporter: @unchecked Sendable {
  public static let maxOutputBytes: Int64 = 15 * 1024 * 1024
  public static let audioBitrate = 128_000

  private let lock = NSLock()
  private var cancelledJobs = Set<String>()

  public init() {}

  public func cancel(jobId: String) {
    lock.lock()
    cancelledJobs.insert(jobId)
    lock.unlock()
  }

  private func clearCancelled(_ jobId: String) {
    lock.lock()
    cancelledJobs.remove(jobId)
    lock.unlock()
  }

  private func isCancelled(_ jobId: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return cancelledJobs.contains(jobId)
  }

  /// Video bitrate that fits the 15 MiB cap alongside 128 kbps audio.
  public static func videoBitrate(durationS: Double) -> Int {
    let budgetBits = Double(maxOutputBytes) * 8.0 * 0.97
    let perSecond = Int((budgetBits - Double(audioBitrate) * durationS) / durationS)
    return max(400_000, min(1_250_000, perSecond))
  }

  /// Fit inside the 720p envelope without upscaling; even dimensions.
  public static func fittedSize(width: Int, height: Int) -> (Int, Int) {
    let scale = min(1.0, 1280.0 / Double(max(width, height)), 720.0 / Double(min(width, height)))
    func even(_ v: Int) -> Int { max(2, Int(Double(v) * scale) / 2 * 2) }
    return (even(width), even(height))
  }

  public func prepare(
    source: URL,
    startS: Double,
    endS: Double,
    coverS: Double,
    jobId: String,
    onProgress: @escaping (Double) -> Void
  ) async throws -> PreparedVideoInfo {
    _ = coverS // Cover selection lives in the editor (#1047); range already validated in TS.
    let durationS = endS - startS
    let fileManager = FileManager.default
    let support = try fileManager.url(
      for: .applicationSupportDirectory, in: .userDomainMask,
      appropriateFor: nil, create: true)
    // Storage identity is native and independent of caller/session job IDs.
    // Never remove a previous prepared file to start another export.
    let jobDir = support.appendingPathComponent("listing-video/\(UUID().uuidString)", isDirectory: true)
    try fileManager.createDirectory(at: jobDir, withIntermediateDirectories: true)
    var succeeded = false
    defer {
      clearCancelled(jobId)
      if !succeeded { try? fileManager.removeItem(at: jobDir) }
    }

    // 1. Copy the library video into app storage; never export in place.
    let copied = jobDir.appendingPathComponent("source.\(source.pathExtension.isEmpty ? "mov" : source.pathExtension)")
    do {
      try fileManager.copyItem(at: source, to: copied)
    } catch let error as NSError {
      if error.domain == NSCocoaErrorDomain && error.code == NSFileWriteOutOfSpaceError {
        throw ListingVideoExportError.insufficientStorage
      }
      throw ListingVideoExportError.sourceUnreadable
    }
    if isCancelled(jobId) { throw ListingVideoExportError.cancelled }

    let asset = AVURLAsset(url: copied)
    let videoTracks = asset.tracks(withMediaType: .video)
    guard let videoTrack = videoTracks.first else {
      throw ListingVideoExportError.unsupportedSource
    }
    let audioTrack = asset.tracks(withMediaType: .audio).first
    let assetDuration = CMTimeGetSeconds(asset.duration)
    guard assetDuration.isFinite, endS <= assetDuration + 0.05 else {
      throw ListingVideoExportError.sourceUnreadable
    }

    // 2. Reader over only the kept interval.
    let start = CMTime(seconds: startS, preferredTimescale: 600)
    let range = CMTimeRange(start: start, duration: CMTime(seconds: durationS, preferredTimescale: 600))
    guard let reader = try? AVAssetReader(asset: asset) else {
      throw ListingVideoExportError.exportFailed("reader-init")
    }
    reader.timeRange = range

    let upright = videoTrack.naturalSize.applying(videoTrack.preferredTransform)
    let uprightW = Int(abs(upright.width).rounded())
    let uprightH = Int(abs(upright.height).rounded())
    guard uprightW > 0, uprightH > 0 else { throw ListingVideoExportError.unsupportedSource }
    let (outW, outH) = Self.fittedSize(width: uprightW, height: uprightH)

    let composition = AVMutableVideoComposition()
    composition.renderSize = CGSize(width: outW, height: outH)
    composition.frameDuration = CMTime(value: 1, timescale: 30)
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = range
    let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
    var transform = videoTrack.preferredTransform
    transform = transform.concatenating(
      CGAffineTransform(scaleX: Double(outW) / Double(uprightW), y: Double(outH) / Double(uprightH)))
    // Keep the frame inside the render rect after rotation.
    let scaled = CGRect(origin: .zero, size: videoTrack.naturalSize).applying(transform)
    transform = transform.concatenating(
      CGAffineTransform(translationX: -scaled.minX, y: -scaled.minY))
    layer.setTransform(transform, at: .zero)
    instruction.layerInstructions = [layer]
    composition.instructions = [instruction]

    let videoOutput = AVAssetReaderVideoCompositionOutput(
      videoTracks: [videoTrack], videoSettings: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
      ])
    videoOutput.videoComposition = composition
    guard reader.canAdd(videoOutput) else { throw ListingVideoExportError.unsupportedSource }
    reader.add(videoOutput)

    var audioOutput: AVAssetReaderTrackOutput?
    if let audioTrack {
      let output = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVNumberOfChannelsKey: 2,
        AVSampleRateKey: 44_100,
      ])
      if reader.canAdd(output) { reader.add(output); audioOutput = output }
    }

    // 3. Writer to a partial file; promoted only after validation.
    let partial = jobDir.appendingPathComponent("prepared.partial.mp4")
    let final = jobDir.appendingPathComponent("prepared.mp4")
    guard let writer = try? AVAssetWriter(outputURL: partial, fileType: .mp4) else {
      throw ListingVideoExportError.exportFailed("writer-init")
    }
    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: outW,
      AVVideoHeightKey: outH,
      AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
      ],
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: Self.videoBitrate(durationS: durationS),
        AVVideoExpectedSourceFrameRateKey: 30,
        AVVideoMaxKeyFrameIntervalKey: 30,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      ],
    ])
    videoInput.expectsMediaDataInRealTime = false
    guard writer.canAdd(videoInput) else { throw ListingVideoExportError.unsupportedSource }
    writer.add(videoInput)

    var audioInput: AVAssetWriterInput?
    if audioOutput != nil {
      let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVEncoderBitRateKey: Self.audioBitrate,
        AVNumberOfChannelsKey: 2,
        AVSampleRateKey: 44_100,
      ])
      input.expectsMediaDataInRealTime = false
      if writer.canAdd(input) { writer.add(input); audioInput = input }
    }

    guard reader.startReading() else {
      throw ListingVideoExportError.exportFailed(reader.error?.localizedDescription ?? "reader-start")
    }
    guard writer.startWriting() else {
      throw ListingVideoExportError.exportFailed(writer.error?.localizedDescription ?? "writer-start")
    }
    writer.startSession(atSourceTime: .zero)

    let progressBox = ProgressBox()
    let progressTask = Task {
      while !Task.isCancelled {
        onProgress(min(0.99, max(0, progressBox.value / durationS)))
        try? await Task.sleep(nanoseconds: 100_000_000)
      }
    }

    let offset = start
    func shifted(_ buffer: CMSampleBuffer) -> CMSampleBuffer? {
      var count: CMItemCount = 0
      CMSampleBufferGetSampleTimingInfoArray(buffer, entryCount: 0, arrayToFill: nil, entriesNeededOut: &count)
      guard count > 0 else { return buffer }
      var infos = [CMSampleTimingInfo](
        repeating: CMSampleTimingInfo(duration: .zero, presentationTimeStamp: .zero, decodeTimeStamp: .invalid),
        count: count)
      CMSampleBufferGetSampleTimingInfoArray(buffer, entryCount: count, arrayToFill: &infos, entriesNeededOut: nil)
      for i in infos.indices {
        infos[i].presentationTimeStamp = CMTimeSubtract(infos[i].presentationTimeStamp, offset)
        if infos[i].decodeTimeStamp.isValid {
          infos[i].decodeTimeStamp = CMTimeSubtract(infos[i].decodeTimeStamp, offset)
        }
      }
      var shiftedBuffer: CMSampleBuffer?
      CMSampleBufferCreateCopyWithNewTiming(
        allocator: nil, sampleBuffer: buffer, sampleTimingEntryCount: count,
        sampleTimingArray: &infos, sampleBufferOut: &shiftedBuffer)
      return shiftedBuffer
    }

    let group = DispatchGroup()
    func pump(
      output: AVAssetReaderOutput, input: AVAssetWriterInput, isVideo: Bool
    ) {
      group.enter()
      let state = PumpState()
      let queue = DispatchQueue(label: "listing-video.pump.\(isVideo ? "v" : "a")")
      input.requestMediaDataWhenReady(on: queue) {
        while input.isReadyForMoreMediaData {
          if self.isCancelled(jobId) {
            reader.cancelReading()
            input.markAsFinished()
            if state.finishOnce() { group.leave() }
            return
          }
          guard let buffer = output.copyNextSampleBuffer() else {
            input.markAsFinished()
            if state.finishOnce() { group.leave() }
            return
          }
          if isVideo {
            progressBox.value = max(
              progressBox.value,
              CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(buffer)) - startS)
          }
          if let out = shifted(buffer) { input.append(out) }
        }
      }
    }
    pump(output: videoOutput, input: videoInput, isVideo: true)
    if let audioOutput, let audioInput { pump(output: audioOutput, input: audioInput, isVideo: false) }

    await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
      group.notify(queue: .global()) { c.resume() }
    }
    progressTask.cancel()

    if isCancelled(jobId) {
      writer.cancelWriting()
      try? fileManager.removeItem(at: partial)
      throw ListingVideoExportError.cancelled
    }
    if reader.status == .failed {
      writer.cancelWriting()
      try? fileManager.removeItem(at: partial)
      throw ListingVideoExportError.exportFailed(reader.error?.localizedDescription ?? "reader-failed")
    }
    await writer.finishWritingAsync()
    guard writer.status == .completed else {
      try? fileManager.removeItem(at: partial)
      throw ListingVideoExportError.exportFailed(writer.error?.localizedDescription ?? "writer-failed")
    }
    onProgress(1)

    // 4. Reject half-written output before any caller sees it.
    let info: PreparedVideoInfo
    do {
      info = try Self.validateOutput(at: partial, expectedDurationS: durationS)
    } catch {
      try? fileManager.removeItem(at: partial)
      throw error
    }
    if isCancelled(jobId) {
      try? fileManager.removeItem(at: partial)
      try? fileManager.removeItem(at: final)
      throw ListingVideoExportError.cancelled
    }
    try fileManager.removeItem(at: copied)
    try fileManager.moveItem(at: partial, to: final)
    succeeded = true
    return PreparedVideoInfo(
      url: final, durationS: info.durationS, sizeBytes: info.sizeBytes,
      width: info.width, height: info.height, fps: info.fps, hasAudio: info.hasAudio)
  }

  /// Reopens a finished file and proves it is complete and inside limits.
  /// Truncated / half-written files fail here, never reach a caller.
  public static func validateOutput(at url: URL, expectedDurationS: Double) throws -> PreparedVideoInfo {
    let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
    let size = (attrs?[.size] as? NSNumber)?.int64Value ?? 0
    guard size > 0 else { throw ListingVideoExportError.exportFailed("empty-output") }
    guard size <= maxOutputBytes else { throw ListingVideoExportError.outputTooLarge }
    let asset = AVURLAsset(url: url)
    guard let track = asset.tracks(withMediaType: .video).first else {
      throw ListingVideoExportError.exportFailed("missing-video-track")
    }
    let duration = CMTimeGetSeconds(asset.duration)
    guard duration.isFinite, abs(duration - expectedDurationS) <= 0.75 else {
      throw ListingVideoExportError.exportFailed("duration-mismatch")
    }
    let size2 = track.naturalSize.applying(track.preferredTransform)
    return PreparedVideoInfo(
      url: url,
      durationS: duration,
      sizeBytes: size,
      width: Int(abs(size2.width).rounded()),
      height: Int(abs(size2.height).rounded()),
      fps: Double(track.nominalFrameRate),
      hasAudio: !asset.tracks(withMediaType: .audio).isEmpty)
  }
}

private final class PumpState: @unchecked Sendable {
  private let lock = NSLock()
  private var finished = false
  func finishOnce() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if finished { return false }
    finished = true
    return true
  }
}

private final class ProgressBox: @unchecked Sendable {
  private let lock = NSLock()
  private var stored = 0.0
  var value: Double {
    get { lock.lock(); defer { lock.unlock() }; return stored }
    set { lock.lock(); stored = newValue; lock.unlock() }
  }
}

private extension AVAssetWriter {
  func finishWritingAsync() async {
    await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
      finishWriting { c.resume() }
    }
  }
}
