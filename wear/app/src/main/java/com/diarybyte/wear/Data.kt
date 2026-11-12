package com.diarybyte.wear

import android.content.Context
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import android.content.ComponentName
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

// ---------------- what the server sends (GET /api/watch/summary) ----------------

data class Upcoming(val kind: String, val title: String, val sub: String, val date: String, val daysLeft: Int, val amount: Double?)
data class Todo(val id: String, val title: String)
data class Signal(
    val symbol: String,
    val state: String?,
    val side: String?,
    val score: Int?,
    val threshold: Int?,
    val at: Long?,
    val nextAction: String?,
    val entry: Double?,
    val stop: Double?,
    val target: Double?,
)

data class Summary(
    val generatedAt: String,
    val today: String,
    val netWorth: Double,
    val investments: Double,
    val demat: Double,
    val cash: Double,
    val debts: Double,
    val pnlToday: Double,
    val pnlTodayEntered: Boolean,
    val pnlMonth: Double,
    val goingOut: Double,
    val upcoming: List<Upcoming>,
    val todos: List<Todo>,
    val marketOpen: Boolean,
    val lastScanAt: String?,
    val openTrades: Int,
    val signals: List<Signal>,
) {
    companion object {
        private fun JSONObject.dbl(k: String) = if (isNull(k)) null else optDouble(k).takeIf { !it.isNaN() }
        private fun JSONObject.int(k: String) = if (isNull(k) || !has(k)) null else optInt(k)
        private fun JSONObject.str(k: String) = if (isNull(k) || !has(k)) null else optString(k)
        private inline fun <T> JSONArray?.list(f: (JSONObject) -> T): List<T> =
            if (this == null) emptyList() else (0 until length()).map { f(getJSONObject(it)) }

        fun parse(text: String): Summary {
            val o = JSONObject(text)
            val nw = o.optJSONObject("netWorth") ?: JSONObject()
            val dm = o.optJSONObject("demat") ?: JSONObject()
            val sg = o.optJSONObject("signals")
            return Summary(
                generatedAt = o.optString("generatedAt"),
                today = o.optString("today"),
                netWorth = nw.optDouble("total", 0.0),
                investments = nw.optDouble("investments", 0.0),
                demat = nw.optDouble("demat", 0.0),
                cash = nw.optDouble("cash", 0.0),
                debts = nw.optDouble("debts", 0.0),
                pnlToday = dm.optDouble("today", 0.0),
                pnlTodayEntered = dm.optBoolean("todayEntered", false),
                pnlMonth = dm.optDouble("month", 0.0),
                goingOut = o.optDouble("goingOut", 0.0),
                upcoming = o.optJSONArray("upcoming").list {
                    Upcoming(it.optString("kind"), it.optString("title"), it.optString("sub"), it.optString("date"), it.optInt("daysLeft"), it.dbl("amount"))
                },
                todos = o.optJSONArray("todos").list { Todo(it.optString("id"), it.optString("title")) },
                marketOpen = sg?.optBoolean("marketOpen") ?: false,
                lastScanAt = sg?.str("lastScanAt"),
                openTrades = sg?.optInt("openTrades") ?: 0,
                signals = sg?.optJSONArray("items").list {
                    Signal(
                        symbol = it.optString("symbol"),
                        state = it.str("state"),
                        side = it.str("side"),
                        score = it.int("score"),
                        threshold = it.int("threshold"),
                        at = if (it.isNull("at") || !it.has("at")) null else it.optLong("at"),
                        nextAction = it.str("nextAction"),
                        entry = it.dbl("entry"),
                        stop = it.dbl("stop"),
                        target = it.dbl("target"),
                    )
                },
            )
        }
    }
}

// ---------------- saved on the watch ----------------

class Store(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("diarybyte", Context.MODE_PRIVATE)

    var server: String
        get() = prefs.getString("server", null) ?: BuildConfig.DEFAULT_SERVER
        set(v) = prefs.edit().putString("server", v.trim().trimEnd('/')).apply()
    var apiKey: String
        get() = prefs.getString("apiKey", "") ?: ""
        set(v) = prefs.edit().putString("apiKey", v).apply()
    var token: String
        get() = prefs.getString("token", "") ?: ""
        set(v) = prefs.edit().putString("token", v).apply()
    val paired: Boolean get() = prefs.getBoolean("paired", false)

    fun savePairing(apiKey: String, token: String) {
        prefs.edit().putString("apiKey", apiKey).putString("token", token).putBoolean("paired", true).apply()
    }

    fun unpair() {
        prefs.edit().remove("apiKey").remove("token").remove("paired").remove("summary").remove("summaryAt").apply()
    }

    /** The last summary that loaded, and when (ms). */
    fun cached(): Pair<Summary, Long>? {
        val text = prefs.getString("summary", null) ?: return null
        return try {
            Summary.parse(text) to prefs.getLong("summaryAt", 0L)
        } catch (e: Exception) {
            null
        }
    }

    fun saveSummary(text: String) {
        prefs.edit().putString("summary", text).putLong("summaryAt", System.currentTimeMillis()).apply()
    }
}

// ---------------- talking to the server ----------------

class ApiError(message: String, val status: Int = 0) : IOException(message)

