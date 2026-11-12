package tm.auto.listingvideo

import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.Metadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.muxer.BufferInfo
import androidx.media3.muxer.Muxer
import androidx.media3.transformer.DefaultMuxer
import java.nio.ByteBuffer

/**
 * Keeps every track of the prepared file inside the kept interval.
 *
 * Android AAC encoders prepend priming samples that the framework muxer does
 * not hide with an edit list, so the audio track ends ~60 ms after the video
 * and a 90-second interval becomes a 90.07-second file that the worker
 * refuses (#1050). Audio samples that would end past the interval are
 * dropped; the video track is given the exact interval duration.
 */
@OptIn(UnstableApi::class)
class IntervalMuxerFactory(private val durationUs: Long) : Muxer.Factory {
  private val delegate = DefaultMuxer.Factory().setVideoDurationUs(durationUs)

  override fun create(path: String): Muxer = IntervalMuxer(delegate.create(path), durationUs)

  override fun getSupportedSampleMimeTypes(trackType: @C.TrackType Int) = delegate.getSupportedSampleMimeTypes(trackType)
}

@OptIn(UnstableApi::class)
private class IntervalMuxer(private val delegate: Muxer, private val durationUs: Long) : Muxer {
  /** Track id -> duration of one encoded audio frame. */
  private val audioFrameUs = HashMap<Int, Long>()

  override fun addTrack(format: Format): Int {
    val id = delegate.addTrack(format)
    // 1024 samples per frame assumes AAC-LC, the only audio we request
    // (AUDIO_AAC with default profile). HE-AAC would use 2048.
    if (MimeTypes.isAudio(format.sampleMimeType) && format.sampleRate > 0) {
      audioFrameUs[id] = 1024L * 1_000_000L / format.sampleRate
    }
    return id
  }

  override fun writeSampleData(trackId: Int, data: ByteBuffer, bufferInfo: BufferInfo) {
    val frameUs = audioFrameUs[trackId]
    if (frameUs != null && bufferInfo.presentationTimeUs + frameUs > durationUs) return
    delegate.writeSampleData(trackId, data, bufferInfo)
  }

  override fun addMetadataEntry(entry: Metadata.Entry) = delegate.addMetadataEntry(entry)

  override fun close() = delegate.close()
}
