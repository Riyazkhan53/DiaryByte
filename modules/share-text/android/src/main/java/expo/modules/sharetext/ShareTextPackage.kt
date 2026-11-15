package expo.modules.sharetext

import android.app.Activity
import android.content.Context
import android.os.Bundle
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

// Catches a share that starts the app (the activity's first intent) and
// counts each time Android creates the activity.
class ShareTextLifecycleListener(@Suppress("UNUSED_PARAMETER") context: Context) : ReactActivityLifecycleListener {
  override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
    ShareStore.activityCreates += 1
    val intent = activity?.intent
    if (ShareStore.isShare(intent) && intent?.getBooleanExtra(ShareTextModule.TAKEN, false) != true) ShareStore.pending = intent
  }
}

class ShareTextPackage : Package {
  override fun createReactActivityLifecycleListeners(activityContext: Context): List<ReactActivityLifecycleListener> =
    listOf(ShareTextLifecycleListener(activityContext))
}
