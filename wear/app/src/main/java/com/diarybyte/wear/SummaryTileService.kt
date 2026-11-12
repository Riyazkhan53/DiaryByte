package com.diarybyte.wear

import android.content.Context
import androidx.concurrent.futures.SuspendToFutureAdapter
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DeviceParametersBuilders.DeviceParameters
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.material.Text
import androidx.wear.protolayout.material.Typography
import androidx.wear.protolayout.material.layouts.PrimaryLayout
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

/** Tile: net worth, today's demat P/L and the next items due. Tap to open the app. */
class SummaryTileService : TileService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> =
        SuspendToFutureAdapter.launchFuture(scope.coroutineContext) {
            val summary = summaryForSurface(this@SummaryTileService)
            val layout = buildLayout(this@SummaryTileService, requestParams.deviceConfiguration, summary, Store(this@SummaryTileService).paired)
            TileBuilders.Tile.Builder()
                .setResourcesVersion(RESOURCES_VERSION)
                .setFreshnessIntervalMillis(15 * 60_000L)
                .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(layout))
                .build()
        }

    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        SuspendToFutureAdapter.launchFuture(scope.coroutineContext) {
            ResourceBuilders.Resources.Builder().setVersion(RESOURCES_VERSION).build()
        }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }

    companion object {
        private const val RESOURCES_VERSION = "1"
        private const val WHITE = 0xFFFFFFFF.toInt()
        private const val MUTED = 0xFFB0B3BA.toInt()
        private const val GREEN = 0xFF34C759.toInt()
        private const val RED = 0xFFFF5A5F.toInt()
        private const val ACCENT = 0xFFFF8FA6.toInt()

        private fun text(context: Context, s: String, typo: Int, color: Int, lines: Int = 1) =
            Text.Builder(context, s).setTypography(typo).setColor(argb(color)).setMaxLines(lines).build()

        private fun spacer(h: Float) = LayoutElementBuilders.Spacer.Builder().setHeight(dp(h)).build()

        fun buildLayout(context: Context, device: DeviceParameters, s: Summary?, paired: Boolean): LayoutElementBuilders.LayoutElement {
            val open = ModifiersBuilders.Clickable.Builder()
                .setId("open")
                .setOnClick(
                    ActionBuilders.LaunchAction.Builder()
                        .setAndroidActivity(
                            ActionBuilders.AndroidActivity.Builder()
                                .setPackageName(context.packageName)
                                .setClassName(MainActivity::class.java.name)
                                .build()
                        )
                        .build()
                )
                .build()

            val content = LayoutElementBuilders.Column.Builder()
                .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            val primary: String
            var secondary: LayoutElementBuilders.LayoutElement? = null

            if (s == null) {
                primary = "DiaryByte"
                content.addContent(
                    text(context, if (paired) "Can't reach the server. Tap to retry." else "Tap to pair with your phone", Typography.TYPOGRAPHY_BODY1, WHITE, 3)
                )
            } else {
                primary = "Net worth"
                content.addContent(text(context, compactInr(s.netWorth), Typography.TYPOGRAPHY_DISPLAY3, WHITE))
                content.addContent(spacer(2f))
                val pnlText = if (s.pnlTodayEntered) "Today ${signedCompact(s.pnlToday)}" else "Today's P/L not entered"
                val pnlColor = if (!s.pnlTodayEntered) MUTED else if (s.pnlToday < 0) RED else GREEN
                content.addContent(text(context, pnlText, Typography.TYPOGRAPHY_CAPTION1, pnlColor))
                content.addContent(spacer(4f))
                val next = s.upcoming.take(2)
                if (next.isEmpty()) {
                    content.addContent(text(context, "Nothing due in 5 days", Typography.TYPOGRAPHY_CAPTION2, MUTED))
                } else {
                    next.forEach { u ->
                        val day = when (u.daysLeft) { 0 -> "Today"; 1 -> "Tmrw"; else -> "${u.daysLeft}d" }
                        content.addContent(text(context, "$day · ${u.title}", Typography.TYPOGRAPHY_CAPTION2, MUTED))
                    }
                }
                val candidates = s.signals.count { it.state == "BUY CANDIDATE" || it.state == "SELL CANDIDATE" }
                secondary = text(
                    context,
                    if (candidates > 0) "$candidates signal${if (candidates == 1) "" else "s"} now" else if (s.todos.isNotEmpty()) "${s.todos.size} to-do" else "DiaryByte",
                    Typography.TYPOGRAPHY_CAPTION2,
                    ACCENT,
                )
            }

            val layout = PrimaryLayout.Builder(device)
                .setResponsiveContentInsetEnabled(true)
                .setPrimaryLabelTextContent(text(context, primary, Typography.TYPOGRAPHY_CAPTION1, ACCENT))
                .setContent(content.build())
            secondary?.let { layout.setSecondaryLabelTextContent(it) }

            return LayoutElementBuilders.Box.Builder()
                .setWidth(androidx.wear.protolayout.DimensionBuilders.expand())
                .setHeight(androidx.wear.protolayout.DimensionBuilders.expand())
                .setModifiers(ModifiersBuilders.Modifiers.Builder().setClickable(open).build())
                .addContent(layout.build())
                .build()
        }
    }
}
