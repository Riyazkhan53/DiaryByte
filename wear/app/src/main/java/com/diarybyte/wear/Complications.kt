package com.diarybyte.wear

import android.app.PendingIntent
import android.content.Intent
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService

private fun plain(s: String) = PlainComplicationText.Builder(s).build()

/** Shared: a short value ("₹5.2L") with a title, or a longer line. */
abstract class DiaryByteComplication : SuspendingComplicationDataSourceService() {
    abstract fun title(): String
    abstract fun short(s: Summary): String
    abstract fun long(s: Summary): String
    abstract fun describe(s: Summary): String

    private fun tap(): PendingIntent = PendingIntent.getActivity(
        this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun build(type: ComplicationType, shortText: String, longText: String, desc: String): ComplicationData? = when (type) {
        ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(plain(shortText), plain(desc))
            .setTitle(plain(title()))
            .setTapAction(tap())
            .build()
        ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(plain(longText), plain(desc))
            .setTapAction(tap())
            .build()
        else -> null
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        build(type, if (this is TodayPnlComplicationService) "+₹1.2k" else "₹5.2L", "${title()} ₹5,20,000", title())

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        val s = summaryForSurface(this)
        return if (s == null) build(request.complicationType, "—", "DiaryByte: open to pair", title())
        else build(request.complicationType, short(s), long(s), describe(s))
    }
}

class NetWorthComplicationService : DiaryByteComplication() {
    override fun title() = "NW"
    override fun short(s: Summary) = compactInr(s.netWorth)
    override fun long(s: Summary) = "Net worth ${inr(s.netWorth).let { if (s.netWorth < 0) "−$it" else it }}"
    override fun describe(s: Summary) = "Net worth ${compactInr(s.netWorth)}"
}

class TodayPnlComplicationService : DiaryByteComplication() {
    override fun title() = "P/L"
    override fun short(s: Summary) = if (s.pnlTodayEntered) signedCompact(s.pnlToday) else "—"
    override fun long(s: Summary) = if (s.pnlTodayEntered) "Today ${signedInr(s.pnlToday)}" else "Today's P/L not entered"
    override fun describe(s: Summary) = long(s)
}
