import AVFoundation
import Foundation

/// AVFoundation engine shared by the Expo boundary and a focused native proof harness.
final class VideoPreparationEngine {
  struct Selection {
    let jobId: String
    let sourceUri: String
    let startMs: Int64
    let endMs: Int64
    let maxBytes: Int64
  }
  private struct Run {
    let id: String
    let reader: AVAssetReader
    let writer: AVAssetWriter
  }
  private let root: URL
  private let queue = DispatchQueue(label: "tm.auto.video.prepare")
  private let lock = NSLock()
  private var run: Run?
  private var cancelled = Set<String>()

  init(root: URL? = nil) {
    self.root = root ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("listing-video-preparation", isDirectory: true)
  }

  func prepare(_ input: Selection, completion: @escaping (Result<[String: Any], Error>) -> Void) {
    queue.async {
      var ownedDirectory: URL?
      do {
        guard input.jobId.range(of: "^[a-zA-Z0-9-]{1,80}$", options: .regularExpression) != nil,
          input.startMs >= 0, input.endMs > input.startMs, input.endMs - input.startMs <= 90_000,
          input.maxBytes > 0, let source = URL(string: input.sourceUri), source.isFileURL else {
          throw self.failure("INVALID_SELECTION")
        }
        self.lock.lock()
        guard self.run == nil else { self.lock.unlock(); throw self.failure("BUSY") }
        guard !self.cancelled.contains(input.jobId) else { self.lock.unlock(); throw self.failure("CANCELLED") }
        self.lock.unlock()
        let directory = self.root.appendingPathComponent(input.jobId, isDirectory: true)
        let destination = directory.appendingPathComponent("prepared.mp4")
        guard !FileManager.default.fileExists(atPath: destination.path) else { throw self.failure("JOB_COMPLETED") }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        ownedDirectory = directory
        var noBackup = URLResourceValues(); noBackup.isExcludedFromBackup = true
        var mutableDirectory = directory; try mutableDirectory.setResourceValues(noBackup)
        let partial = directory.appendingPathComponent("output.partial.mp4")
        try? FileManager.default.removeItem(at: partial)
        let sourceBytes = try source.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard sourceBytes > 0 && Int64(sourceBytes) <= 2 * 1024 * 1024 * 1024 else { throw self.failure("SOURCE_SIZE") }
        let free = try FileManager.default.attributesOfFileSystem(forPath: directory.path)[.systemFreeSize] as? NSNumber
        guard (free?.int64Value ?? 0) > input.maxBytes * 2 + 8 * 1024 * 1024 else { throw self.failure("STORAGE") }
        let asset = AVURLAsset(url: source, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
        let durationMs = CMTimeGetSeconds(asset.duration) * 1000
        guard durationMs.isFinite && durationMs <= 600_000 && Double(input.endMs) <= durationMs,
          let track = asset.tracks(withMediaType: .video).first else { throw self.failure("SOURCE_UNREADABLE") }
        let sourceRect = CGRect(origin: .zero, size: track.naturalSize).applying(track.preferredTransform)
        let width = abs(sourceRect.width); let height = abs(sourceRect.height)
        guard width >= 2 && height >= 2 else { throw self.failure("SOURCE_DIMENSIONS") }
        let scale = min(1, min((width >= height ? 1280 : 720) / width, (width >= height ? 720 : 1280) / height))
        let size = CGSize(width: max(2, floor(width * scale / 2) * 2), height: max(2, floor(height * scale / 2) * 2))
        let composition = AVMutableVideoComposition()
        composition.renderSize = size
        composition.frameDuration = CMTime(value: 1, timescale: 30)
        composition.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
        composition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
        composition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: asset.duration)
        let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
        let transform = track.preferredTransform
          .concatenating(CGAffineTransform(translationX: -sourceRect.minX, y: -sourceRect.minY))
          .concatenating(CGAffineTransform(scaleX: scale, y: scale))
        layer.setTransform(transform, at: .zero)
        instruction.layerInstructions = [layer]; composition.instructions = [instruction]
        let reader = try AVAssetReader(asset: asset)
        let start = CMTime(value: input.startMs, timescale: 1000)
        reader.timeRange = CMTimeRange(start: start, duration: CMTime(value: input.endMs - input.startMs, timescale: 1000))
        let videoOutput = AVAssetReaderVideoCompositionOutput(videoTracks: [track], videoSettings: [
          kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
        ])
        videoOutput.videoComposition = composition; videoOutput.alwaysCopiesSampleData = false
        reader.add(videoOutput)
        let writer = try AVAssetWriter(outputURL: partial, fileType: .mp4)
        writer.shouldOptimizeForNetworkUse = true
        let bitrate = max(96_000, min(4_000_000, Int(Double(input.maxBytes) * 8000 / Double(input.endMs - input.startMs) * 0.90 - 128_000)))
        let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
          AVVideoCodecKey: AVVideoCodecType.h264,
          AVVideoWidthKey: Int(size.width), AVVideoHeightKey: Int(size.height),
          AVVideoColorPropertiesKey: [AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
            AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
            AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2],
          AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: bitrate,
            AVVideoExpectedSourceFrameRateKey: 30, AVVideoMaxKeyFrameIntervalKey: 60]
        ])
        videoInput.expectsMediaDataInRealTime = false; writer.add(videoInput)
        var pairs: [(AVAssetReaderOutput, AVAssetWriterInput)] = [(videoOutput, videoInput)]
        if let audio = asset.tracks(withMediaType: .audio).first {
          let output = AVAssetReaderTrackOutput(track: audio, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM])
          output.alwaysCopiesSampleData = false; reader.add(output)
          let audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: [
            AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: 96_000])
          audioInput.expectsMediaDataInRealTime = false; writer.add(audioInput); pairs.append((output, audioInput))
        }
        self.lock.lock(); self.run = Run(id: input.jobId, reader: reader, writer: writer); self.lock.unlock()
        guard writer.startWriting() && reader.startReading() else { throw writer.error ?? reader.error ?? self.failure("EXPORT_START") }
        writer.startSession(atSourceTime: .zero)
        let group = DispatchGroup()
        for (index, pair) in pairs.enumerated() {
          group.enter()
          let (output, sink) = pair
          DispatchQueue(label: "tm.auto.video.stream.\(index)").async {
            defer { group.leave() }
            while !self.isCancelled(input.jobId) && writer.status == .writing {
              guard reader.status == .reading else { break }
              if !sink.isReadyForMoreMediaData {
                Thread.sleep(forTimeInterval: 0.002)
                continue
              }
              guard let sample = output.copyNextSampleBuffer() else { break }
              do {
                let retimed = try self.retime(sample, origin: start)
                if !sink.append(retimed) { reader.cancelReading(); break }
              } catch { reader.cancelReading(); break }
            }
            if writer.status == .writing { sink.markAsFinished() }
          }
        }

        group.notify(queue: self.queue) {
          if self.isCancelled(input.jobId) || writer.status == .cancelled || reader.status == .failed || reader.status == .cancelled {
            self.finishFailure(input.jobId, directory, self.failure("CANCELLED_OR_FAILED"), completion); return
          }
          writer.finishWriting {
            self.queue.async {
              do {
                guard writer.status == .completed && !self.isCancelled(input.jobId) else {
                  throw writer.error ?? self.failure("CANCELLED_OR_FAILED")
                }
                var facts = try self.inspect(partial)
                let length = try partial.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                let producedDuration = facts["durationMs"] as! Double
                guard length > 0 && length <= input.maxBytes && producedDuration <= 90_000,
                  abs(producedDuration - Double(input.endMs - input.startMs)) <= 100,
                  (facts["width"] as! Int) <= Int(size.width), (facts["height"] as! Int) <= Int(size.height),
                  (facts["fps"] as! Double) <= 30 else { throw self.failure("INVALID_OUTPUT") }
                try FileManager.default.moveItem(at: partial, to: destination)
                facts["uri"] = destination.absoluteString; facts["sizeBytes"] = length
                let journal = directory.appendingPathComponent("prepared.json")
                try JSONSerialization.data(withJSONObject: facts).write(to: journal, options: .atomic)
                self.lock.lock(); self.run = nil; self.lock.unlock()
                completion(.success(facts))
              } catch { self.finishFailure(input.jobId, directory, error, completion) }
            }
          }
        }
      } catch { self.finishFailure(input.jobId, ownedDirectory, error, completion) }
    }
  }

  func cancel(_ jobId: String) {
    lock.lock(); cancelled.insert(jobId); let current = run; lock.unlock()
    if current?.id == jobId { current?.reader.cancelReading(); current?.writer.cancelWriting() }
  }

  func discard(_ jobId: String) {
    guard jobId.range(of: "^[a-zA-Z0-9-]{1,80}$", options: .regularExpression) != nil else { return }
    cancel(jobId)
    queue.async { try? FileManager.default.removeItem(at: self.root.appendingPathComponent(jobId)) }
  }

  func inspect(_ file: URL) throws -> [String: Any] {
    let asset = AVURLAsset(url: file)
    guard let video = asset.tracks(withMediaType: .video).first,
      let value = video.formatDescriptions.first else { throw failure("OUTPUT_CODEC") }
    let description = value as! CMFormatDescription
    guard CMFormatDescriptionGetMediaSubType(description) == kCMVideoCodecType_H264 else { throw failure("OUTPUT_CODEC") }
    let colour = CMFormatDescriptionGetExtension(description, extensionKey: kCMFormatDescriptionExtension_ColorPrimaries) as? String
    let transfer = CMFormatDescriptionGetExtension(description, extensionKey: kCMFormatDescriptionExtension_TransferFunction) as? String
    guard colour == AVVideoColorPrimaries_ITU_R_709_2 && transfer == AVVideoTransferFunction_ITU_R_709_2 else { throw failure("OUTPUT_COLOUR") }
    let audio = asset.tracks(withMediaType: .audio).first
    if let value = audio?.formatDescriptions.first {
      let description = value as! CMFormatDescription
      guard CMFormatDescriptionGetMediaSubType(description) == kAudioFormatMPEG4AAC else { throw failure("OUTPUT_AUDIO") }
    }
    let reader = try AVAssetReader(asset: asset)
    let samples = AVAssetReaderTrackOutput(track: video, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange])
    reader.add(samples)
    guard reader.startReading() else { throw reader.error ?? failure("OUTPUT_SAMPLES") }
    var timestamps = Set<Int64>()
    while let sample = samples.copyNextSampleBuffer() {
      let time = CMSampleBufferGetPresentationTimeStamp(sample)
      let microseconds = CMTimeConvertScale(time, timescale: 1_000_000, method: .default).value
      guard microseconds >= 0 && timestamps.insert(microseconds).inserted else { throw failure("OUTPUT_TIMESTAMPS") }
    }
    let seconds = CMTimeGetSeconds(video.timeRange.duration)
    guard reader.status == .completed && !timestamps.isEmpty && seconds > 0 else { throw failure("OUTPUT_SAMPLES") }
    return ["durationMs": CMTimeGetSeconds(asset.duration) * 1000,
      "width": Int(abs(video.naturalSize.width)), "height": Int(abs(video.naturalSize.height)),
      "fps": Double(timestamps.count) / seconds, "videoCodec": "h264", "audioCodec": audio == nil ? NSNull() : "aac",
      "colour": "bt709"]
  }

  private func retime(_ sample: CMSampleBuffer, origin: CMTime) throws -> CMSampleBuffer {
    var count = 0
    guard CMSampleBufferGetSampleTimingInfoArray(sample, entryCount: 0, arrayToFill: nil, entriesNeededOut: &count) == noErr else { throw failure("TIMING") }
    var timings = Array(repeating: CMSampleTimingInfo(), count: count)
    guard CMSampleBufferGetSampleTimingInfoArray(sample, entryCount: count, arrayToFill: &timings, entriesNeededOut: &count) == noErr else { throw failure("TIMING") }
    for i in timings.indices {
      timings[i].presentationTimeStamp = CMTimeSubtract(timings[i].presentationTimeStamp, origin)
      if timings[i].decodeTimeStamp.isValid { timings[i].decodeTimeStamp = CMTimeSubtract(timings[i].decodeTimeStamp, origin) }
    }
    var copy: CMSampleBuffer?
    guard CMSampleBufferCreateCopyWithNewTiming(allocator: kCFAllocatorDefault, sampleBuffer: sample,
      sampleTimingEntryCount: count, sampleTimingArray: &timings, sampleBufferOut: &copy) == noErr,
      let copy else { throw failure("TIMING") }
    return copy
  }

  private func isCancelled(_ id: String) -> Bool { lock.lock(); defer { lock.unlock() }; return cancelled.contains(id) }
  private func failure(_ code: String) -> NSError { NSError(domain: "ListingVideoPreparation", code: 1, userInfo: [NSLocalizedDescriptionKey: code]) }
  private func finishFailure(_ id: String, _ directory: URL?, _ error: Error,
    _ completion: @escaping (Result<[String: Any], Error>) -> Void) {
    lock.lock(); if directory != nil && run?.id == id { run = nil }; lock.unlock()
    if let directory { try? FileManager.default.removeItem(at: directory) }
    completion(.failure(error))
  }
}
