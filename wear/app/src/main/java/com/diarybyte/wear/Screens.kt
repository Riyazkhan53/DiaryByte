package com.diarybyte.wear

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyListScope
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.Text
import androidx.wear.remote.interactions.RemoteActivityHelper
import kotlinx.coroutines.delay
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

// ---------------- colours (the phone app's palette) ----------------

internal val Pink = Color(0xFFFF8FA6)
internal val Violet = Color(0xFF9B87FF)
internal val Green = Color(0xFF34C759)
internal val Red = Color(0xFFFF5A5F)
internal val Amber = Color(0xFFF5A623)
internal val Muted = Color(0xFFB0B3BA)
internal val CardBg = Color(0xFF1E1F24)

/** Gradient pairs for each section, so every screen has its own colour. */
internal object Hue {
    val worth = Color(0xFFFF6A88) to Color(0xFF7B5CFF)
    val signals = Color(0xFF1FB57A) to Color(0xFF0B6E52)
    val upcoming = Color(0xFFFF9F0A) to Color(0xFFD9480F)
    val invest = Color(0xFFB45CF0) to Color(0xFF6531C9)
    val tickets = Color(0xFF5C6BC0) to Color(0xFF283593)
    val dates = Color(0xFFF7B731) to Color(0xFFC77D0A)
    val todo = Color(0xFFFF6A88) to Color(0xFFC2185B)
    val passwords = Color(0xFF32ADE6) to Color(0xFF0B5F99)
    val update = Color(0xFF34C759) to Color(0xFF0E8A6A)
}

internal fun hex(c: Long) = Color(c)

