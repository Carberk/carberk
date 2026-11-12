package tm.auto.listingvideo

import android.content.Context
import android.os.Looper
import java.io.File
import java.util.concurrent.Executor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
@LooperMode(LooperMode.Mode.PAUSED)
class ListingVideoExporterTest {
  @Test
  fun `cancelling before source copy leaves no native files after queued work ends`() {
    val context: Context = RuntimeEnvironment.getApplication()
    val source = File(context.cacheDir, "picked.mp4").apply { writeText("library copy") }
    val pending = ArrayDeque<Runnable>()
    val exporter = ListingVideoExporter(context, Executor { pending.add(it) })
    val outcomes = mutableListOf<Result<PreparedVideoInfo>>()

    exporter.prepare(source, 0.0, 10.0, "cancel-before-copy", {}, outcomes::add)
    exporter.cancel("cancel-before-copy")
    shadowOf(Looper.getMainLooper()).idle()
    while (pending.isNotEmpty()) pending.removeFirst().run()
    shadowOf(Looper.getMainLooper()).idle()

    assertEquals(1, outcomes.size)
    assertEquals("cancelled", (outcomes.single().exceptionOrNull() as ListingVideoExportException).code)
    assertTrue("cancelled copy must not leave a native source directory", File(context.filesDir, "listing-video").listFiles().orEmpty().isEmpty())
    assertTrue("the recoverable picker source must remain", source.isFile)
  }

  @Test
  fun `cancelling after source access begins cleans files created by the copy`() {
    val context: Context = RuntimeEnvironment.getApplication()
    val pending = ArrayDeque<Runnable>()
    val exporter = ListingVideoExporter(context, Executor { pending.add(it) })
    val outcomes = mutableListOf<Result<PreparedVideoInfo>>()
    val source = object : File(context.cacheDir, "picked.mp4") {
      override fun canRead(): Boolean {
        // Cancel at the filesystem boundary, after copying has entered but
        // before it creates the native directory. The file operations are real.
        exporter.cancel("cancel-during-copy")
        shadowOf(Looper.getMainLooper()).idle()
        return super.canRead()
      }
    }.apply { writeText("library copy") }

    exporter.prepare(source, 0.0, 10.0, "cancel-during-copy", {}, outcomes::add)
    while (pending.isNotEmpty()) pending.removeFirst().run()
    shadowOf(Looper.getMainLooper()).idle()

    assertEquals(1, outcomes.size)
    assertEquals("cancelled", (outcomes.single().exceptionOrNull() as ListingVideoExportException).code)
    assertTrue("cancelled copy must clean any recreated directory", File(context.filesDir, "listing-video").listFiles().orEmpty().isEmpty())
    assertTrue("the recoverable picker source must remain", source.isFile)
  }
}