class Api(private val context: Context) {
    private val store = Store(context)

    private suspend fun call(method: String, path: String, body: JSONObject? = null, timeoutMs: Int = 45_000): JSONObject =
        withContext(Dispatchers.IO) {
            val conn = (URL(store.server + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 15_000
                readTimeout = timeoutMs
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
                if (store.apiKey.isNotEmpty()) setRequestProperty("x-api-key", store.apiKey)
                if (store.token.isNotEmpty()) setRequestProperty("Authorization", "Bearer ${store.token}")
                if (body != null) {
                    doOutput = true
                    outputStream.use { it.write(body.toString().toByteArray()) }
                }
            }
            try {
                val code = conn.responseCode
                val text = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
                val json = try {
                    JSONObject(text)
                } catch (e: Exception) {
                    JSONObject()
                }
                if (code !in 200..299) {
                    val msg = json.optString("error").ifEmpty {
                        when (code) {
                            401 -> "Not signed in. Pair the watch again."
                            404 -> "The server needs updating."
                            else -> "Server error ($code)"
                        }
                    }
                    throw ApiError(msg, code)
                }
                json
            } finally {
                conn.disconnect()
            }
        }

    /** Type the phone's code: saves the key and sign-in on the watch. */
    suspend fun redeem(code: String) {
        val r = call("POST", "/api/watch/redeem", JSONObject().put("code", code))
        store.savePairing(r.optString("apiKey"), r.optString("token"))
    }

    /** Load the summary, keep it for the tile and complications, and tell them. */
    suspend fun summary(timeoutMs: Int = 45_000, notify: Boolean = true): Summary {
        val json = call("GET", "/api/watch/summary", timeoutMs = timeoutMs)
        val text = json.toString()
        val parsed = Summary.parse(text)
        store.saveSummary(text)
        if (notify) refreshSurfaces(context)
        return parsed
    }

    suspend fun todoDone(id: String) {
        call("POST", "/api/watch/todo/${java.net.URLEncoder.encode(id, "UTF-8")}/done")
    }
}

/** Ask the tile and complications to redraw from the newest data. */
fun refreshSurfaces(context: Context) {
    try {
        TileService.getUpdater(context).requestUpdate(SummaryTileService::class.java)
    } catch (_: Exception) {
    }
    listOf(NetWorthComplicationService::class.java, TodayPnlComplicationService::class.java).forEach {
        try {
            ComplicationDataSourceUpdateRequester.create(context, ComponentName(context, it)).requestUpdateAll()
        } catch (_: Exception) {
        }
    }
}

/**
 * For the tile and complications: the cached summary when it is fresh,
 * otherwise a quick fetch, falling back to whatever is cached.
 */
suspend fun summaryForSurface(context: Context, maxAgeMs: Long = 10 * 60_000L): Summary? {
    val store = Store(context)
    if (!store.paired) return null
    val cached = store.cached()
    if (cached != null && System.currentTimeMillis() - cached.second < maxAgeMs) return cached.first
    return try {
        Api(context).summary(timeoutMs = 20_000, notify = false)
    } catch (e: Exception) {
        cached?.first
    }
}

// ---------------- formatting ----------------

/** Indian grouping, the same on every watch: 12,48,650. */
fun indianGroup(n: Long): String {
    val d = n.toString()
    if (d.length <= 3) return d
    val head = d.dropLast(3)
    return head.reversed().chunked(2).joinToString(",").reversed() + "," + d.takeLast(3)
}

fun inr(n: Double): String = "₹" + indianGroup(abs(n).roundToLong())

fun signedInr(n: Double): String = (if (n < 0) "−" else "+") + inr(n)

/** ₹4.86L, ₹1.2Cr, ₹63,000 — for small spaces. */
fun compactInr(n: Double): String {
    val a = abs(n)
    val sign = if (n < 0) "−" else ""
    fun trim(x: Double) = String.format(Locale.US, "%.2f", x).trimEnd('0').trimEnd('.')
    return when {
        a >= 1e7 -> "$sign₹${trim(a / 1e7)}Cr"
        a >= 1e5 -> "$sign₹${trim(a / 1e5)}L"
        a >= 1e4 -> "$sign₹${trim(a / 1e3)}k"
        else -> sign + inr(a)
    }
}

fun signedCompact(n: Double): String = (if (n < 0) "" else "+") + compactInr(n)

fun price(n: Double?): String = if (n == null) "—" else String.format(Locale.US, "%.2f", n)

fun dayLabel(date: String, daysLeft: Int): String = when (daysLeft) {
    0 -> "Today"
    1 -> "Tomorrow"
    else -> try {
        LocalDate.parse(date).format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH))
    } catch (e: Exception) {
        date
    }
}

fun shortSymbol(s: String) = s.removeSuffix(".NS").removeSuffix(".BO")

/** "Updated 3 min ago" from the time the summary was saved. */
fun ageLabel(savedAt: Long): String {
    val mins = ((System.currentTimeMillis() - savedAt) / 60_000).toInt()
    return when {
        mins < 1 -> "Updated just now"
        mins < 60 -> "Updated $mins min ago"
        mins < 24 * 60 -> "Updated ${mins / 60} h ago"
        else -> "Updated ${mins / (24 * 60)} d ago"
    }
}
