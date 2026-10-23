package tm.auto.video

import java.security.MessageDigest

import android.content.Context
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.FrameDropEffect
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors
import kotlin.math.floor
import kotlin.math.min

@UnstableApi
class VideoPreparationEngine(private val context: Context) {
  data class Selection(val jobId: String, val sourceUri: String, val startMs: Long,
    val endMs: Long, val maxBytes: Long)
  interface Completion {
    fun success(value: Map<String, Any?>)
    fun failure(code: String, message: String)
  }
  private data class Running(val id: String, val transformer: Transformer, val directory: File,
    val completion: Completion)
  private val main = Handler(Looper.getMainLooper())
  private val io = Executors.newSingleThreadExecutor()
  private var running: Running? = null
  private val root get() = File(context.noBackupFilesDir, "listing-video-preparation")

  fun prepare(input: Selection, completion: Completion) {
    main.post {
      if (running != null) { completion.failure("BUSY", "Preparation already running"); return@post }
      if (!input.jobId.matches(Regex("[a-zA-Z0-9-]{1,80}")) || input.startMs < 0 ||
        input.endMs <= input.startMs || input.endMs - input.startMs > 90_000 || input.maxBytes <= 0 ||
        Uri.parse(input.sourceUri).scheme !in listOf("file", "content")) {
        completion.failure("INVALID_SELECTION", "Invalid local video interval"); return@post
      }
      val directory = File(root, input.jobId)
      // Refuse without deleting a previous completed generation.
      if (File(directory, "prepared.mp4").exists()) {
        completion.failure("JOB_COMPLETED", "Job already completed"); return@post
      }
      try {
        directory.mkdirs()
        File(directory, "output.partial.mp4").delete()
        File(directory, "prepared.json").delete()
        val source = MediaMetadataRetriever()
        val width: Int
        val height: Int
        try {
          source.setDataSource(context, Uri.parse(input.sourceUri))
          val duration = source.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)!!.toLong()
          require(input.endMs <= duration && duration <= 600_000) { "Source duration unsupported" }
          val rotation = source.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toInt() ?: 0
          val rawWidth = source.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)!!.toInt()
          val rawHeight = source.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)!!.toInt()
          width = if (rotation % 180 != 0) rawHeight else rawWidth
          height = if (rotation % 180 != 0) rawWidth else rawHeight
        } finally { source.release() }
        context.contentResolver.openAssetFileDescriptor(Uri.parse(input.sourceUri), "r")?.use {
          require(it.length < 0 || it.length <= 2L * 1024 * 1024 * 1024) { "Source too large" }
        } ?: error("Source inaccessible")
        require(width >= 2 && height >= 2) { "Source dimensions unsupported" }
        val maximumWidth = if (width >= height) 1280 else 720
        val maximumHeight = if (width >= height) 720 else 1280
        val scale = min(1.0, min(maximumWidth.toDouble() / width, maximumHeight.toDouble() / height))
        val outputWidth = (floor(width * scale / 2) * 2).toInt().coerceAtLeast(2)
        val outputHeight = (floor(height * scale / 2) * 2).toInt().coerceAtLeast(2)
        // Reserve audio/container headroom; size is validated after export, never assumed.
        val budget = (input.maxBytes * 8_000.0 / (input.endMs - input.startMs) * .90 - 128_000)
          .toInt().coerceIn(96_000, 4_000_000)
        require(directory.usableSpace > input.maxBytes * 2 + 8 * 1024 * 1024) { "Insufficient storage" }
        val mediaItem = MediaItem.Builder().setUri(input.sourceUri).setClippingConfiguration(
          MediaItem.ClippingConfiguration.Builder().setStartPositionMs(input.startMs)
            .setEndPositionMs(input.endMs).build()).build()
        val edited = EditedMediaItem.Builder(mediaItem).setEffects(Effects(emptyList(), listOf(
          Presentation.createForWidthAndHeight(outputWidth, outputHeight, Presentation.LAYOUT_SCALE_TO_FIT),
          FrameDropEffect.createDefaultFrameDropEffect(30f)))).build()
        val composition = Composition.Builder(EditedMediaItemSequence.Builder(edited).build())
          .setHdrMode(Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL).build()
        val partial = File(directory, "output.partial.mp4")
        val transformer = Transformer.Builder(context)
          .setVideoMimeType(MimeTypes.VIDEO_H264).setAudioMimeType(MimeTypes.AUDIO_AAC)
          .setEncoderFactory(DefaultEncoderFactory.Builder(context).setRequestedVideoEncoderSettings(
            VideoEncoderSettings.Builder().setBitrate(budget)
              .setBitrateMode(MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR).build()).build())
          .addListener(object : Transformer.Listener {
            override fun onCompleted(composition: Composition, result: ExportResult) {
              val active = running ?: return
              if (active.id != input.jobId) return
              // Keep the job occupied during validation; cancellation fences the later IO result.
              io.execute {
                try {
                  val facts = inspect(partial)
                  val duration = (facts["durationMs"] as Number).toDouble()
                  require(duration <= 90_000 && kotlin.math.abs(duration - (input.endMs - input.startMs)) <= 100)
                  require(partial.length() in 1..input.maxBytes)
                  require((facts["fps"] as Double) <= 30) { "Frame rate exceeds normalization" }
                  require((facts["width"] as Int) <= outputWidth && (facts["height"] as Int) <= outputHeight) { "Encoder changed output dimensions" }
                  require(facts["colour"] == "bt709") { "Unproven SDR colour output" }
                  val digest = MessageDigest.getInstance("SHA-256")
                  partial.inputStream().use { stream ->
                    val buffer = ByteArray(65_536)
                    while (true) {
                      val count = stream.read(buffer)
                      if (count < 0) break
                      digest.update(buffer, 0, count)
                    }
                  }
                  val sha256 = digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
                  main.post {
                    if (running !== active) { partial.delete(); return@post }
                    try {
                      val destination = File(directory, "prepared.mp4")
                      check(partial.renameTo(destination)) { "Atomic output move failed" }
                      val value = facts + mapOf("uri" to Uri.fromFile(destination).toString(),
                        "sizeBytes" to destination.length(), "sha256" to sha256)
                      val journal = File(directory, "prepared.json.partial")
                      journal.writeText(JSONObject(value).toString())
                      check(journal.renameTo(File(directory, "prepared.json")))
                      running = null
                      completion.success(value)
                    } catch (error: Exception) {
                      running = null; directory.deleteRecursively()
                      completion.failure("INVALID_OUTPUT", error.message ?: "Output commit failed")
                    }
                  }
                } catch (error: Exception) {
                  main.post {
                    if (running === active) {
                      running = null; directory.deleteRecursively()
                      completion.failure("INVALID_OUTPUT", error.message ?: "Invalid native output")
                    }
                  }
                }
              }
            }
            override fun onError(composition: Composition, result: ExportResult, error: ExportException) {
              val active = running
              if (active?.id != input.jobId) return
              running = null; directory.deleteRecursively()
              completion.failure("EXPORT_FAILED", error.message ?: "Native export failed")
            }
          }).build()
        running = Running(input.jobId, transformer, directory, completion)
        transformer.start(composition, partial.absolutePath)
      } catch (error: Exception) {
        running = null; directory.deleteRecursively()
        completion.failure("PREPARATION_FAILED", error.message ?: "Cannot prepare source")
      }
    }
  }

  fun cancel(jobId: String, finished: () -> Unit = {}) {
    main.post {
      val active = running
      if (active?.id == jobId) {
        running = null // Fence before cancellation or native listener callbacks.
        active.transformer.cancel()
        active.directory.deleteRecursively()
        active.completion.failure("CANCELLED", "Preparation cancelled")
      }
      finished()
    }
  }

  fun discard(jobId: String, finished: () -> Unit = {}) {
    require(jobId.matches(Regex("[a-zA-Z0-9-]{1,80}")))
    cancel(jobId) { File(root, jobId).deleteRecursively(); finished() }
  }

  /** Real MP4 track/sample inspection, not client metadata or the Transformer result. */
  fun inspect(file: File): Map<String, Any?> {
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(file.absolutePath)
      var video: MediaFormat? = null
      var audioCodec: String? = null
      var videoIndex = -1
      for (i in 0 until extractor.trackCount) {
        val track = extractor.getTrackFormat(i)
        val mime = track.getString(MediaFormat.KEY_MIME)
        if (mime?.startsWith("video/") == true) { require(video == null); video = track; videoIndex = i }
        if (mime?.startsWith("audio/") == true) { require(mime == "audio/mp4a-latm"); audioCodec = "aac" }
      }
      val format = requireNotNull(video)
      require(format.getString(MediaFormat.KEY_MIME) == "video/avc")
      val durationUs = format.getLong(MediaFormat.KEY_DURATION)
      extractor.selectTrack(videoIndex)
      var count = 0L
      val timestamps = HashSet<Long>()
      while (extractor.sampleTime >= 0) {
        require(timestamps.add(extractor.sampleTime)) { "Duplicate output timestamp" }
        count++
        if (!extractor.advance()) break
      }
      require(count > 0 && durationUs > 0)
      val fps = count * 1_000_000.0 / durationUs
      val transfer = if (format.containsKey(MediaFormat.KEY_COLOR_TRANSFER)) format.getInteger(MediaFormat.KEY_COLOR_TRANSFER) else -1
      val standard = if (format.containsKey(MediaFormat.KEY_COLOR_STANDARD)) format.getInteger(MediaFormat.KEY_COLOR_STANDARD) else -1
      return mapOf("durationMs" to durationUs / 1000.0, "width" to format.getInteger(MediaFormat.KEY_WIDTH),
        "height" to format.getInteger(MediaFormat.KEY_HEIGHT), "fps" to fps,
        "videoCodec" to "h264", "audioCodec" to audioCodec,
        "colour" to if (transfer == MediaFormat.COLOR_TRANSFER_SDR_VIDEO && standard == MediaFormat.COLOR_STANDARD_BT709) "bt709" else "unknown")
    } finally { extractor.release() }
  }
}