@Composable
internal fun Line(text: String, color: Color = Muted, size: Int = 12, weight: FontWeight = FontWeight.Normal, lines: Int = 1) {
    Text(
        text,
        color = color,
        fontSize = size.sp,
        fontWeight = weight,
        maxLines = lines,
        overflow = TextOverflow.Ellipsis,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

/** A card washed with `color` on the left, fading into the dark card colour. */
@Composable
internal fun TintCard(color: Color, onClick: () -> Unit = {}, content: @Composable () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(Brush.horizontalGradient(listOf(color.copy(alpha = 0.55f), CardBg)))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) { content() }
}

/** An emoji in a soft white circle. */
@Composable
internal fun Badge(emoji: String, size: Int = 28) {
    Box(
        Modifier
            .size(size.dp)
            .background(Color.White.copy(alpha = 0.22f), CircleShape),
        contentAlignment = Alignment.Center,
    ) { Text(emoji, fontSize = (size * 0.52).sp) }
}

/** A full-width gradient button with an emoji, like the phone's dashboard tiles. */
@Composable
internal fun GradChip(emoji: String, label: String, sub: String, hue: Pair<Color, Color>, onClick: () -> Unit) {
    Chip(
        onClick = onClick,
        label = { Text(label, fontWeight = FontWeight.Bold, maxLines = 1) },
        secondaryLabel = { Text(sub, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        icon = { Badge(emoji, 26) },
        colors = ChipDefaults.gradientBackgroundChipColors(
            startBackgroundColor = hue.first,
            endBackgroundColor = hue.second,
            contentColor = Color.White,
            secondaryContentColor = Color.White.copy(alpha = 0.88f),
            iconColor = Color.White,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
}

/** Big gradient card at the top of a screen: a label, a value and a line under it. */
@Composable
internal fun HeroCard(label: String, value: String, hue: Pair<Color, Color>, under: @Composable () -> Unit = {}) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .background(Brush.linearGradient(listOf(hue.first, hue.second)))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(label, color = Color.White.copy(alpha = 0.85f), fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        Text(value, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1)
        under()
    }
}

/** A small rounded pill, e.g. "▲ ₹1,380 today". */
@Composable
internal fun Pill(text: String, color: Color) {
    Text(
        text,
        color = color,
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier
            .padding(top = 3.dp)
            .background(Color.Black.copy(alpha = 0.28f), RoundedCornerShape(10.dp))
            .padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

private fun pct(gain: Double, base: Double): String =
    if (base <= 0) "" else String.format(java.util.Locale.US, "%s%.1f%%", if (gain < 0) "−" else "+", abs(gain / base * 100))

private fun gainColor(n: Double) = if (n < 0) Red else Green

// ---------------- update notice ----------------

/** "Update available" on the home screen: sends the download to the phone. */
@Composable
internal fun UpdateChip(latest: Int) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var note by remember { mutableStateOf<String?>(null) }
    GradChip("⬆️", "Update available", note ?: "Build $latest · tap to download on phone", Hue.update) {
        scope.launch {
            note = try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(RELEASE_APK_URL)).addCategory(Intent.CATEGORY_BROWSABLE)
                RemoteActivityHelper(context).startRemoteActivity(intent, null).await()
                "Opened on your phone"
            } catch (e: Exception) {
                "Open GitHub → Releases on the phone"
            }
        }
    }
}

// ---------------- investments ----------------

private val CATEGORY_LOOK = mapOf(
    "Mutual Funds" to ("📊" to hex(0xFFAF52DE)),
    "Stocks" to ("📈" to hex(0xFF32ADE6)),
    "Digital Gold" to ("🪙" to hex(0xFFFFCC00)),
    "Digital Silver" to ("🥈" to hex(0xFFA8A9AD)),
    "Digital Platinum" to ("💎" to hex(0xFF8E9AAF)),
    "Crypto" to ("₿" to hex(0xFFF7931A)),
    "FD" to ("🏦" to hex(0xFF34C759)),
)

private fun categoryLook(c: String) = CATEGORY_LOOK[c] ?: ("💼" to Violet)

@Composable
fun InvestmentsScreen(s: Summary?) {
    var open by remember { mutableStateOf<String?>(null) }
    Screen {
        val inv = s?.portfolio
        if (inv == null || inv.categories.isEmpty()) {
            item { Spacer(Modifier.height(20.dp)) }
            item { Line(if (s == null) "No data yet" else "No investments yet", Muted, 12) }
            return@Screen
        }
        item {
            HeroCard("INVESTMENTS", inr(inv.current), Hue.invest) {
                Pill("${if (inv.gain < 0) "▼" else "▲"} ${inr(inv.gain)} ${pct(inv.gain, inv.invested)}", if (inv.gain < 0) Color(0xFFFFB3B5) else Color(0xFFB8F5C8))
                Text("Invested ${compactInr(inv.invested)} · ${inv.count} holdings", color = Color.White.copy(alpha = 0.8f), fontSize = 10.sp, modifier = Modifier.padding(top = 3.dp))
            }
        }
        inv.categories.forEach { c ->
            val (emoji, color) = categoryLook(c.category)
            val gain = c.current - c.invested
            val share = if (inv.current > 0) (c.current / inv.current).toFloat().coerceIn(0f, 1f) else 0f
            item {
                TintCard(color, onClick = { open = if (open == c.category) null else c.category }) {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Badge(emoji, 24)
                            Spacer(Modifier.width(6.dp))
                            Column(Modifier.weight(1f)) {
                                Text(c.category, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("${(share * 100).roundToInt()}% of total", color = Muted, fontSize = 10.sp)
                            }
                            Spacer(Modifier.width(6.dp))
                            Column(horizontalAlignment = Alignment.End) {
                                Text(compactInr(c.current), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                Text(pct(gain, c.invested), color = gainColor(gain), fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                        // Share of the total as a coloured bar.
                        Box(
                            Modifier
                                .padding(top = 5.dp)
                                .fillMaxWidth()
                                .height(4.dp)
                                .background(Color.White.copy(alpha = 0.12f), RoundedCornerShape(2.dp)),
                        ) {
                            Box(
                                Modifier
                                    .fillMaxWidth(share.coerceAtLeast(0.02f))
                                    .height(4.dp)
                                    .background(color, RoundedCornerShape(2.dp)),
                            )
                        }
                        if (open == c.category) {
                            c.holdings.forEach { h ->
                                val g = h.current - h.invested
                                Row(Modifier.padding(top = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(h.name, color = Color.White, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                    Spacer(Modifier.width(6.dp))
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(compactInr(h.current), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                        if (h.invested > 0) Text(pct(g, h.invested), color = gainColor(g), fontSize = 9.sp)
                                    }
                                }
                            }
                        } else if (c.holdings.size > 0) {
                            Text("Tap to see ${c.holdings.size} holding${if (c.holdings.size == 1) "" else "s"}", color = Muted, fontSize = 9.sp, modifier = Modifier.padding(top = 3.dp))
                        }
                    }
                }
            }
        }
        item { Line("Values as last refreshed on the phone", Muted, 9, lines = 2) }
    }
}

// ---------------- tickets ----------------

private val TICKET_LOOK = mapOf(
    "flight" to ("✈️" to (hex(0xFF5C6BC0) to hex(0xFF3949AB))),
    "train" to ("🚆" to (hex(0xFF26A69A) to hex(0xFF00796B))),
    "bus" to ("🚌" to (hex(0xFFFFA726) to hex(0xFFEF6C00))),
    "movie" to ("🎬" to (hex(0xFFEC407A) to hex(0xFFC2185B))),
    "event" to ("🎵" to (hex(0xFFAB47BC) to hex(0xFF7B1FA2))),
)

private fun ticketLook(type: String) = TICKET_LOOK[type] ?: ("🎫" to (hex(0xFF78909C) to hex(0xFF455A64)))

private fun countdown(days: Int) = when (days) {
    0 -> "Today"
    1 -> "Tomorrow"
    else -> "In $days days"
}

@Composable
fun TicketsScreen(s: Summary?) {
    Screen {
        item { ListHeader { Text("🎫 Tickets", color = Color(0xFF9FA8FF), fontWeight = FontWeight.Bold) } }
        val list = s?.tickets.orEmpty()
        if (list.isEmpty()) {
            item { Line(if (s == null) "No data yet" else "No upcoming tickets", Muted, 12) }
            return@Screen
        }
        items(list) { t ->
            val (emoji, hue) = ticketLook(t.type)
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp))
                    .background(Brush.linearGradient(listOf(hue.first, hue.second)))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Badge(emoji, 24)
                    Spacer(Modifier.width(6.dp))
                    Text(t.title, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                }
                val where = if (t.from.isNotBlank() || t.to.isNotBlank()) "${t.from} → ${t.to}" else t.venue
                if (where.isNotBlank()) Text(where, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
                Text(
                    listOf(dayLabel(t.date, t.daysLeft), t.time).filter { it.isNotBlank() }.joinToString(" · "),
                    color = Color.White.copy(alpha = 0.9f),
                    fontSize = 11.sp,
                )
                val extra = listOfNotNull(t.seat.takeIf { it.isNotBlank() }?.let { "Seat $it" }, t.bookingRef.takeIf { it.isNotBlank() }?.let { "Ref $it" })
                if (extra.isNotEmpty()) Text(extra.joinToString(" · "), color = Color.White.copy(alpha = 0.85f), fontSize = 10.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Pill(countdown(t.daysLeft), Color.White)
            }
        }
    }
}

// ---------------- important dates ----------------

@Composable
fun DatesScreen(s: Summary?) {
    Screen {
        item { ListHeader { Text("🎂 Dates", color = Amber, fontWeight = FontWeight.Bold) } }
        val list = s?.dates.orEmpty()
        if (list.isEmpty()) {
            item { Line(if (s == null) "No data yet" else "No dates saved", Muted, 12) }
            return@Screen
        }
        items(list) { d ->
            val soon = d.daysLeft <= 7
            TintCard(if (d.recurring) hex(0xFFF7B731) else hex(0xFFFF6A88)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Badge(if (d.recurring) "🎂" else "🎉", 26)
                    Spacer(Modifier.width(6.dp))
                    Column(Modifier.weight(1f)) {
                        Text(d.title, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        val since = d.since.toIntOrNull()?.let { y -> d.date.take(4).toIntOrNull()?.let { " · ${it - y} yrs" } } ?: ""
                        Text(dayLabel(d.date, d.daysLeft) + since, color = Color.White.copy(alpha = 0.85f), fontSize = 10.sp, maxLines = 1)
                    }
                    Spacer(Modifier.width(6.dp))
                    Text(
                        when (d.daysLeft) { 0 -> "Today"; 1 -> "1d"; else -> "${d.daysLeft}d" },
                        color = if (soon) Color.White else Muted,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                }
            }
        }
    }
}

// ---------------- passwords ----------------

private fun isWatchLocked(context: Context): Boolean =
    (context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isDeviceSecure

private val LETTER_COLORS = listOf(0xFFFF6A88, 0xFF9B87FF, 0xFF32ADE6, 0xFF34C759, 0xFFF7B731, 0xFFFF9F0A, 0xFFEC407A, 0xFF26A69A).map { Color(it) }

/** Passwords: loaded each time this opens, held in memory only, shown for 30 s on tap. */
@Composable
fun PasswordsScreen(api: Api) {
    val context = LocalContext.current
    val secure = remember { isWatchLocked(context) }
    var items by remember { mutableStateOf<List<Password>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(secure) {
        if (!secure) return@LaunchedEffect
        try {
            items = api.passwords()
        } catch (e: Exception) {
            error = e.message ?: "Couldn't load passwords"
        }
    }

    PasswordsBody(secure, items, error)
}

/** The list itself (tap a site to open it, then show the password for 30 s). */
@Composable
internal fun PasswordsBody(secure: Boolean, items: List<Password>?, error: String?, initiallyOpen: String? = null, initiallyShown: String? = null) {
    var open by remember { mutableStateOf(initiallyOpen) }
    var shown by remember { mutableStateOf(initiallyShown) }
    LaunchedEffect(shown) {
        if (shown != null) {
            delay(30_000)
            shown = null
        }
    }

    Screen {
        item { ListHeader { Text("🔑 Passwords", color = Color(0xFF7FD3FF), fontWeight = FontWeight.Bold) } }
        when {
            !secure -> item {
                Line("Set a screen lock on the watch (Settings → Security) to see passwords here.", Amber, 11, lines = 4)
            }
            error != null -> item { Line(error!!, Amber, 11, lines = 3) }
            items == null -> item { CircularProgressIndicator(modifier = Modifier.size(28.dp), indicatorColor = Hue.passwords.first) }
            items!!.isEmpty() -> item { Line("No saved passwords", Muted, 12) }
            else -> items(items!!) { p ->
                val color = LETTER_COLORS[abs(p.site.lowercase().hashCode()) % LETTER_COLORS.size]
                TintCard(color, onClick = { open = if (open == p.id) null else p.id; shown = null }) {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier
                                    .size(24.dp)
                                    .background(color, CircleShape),
                                contentAlignment = Alignment.Center,
                            ) { Text(p.site.take(1).uppercase().ifEmpty { "?" }, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold) }
                            Spacer(Modifier.width(6.dp))
                            Column(Modifier.weight(1f)) {
                                Text(p.site.ifBlank { "(no site)" }, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                if (p.username.isNotBlank()) Text(p.username, color = Color.White.copy(alpha = 0.8f), fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                        if (open == p.id) {
                            Text(
                                if (shown == p.id) p.password.ifEmpty { "(empty)" } else "••••••••",
                                color = Color.White,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = if (shown == p.id) 0.5.sp else 2.sp,
                                modifier = Modifier.padding(top = 6.dp),
                            )
                            CompactChip(
                                onClick = { shown = if (shown == p.id) null else p.id },
                                label = { Text(if (shown == p.id) "Hide" else "Show for 30 s") },
                                colors = ChipDefaults.chipColors(backgroundColor = Color.Black.copy(alpha = 0.35f), contentColor = Color.White),
                                modifier = Modifier.padding(top = 4.dp),
                            )
                        }
                    }
                }
            }
        }
        if (secure) item { Line("Not stored on the watch", Muted, 9) }
    }
}

