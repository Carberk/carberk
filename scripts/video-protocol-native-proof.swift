import AVFoundation
import Foundation

// Desktop AVFoundation network feasibility only, not the Expo iOS/Android app.
@main
struct NativeGatewayProof {
  static func main() {
    guard CommandLine.arguments.count == 2, let url = URL(string: CommandLine.arguments[1]) else { exit(2) }
    let item = AVPlayerItem(url: url)
    let output = AVPlayerItemVideoOutput(pixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
    item.add(output)
    let player = AVPlayer(playerItem: item)
    player.isMuted = true
    player.play()
    let deadline = Date().addingTimeInterval(12)
    var decoded = false
    while Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.05))
      let time = output.itemTime(forHostTime: CACurrentMediaTime())
      if output.hasNewPixelBuffer(forItemTime: time), output.copyPixelBuffer(forItemTime: time, itemTimeForDisplay: nil) != nil {
        decoded = true; break
      }
      if item.status == .failed { break }
    }
    let finalStatus = item.status.rawValue
    player.pause(); player.replaceCurrentItem(with: nil)
    print("{\"native\":\"desktop-AVFoundation\",\"decodedFrame\":\(decoded),\"status\":\(finalStatus)}")
    exit(decoded ? 0 : 1)
  }
}
