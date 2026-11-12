package tm.auto.listingvideo

import android.content.Context
import android.media.MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.FrameDropEffect
import androidx.media3.effect.Presentation
import androidx.media3.transformer.AudioEncoderSettings
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.EncoderSelector
import androidx.media3.transformer.EncoderUtil
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import com.google.common.collect.ImmutableList
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Error codes the TypeScript layer maps 1:1 onto `ListingVideoErrorCode`. */
class ListingVideoExportException(val code: String, message: String) : Exception(message)

data class PreparedVideoInfo(
  val file: File,
  val durationS: Double,
  val sizeBytes: Long,
  val width: Int,
  val height: Int,
  val fps: Double,
  val hasAudio: Boolean,
)

/**
 * Android counterpart of the iOS `ListingVideoExporter` (#1039, #1050), on
 * Media3 Transformer. Re-encodes only the kept interval of a copied library
 * video into a staged H.264/AAC MP4: at most 30 fps, fitted inside
 * 1280x720 / 720x1280 without upscaling, rotation baked into the frames,
 * HDR tone-mapped to SDR, at most 15 MiB.
 *
 * Output is written to `prepared.partial.mp4` and only renamed to
 * `prepared.mp4` after [validateOutput] reopens it, so a half-written file
 * never reaches a caller. Failed and cancelled jobs remove their directory.
 */
@OptIn(UnstableApi::class)
class ListingVideoExporter(private val context: Context) {
  companion object {
    const val MAX_OUTPUT_BYTES: Long = 15L * 1024 * 1024
    const val AUDIO_BITRATE = 128_000

    const val MIN_VIDEO_BITRATE = 400_000

    /**
     * Video bitrate that fits ~90% of the 15 MiB cap alongside 128 kbps
     * audio; the margin covers encoder overshoot and container overhead.
     */
    fun videoBitrate(durationS: Double): Int {
      val budgetBits = MAX_OUTPUT_BYTES * 8.0 * 0.90
      val perSecond = ((budgetBits - AUDIO_BITRATE * durationS) / durationS).toInt()
      return max(MIN_VIDEO_BITRATE, min(1_250_000, perSecond))
    }

    /** Fit inside the 720p envelope without upscaling; even dimensions. */
    fun fittedSize(width: Int, height: Int): Pair<Int, Int> {
      val scale = min(1.0, min(1280.0 / max(width, height), 720.0 / min(width, height)))
      fun even(v: Int) = max(2, (v * scale).toInt() / 2 * 2)
      return even(width) to even(height)
    }
  }

  private val main = Handler(Looper.getMainLooper())
  private val io = Executors.newCachedThreadPool()
  private val running = ConcurrentHashMap<String, Job>()

  private inner class Job(
    val jobId: String,
    val dir: File,
    val onDone: (Result<PreparedVideoInfo>) -> Unit,
  ) {
    private val finished = AtomicBoolean(false)
    val isFinished get() = finished.get()

    /** Set on the main looper; finish() may clear [poll] from the IO pool. */
    @Volatile var transformer: Transformer? = null
    @Volatile var poll: Runnable? = null

    fun finish(result: Result<PreparedVideoInfo>) {
      if (!finished.compareAndSet(false, true)) return
      running.remove(jobId)
      // The progress poll reschedules itself; stop it whatever ended the job.
      poll?.let { main.removeCallbacks(it) }
      poll = null
      result.exceptionOrNull()?.let { Log.w("ListingVideo", "prepare failed: ${it.message}") }
      if (result.isFailure) dir.deleteRecursively()
      onDone(result)
    }

    fun fail(code: String, message: String = code) =
      finish(Result.failure(ListingVideoExportException(code, message)))
  }

  fun cancel(jobId: String) {
    main.post {
      val job = running[jobId] ?: return@post
      // Transformer.cancel() reports no listener callback; finish here.
      job.transformer?.cancel()
      job.fail("cancelled")
    }
  }

  /** Cancels every running job, e.g. when the JavaScript runtime reloads. */
  fun cancelAll() {
    running.keys.toList().forEach(::cancel)
  }

