package expo.modules.sharetext

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The text that came with something shared into DiaryByte.
 *
 * Apps like Netflix and ZEE5 share a poster image together with their
 * message ("Seen "Allen" on Netflix yet? <link>"). expo-share-intent only
 * passes the image on for such shares, so this reads the message (and its
 * title) from the share intent itself. Read-only; each share is handed out
 * once.
 */
class ShareTextModule : Module() {
  private var pendingText: String? = null
  private var pendingTitle: String? = null
  private var pendingAt: Long = 0

  private fun capture(intent: Intent?) {
    if (intent == null) return
    if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) return
    // Each share intent is read once, even if it's seen again later.
    if (intent.getBooleanExtra(TAKEN, false)) return
    intent.putExtra(TAKEN, true)
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
    val title = intent.getCharSequenceExtra(Intent.EXTRA_TITLE)?.toString()
      ?: intent.getStringExtra(Intent.EXTRA_SUBJECT)
    if (text.isNullOrBlank() && title.isNullOrBlank()) return
    pendingText = text
    pendingTitle = title
    pendingAt = System.currentTimeMillis()
  }

  override fun definition() = ModuleDefinition {
    Name("ShareText")

    OnNewIntent { intent -> capture(intent) }

    // { text, title, at } for the latest share not handed out yet, or null.
    Function("take") { -> take() }
  }

  private fun take(): Map<String, Any?>? {
    capture(appContext.currentActivity?.intent)
    if (pendingText == null && pendingTitle == null) return null
    val result: Map<String, Any?> = mapOf("text" to pendingText, "title" to pendingTitle, "at" to pendingAt.toDouble())
    pendingText = null
    pendingTitle = null
    return result
  }

  companion object {
    private const val TAKEN = "diarybyte.shareTextTaken"
  }
}
