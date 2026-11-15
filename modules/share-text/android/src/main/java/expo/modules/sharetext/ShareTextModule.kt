package expo.modules.sharetext

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Parcelable
import android.provider.OpenableColumns
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Receives what's shared into DiaryByte (Android share sheet): the text,
 * its title, and any files (copied into the app's cache so they can be
 * read). Replaces expo-share-intent, which relaunched the app's window for
 * some apps (Netflix, ZEE5) and dropped the text when an image came with it.
 * Nothing here closes or restarts the activity; every step is guarded.
 */
object ShareStore {
  @Volatile var pending: Intent? = null
  // How many times the main activity was created (to spot a window that
  // Android recreated while the app was running).
  @Volatile var activityCreates = 0

  fun isShare(intent: Intent?): Boolean =
    intent != null && (intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE)
}

class ShareTextModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShareText")

    Events("onShare")

    OnNewIntent { intent ->
      if (ShareStore.isShare(intent)) {
        ShareStore.pending = intent
        try {
          sendEvent("onShare", mapOf("at" to System.currentTimeMillis().toDouble()))
        } catch (e: Exception) {
          // JS asks again when the app comes to the front
        }
      }
    }

    // { text, title, type, files: [{ path, mimeType, fileName, size }], at } for the latest share not handed out yet, or null.
    Function("take") { -> take() }

    Function("activityCreates") { -> ShareStore.activityCreates }
  }

  private fun take(): Map<String, Any?>? {
    val intent = ShareStore.pending
      ?: appContext.currentActivity?.intent?.takeIf { ShareStore.isShare(it) && !it.getBooleanExtra(TAKEN, false) }
      ?: return null
    ShareStore.pending = null
    // Each share is handed out once, even if the activity's intent is seen again.
    try {
      intent.putExtra(TAKEN, true)
    } catch (e: Exception) {
    }
    return try {
      val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
      val title = intent.getCharSequenceExtra(Intent.EXTRA_TITLE)?.toString() ?: intent.getStringExtra(Intent.EXTRA_SUBJECT)
      val files = streams(intent).mapNotNull { copy(it, intent.type) }
      if (text.isNullOrBlank() && files.isEmpty()) {
        null
      } else {
        mapOf(
          "text" to text,
          "title" to title,
          "type" to intent.type,
          "files" to files,
          "at" to System.currentTimeMillis().toDouble(),
        )
      }
    } catch (e: Exception) {
      null
    }
  }

  @Suppress("DEPRECATION")
  private fun streams(intent: Intent): List<Uri> {
    val out = ArrayList<Uri>()
    try {
      if (intent.action == Intent.ACTION_SEND) {
        val one: Uri? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        else intent.getParcelableExtra<Parcelable>(Intent.EXTRA_STREAM) as? Uri
        if (one != null) out.add(one)
      } else {
        val many: List<Uri>? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
        else intent.getParcelableArrayListExtra<Parcelable>(Intent.EXTRA_STREAM)?.mapNotNull { it as? Uri }
        if (many != null) out.addAll(many)
      }
    } catch (e: Exception) {
    }
    return out.take(MAX_FILES)
  }

  /** The shared file copied into the app's cache: { path (file://), mimeType, fileName, size }, or null. */
  private fun copy(uri: Uri, fallbackType: String?): Map<String, Any?>? = try {
    val context = appContext.reactContext ?: appContext.currentActivity
    if (context == null) {
      null
    } else {
      val resolver = context.contentResolver
      val mime = resolver.getType(uri) ?: fallbackType ?: "application/octet-stream"
      var name = "shared"
      var size = -1L
      resolver.query(uri, null, null, null, null)?.use { c ->
        if (c.moveToFirst()) {
          val ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          if (ni >= 0 && !c.isNull(ni)) name = c.getString(ni) ?: name
          val si = c.getColumnIndex(OpenableColumns.SIZE)
          if (si >= 0 && !c.isNull(si)) size = c.getLong(si)
        }
      }
      if (size > MAX_BYTES) {
        null
      } else {
        val dir = File(context.cacheDir, "shared").apply { mkdirs() }
        val out = File(dir, "${System.currentTimeMillis()}_${name.replace(Regex("[^A-Za-z0-9._-]"), "_").take(60)}")
        val copied = resolver.openInputStream(uri)?.use { input -> out.outputStream().use { input.copyTo(it) } }
        if (copied == null) null
        else mapOf("path" to Uri.fromFile(out).toString(), "mimeType" to mime, "fileName" to name, "size" to out.length().toDouble())
      }
    }
  } catch (e: Exception) {
    null
  }

  companion object {
    const val TAKEN = "diarybyte.shareTaken"
    private const val MAX_FILES = 10
    private const val MAX_BYTES = 25L * 1024 * 1024
  }
}