  fun prepare(
    source: File,
    startS: Double,
    endS: Double,
    jobId: String,
    onProgress: (Double) -> Unit,
    onDone: (Result<PreparedVideoInfo>) -> Unit,
  ) {
    // Storage identity is native and independent of caller job IDs. Never
    // remove a previous prepared file to start another export.
    val dir = File(context.filesDir, "listing-video/${UUID.randomUUID()}")
    val job = Job(jobId, dir, onDone)
    running[jobId] = job
    io.execute {
      try {
        val start = readAndCopy(job, source, startS, endS)
        if (start != null) main.post { startTransformer(job, start, onProgress, videoBitrate(start.endS - start.startS), retried = false) }
      } catch (error: ListingVideoExportException) {
        job.finish(Result.failure(error))
      } catch (error: Exception) {
        job.fail("export-failed", error.message ?: "export-failed")
      }
    }
  }

  private class Start(
    val copied: File,
    val startS: Double,
    val endS: Double,
    val outW: Int,
    val outH: Int,
  )

  /** Copy into the job directory and check the source; runs off the main thread. */
  private fun readAndCopy(job: Job, source: File, startS: Double, endS: Double): Start? {
    if (!source.isFile || !source.canRead()) throw ListingVideoExportException("source-unreadable", "Source is missing")
    if (!job.dir.mkdirs() && !job.dir.isDirectory) throw ListingVideoExportException("export-failed", "job-dir")
    if (job.dir.usableSpace < source.length() + MAX_OUTPUT_BYTES) {
      throw ListingVideoExportException("insufficient-storage", "Not enough space")
    }
    // 1. Copy the library video into app storage; never export in place.
    val ext = source.extension.lowercase().takeIf { it.matches(Regex("[a-z0-9]{2,5}")) } ?: "mp4"
    val copied = File(job.dir, "source.$ext")
    try {
      source.copyTo(copied, overwrite = true)
    } catch (error: IOException) {
      if (isOutOfSpace(error)) throw ListingVideoExportException("insufficient-storage", "Not enough space")
      throw ListingVideoExportException("source-unreadable", "Source could not be copied")
    }
    // cancel() may have finished the job (and removed its directory) mid-copy.
    if (job.isFinished) return null

    val retriever = MediaMetadataRetriever()
    try {
      try {
        retriever.setDataSource(copied.absolutePath)
      } catch (error: RuntimeException) {
        throw ListingVideoExportException("source-unreadable", "Source could not be opened")
      }
      fun meta(key: Int) = retriever.extractMetadata(key)
      if (meta(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO) != "yes") {
        throw ListingVideoExportException("unsupported-source", "Source has no video track")
      }
      val assetDuration = (meta(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull() ?: 0.0) / 1000.0
      if (assetDuration <= 0 || endS > assetDuration + 0.05) {
        throw ListingVideoExportException("source-unreadable", "Interval is outside the source")
      }
      // Keep the editor's 3-second trim floor, except a short source kept whole.
      val durationS = endS - startS
      val wholeShort = assetDuration < 3.0 && durationS > 0 && durationS < 3.0 &&
        abs(startS) <= 0.001 && abs(endS - assetDuration) <= 0.01
      if (durationS < 3.0 && !wholeShort) throw ListingVideoExportException("export-failed", "interval-too-short")
      val w = meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
      val h = meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
      val rotation = meta(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      if (w <= 0 || h <= 0) throw ListingVideoExportException("unsupported-source", "Source has no size")
      val sideways = rotation % 180 != 0
      val (outW, outH) = fittedSize(if (sideways) h else w, if (sideways) w else h)
      return Start(copied, startS, endS, outW, outH)
    } finally {
      retriever.release()
    }
  }

  /** Builds and starts the Transformer; must run on the main looper. */
  private fun startTransformer(job: Job, start: Start, onProgress: (Double) -> Unit, bitrate: Int, retried: Boolean) {
    if (job.isFinished) return
    val durationS = start.endS - start.startS
    val item = MediaItem.Builder()
      .setUri(android.net.Uri.fromFile(start.copied))
      .setClippingConfiguration(
        MediaItem.ClippingConfiguration.Builder()
          .setStartPositionMs((start.startS * 1000).toLong())
          .setEndPositionMs((start.endS * 1000).toLong())
          .build(),
      )
      .build()
    val edited = EditedMediaItem.Builder(item)
      .setEffects(
        Effects(
          listOf(),
          listOf(
            FrameDropEffect.createDefaultFrameDropEffect(30f),
            Presentation.createForWidthAndHeight(start.outW, start.outH, Presentation.LAYOUT_SCALE_TO_FIT),
          ),
        ),
      )
      .build()
    val composition = Composition.Builder(EditedMediaItemSequence.Builder(edited).build())
      .setHdrMode(Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL)
      .build()
    val partial = File(job.dir, "prepared.partial.mp4")
    val final = File(job.dir, "prepared.mp4")
    // Android's quality shaping raises a VBR request to a ~2 Mbps floor at
    // 720p ("VQApply: raise bitrate"), which breaks the 15 MiB cap for long
    // clips; CBR keeps the requested bitrate. Media3 writes the requested
    // mode into the encoder format without checking support, so offer only
    // CBR-capable encoders when there are any, and request CBR only then.
    // Otherwise the encoder runs in its default mode, and validateOutput plus
    // one lower-bitrate retry in promote() keep the cap.
    val avcEncoders = EncoderSelector.DEFAULT.selectEncoderInfos(MimeTypes.VIDEO_H264)
    val cbrEncoders = ImmutableList.copyOf(
      avcEncoders.filter { EncoderUtil.isBitrateModeSupported(it, MimeTypes.VIDEO_H264, BITRATE_MODE_CBR) },
    )
    val useCbr = cbrEncoders.isNotEmpty()
    val videoSettings = VideoEncoderSettings.Builder()
      .setBitrate(bitrate)
      .setiFrameIntervalSeconds(1f)
    if (useCbr) videoSettings.setBitrateMode(BITRATE_MODE_CBR)
    Log.i("ListingVideo", "encode ${job.jobId}: ${bitrate} bps, cbr=$useCbr, retry=$retried")
    val encoders = DefaultEncoderFactory.Builder(context)
      .setVideoEncoderSelector { mime ->
        if (useCbr && mime == MimeTypes.VIDEO_H264) cbrEncoders else EncoderSelector.DEFAULT.selectEncoderInfos(mime)
      }
      .setRequestedVideoEncoderSettings(videoSettings.build())
      .setRequestedAudioEncoderSettings(AudioEncoderSettings.Builder().setBitrate(AUDIO_BITRATE).build())
      .setEnableFallback(true)
      .build()
    val progress = ProgressHolder()
    val transformer = Transformer.Builder(context)
      .setVideoMimeType(MimeTypes.VIDEO_H264)
      .setAudioMimeType(MimeTypes.AUDIO_AAC)
      // Encode portrait frames as portrait so the file carries no rotation
      // flag; the worker reads coded width and height (matches iOS).
      .setPortraitEncodingEnabled(true)
      .setEncoderFactory(encoders)
      .setMuxerFactory(IntervalMuxerFactory((durationS * 1_000_000).toLong()))
      .addListener(object : Transformer.Listener {
        override fun onCompleted(composition: Composition, exportResult: ExportResult) {
          stopPoll(job)
          io.execute { promote(job, start, partial, final, onProgress, bitrate, retried) }
        }

        override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
          stopPoll(job)
          partial.delete()
          job.fail(codeFor(exportException), exportException.errorCodeName + ": " + (exportException.message ?: ""))
        }
      })
      .build()
    job.transformer = transformer
    val poll = object : Runnable {
      override fun run() {
        if (job.isFinished) return        if (transformer.getProgress(progress) == Transformer.PROGRESS_STATE_AVAILABLE) {
          // A retry restarts the export; scale it into the second half.
          val fraction = max(0.0, progress.progress / 100.0)
          onProgress(min(0.99, if (retried) 0.5 + fraction / 2 else fraction))
        }
        main.postDelayed(this, 100)
      }
    }
    job.poll = poll
    transformer.start(composition, partial.absolutePath)
    main.postDelayed(poll, 100)
  }

  private fun stopPoll(job: Job) {
    job.poll?.let { main.removeCallbacks(it) }
    job.poll = null
  }

  private fun promote(
    job: Job,
    start: Start,
    partial: File,
    final: File,
    onProgress: (Double) -> Unit,
    bitrate: Int,
    retried: Boolean,
  ) {
    try {
      if (job.isFinished) {
        partial.delete(); return
      }
      val size = partial.length()
      if (size > MAX_OUTPUT_BYTES && !retried && bitrate > MIN_VIDEO_BITRATE) {
        // The encoder overshot (or ignored) the requested bitrate. Retry once,
        // scaled so the same overshoot lands at ~85% of the cap.
        partial.delete()
        val lower = max(MIN_VIDEO_BITRATE, (bitrate * (MAX_OUTPUT_BYTES * 0.85 / size)).toInt())
        Log.w("ListingVideo", "output $size bytes over the cap at $bitrate bps; retrying at $lower bps")
        main.post { startTransformer(job, start, onProgress, lower, retried = true) }
        return
      }
      // Reject half-written output before any caller sees it.
      val info = validateOutput(partial, start.endS - start.startS)
      if (job.isFinished) {
        partial.delete(); return
      }
      start.copied.delete()
      if (!partial.renameTo(final)) throw ListingVideoExportException("export-failed", "promote")
      onProgress(1.0)
      job.finish(Result.success(info.copy(file = final)))
    } catch (error: ListingVideoExportException) {
      partial.delete()
      job.finish(Result.failure(error))
    } catch (error: Exception) {
      partial.delete()
      job.fail("export-failed", error.message ?: "validate")
    }
  }

  /** Reopens a finished file and proves it is complete and inside limits. */
  fun validateOutput(file: File, expectedDurationS: Double): PreparedVideoInfo {
    val size = file.length()
    if (size <= 0) throw ListingVideoExportException("export-failed", "empty-output")
    if (size > MAX_OUTPUT_BYTES) throw ListingVideoExportException("output-too-large", "output-too-large")
    val extractor = MediaExtractor()
    try {
      try {
        extractor.setDataSource(file.absolutePath)
      } catch (error: IOException) {
        throw ListingVideoExportException("export-failed", "unreadable-output")
      }
      var videoTrack = -1
      var hasAudio = false
      var width = 0
      var height = 0
      var rotation = 0
      var durationUs = 0L
      for (i in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: ""
        if (mime == MimeTypes.VIDEO_H264 && videoTrack < 0) {
          videoTrack = i
          width = format.getInteger(MediaFormat.KEY_WIDTH)
          height = format.getInteger(MediaFormat.KEY_HEIGHT)
          if (format.containsKey(MediaFormat.KEY_ROTATION)) rotation = format.getInteger(MediaFormat.KEY_ROTATION)
          if (format.containsKey(MediaFormat.KEY_DURATION)) durationUs = format.getLong(MediaFormat.KEY_DURATION)
        } else if (mime == MimeTypes.AUDIO_AAC) {
          hasAudio = true
        } else if (mime.startsWith("audio/")) {
          throw ListingVideoExportException("export-failed", "unexpected-audio-codec")
        }
      }
      if (videoTrack < 0) throw ListingVideoExportException("export-failed", "missing-video-track")
      // Count samples for the real frame rate; muxed files rarely carry one.
      extractor.selectTrack(videoTrack)
      var frames = 0
      var lastUs = 0L
      while (extractor.sampleTime >= 0) {
        frames += 1
        lastUs = max(lastUs, extractor.sampleTime)
        extractor.advance()
      }
      if (frames == 0) throw ListingVideoExportException("export-failed", "missing-video-track")
      val durationS = (if (durationUs > 0) durationUs else lastUs) / 1_000_000.0
      if (abs(durationS - expectedDurationS) > 0.75) {
        throw ListingVideoExportException("export-failed", "duration-mismatch")
      }
      val fps = if (lastUs > 0) Math.round((frames - 1) * 1_000_000.0 / lastUs * 100) / 100.0 else 0.0
      val sideways = rotation % 180 != 0
      return PreparedVideoInfo(
        file = file,
        durationS = durationS,
        sizeBytes = size,
        width = if (sideways) height else width,
        height = if (sideways) width else height,
        fps = fps,
        hasAudio = hasAudio,
      )
    } finally {
      extractor.release()
    }
  }

  private fun codeFor(error: ExportException): String {
    if (generateSequence(error as Throwable) { it.cause }.any { it is IOException && isOutOfSpace(it) }) {
      return "insufficient-storage"
    }
    return when (error.errorCode) {
      ExportException.ERROR_CODE_IO_FILE_NOT_FOUND,
      ExportException.ERROR_CODE_IO_NO_PERMISSION,
      ExportException.ERROR_CODE_IO_READ_POSITION_OUT_OF_RANGE,
      ExportException.ERROR_CODE_IO_UNSPECIFIED -> "source-unreadable"
      ExportException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED,
      ExportException.ERROR_CODE_DECODER_INIT_FAILED -> "unsupported-source"
      else -> "export-failed"
    }
  }

  private fun isOutOfSpace(error: Throwable): Boolean {
    val message = error.message ?: return false
    return message.contains("ENOSPC") || message.contains("No space left", ignoreCase = true)
  }
}
