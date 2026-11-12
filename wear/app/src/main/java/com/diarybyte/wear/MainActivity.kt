package com.diarybyte.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.painter.ColorPainter
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.ScalingLazyListScope
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Card
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.material.Vignette
import androidx.wear.compose.material.VignettePosition
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import kotlinx.coroutines.launch


class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colors = Colors(primary = Pink, secondary = Violet, onPrimary = Color.Black)) { App() }
        }
    }
}

@Composable
fun App() {
    val context = LocalContext.current
    val store = remember { Store(context) }
    val api = remember { Api(context) }
    val scope = rememberCoroutineScope()
    val nav = rememberSwipeDismissableNavController()

    var paired by remember { mutableStateOf(store.paired) }
    val cached = remember { store.cached() }
    var summary by remember { mutableStateOf(cached?.first) }
    var savedAt by remember { mutableLongStateOf(cached?.second ?: 0L) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun refresh() {
        if (loading) return
        loading = true
        error = null
        scope.launch {
            try {
                summary = api.summary()
                savedAt = System.currentTimeMillis()
            } catch (e: ApiError) {
                error = e.message
                if (e.status == 401) error = "Signed out. Unpair and pair again."
            } catch (e: Exception) {
                error = "Can't reach the server. Check the watch is online."
            } finally {
                loading = false
            }
        }
    }

    var latest by remember { mutableStateOf<Int?>(null) }

    LaunchedEffect(paired) { if (paired) refresh() }
    LaunchedEffect(Unit) { latest = latestBuild(context) }

    SwipeDismissableNavHost(navController = nav, startDestination = "home") {
        composable("home") {
            if (!paired) {
                PairScreen(api, onServer = { nav.navigate("server") }) {
                    paired = true
                    refreshSurfaces(context)
                }
            } else {
                HomeScreen(summary, savedAt, loading, error, latest, ::refresh, onOpen = { nav.navigate(it) }, onUnpair = {
                    store.unpair()
                    summary = null
                    paired = false
                    refreshSurfaces(context)
                })
            }
        }
        composable("signals") { Screen { signalsList(summary) } }
        composable("upcoming") { Screen { upcomingList(summary) } }
        composable("todo") {
            TodoScreen(summary, api, onDone = { id ->
                summary = summary?.let { s -> s.copy(todos = s.todos.filterNot { it.id == id }) }
            })
        }
        composable("investments") { InvestmentsScreen(summary) }
        composable("tickets") { TicketsScreen(summary) }
        composable("dates") { DatesScreen(summary) }
        composable("passwords") { PasswordsScreen(api) }
        composable("server") { ServerScreen(store) { nav.popBackStack() } }
    }
}

/** A scrolling page with the time on top and a scroll indicator. */
@Composable
fun Screen(content: ScalingLazyListScope.() -> Unit) {
    val state = rememberScalingLazyListState()
    Scaffold(
        timeText = { TimeText() },
        vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
        positionIndicator = { PositionIndicator(scalingLazyListState = state) },
    ) {
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize(),
            state = state,
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            // A little room at the top, so the first card opens in view.
            item { Spacer(Modifier.height(8.dp)) }
            content()
        }
    }
}

// ---------------- home ----------------

@Composable
fun HomeScreen(
    s: Summary?,
    savedAt: Long,
    loading: Boolean,
    error: String?,
    latest: Int?,
    onRefresh: () -> Unit,
    onOpen: (String) -> Unit,
    onUnpair: () -> Unit,
) {
    var confirmUnpair by remember { mutableStateOf(false) }
    Screen {
        if (s == null) {
            item {
                if (loading) CircularProgressIndicator(modifier = Modifier.size(32.dp), indicatorColor = Pink)
                else Line(error ?: "No data yet", Muted, 13, lines = 3)
            }
            item { Line("A sleeping server can take a minute to wake.", Muted, 11, lines = 2) }
        } else {
            item {
                HeroCard("NET WORTH", inr(s.netWorth).let { if (s.netWorth < 0) "−$it" else it }, Hue.worth) {
                    if (s.pnlTodayEntered) {
                        Pill("${if (s.pnlToday < 0) "▼" else "▲"} ${inr(s.pnlToday)} today", if (s.pnlToday < 0) Color(0xFFFFB3B5) else Color(0xFFB8F5C8))
                    } else {
                        Pill("Today's P/L not entered", Color.White.copy(alpha = 0.85f))
                    }
                    Text(
                        "Month ${signedCompact(s.pnlMonth)} · Demat ${compactInr(s.demat)}",
                        color = Color.White.copy(alpha = 0.85f),
                        fontSize = 10.sp,
                        modifier = Modifier.padding(top = 3.dp),
                    )
                }
            }
            item {
                Line(
                    if (loading) "Updating…" else error ?: ageLabel(savedAt),
                    if (error != null && !loading) Amber else Muted,
                    10,
                    lines = 2,
                )
            }
            if (latest != null && latest > BuildConfig.VERSION_CODE) item { UpdateChip(latest) }
            val candidates = s.signals.count { it.state == "BUY CANDIDATE" || it.state == "SELL CANDIDATE" }
            item {
                GradChip(
                    "📈",
                    "Signals",
                    if (candidates > 0) "$candidates entry signal${if (candidates == 1) "" else "s"}"
                    else if (s.marketOpen) "No entries · ${s.signals.size} watched" else "Market closed",
                    Hue.signals,
                ) { onOpen("signals") }
            }
            item {
                val next = s.upcoming.firstOrNull()
                GradChip("📅", "Next 5 days", if (next == null) "Nothing due" else "${dayLabel(next.date, next.daysLeft)} · ${next.title}", Hue.upcoming) { onOpen("upcoming") }
            }
            item {
                val inv = s.portfolio
                GradChip(
                    "💰",
                    "Investments",
                    if (inv.count == 0) "None yet" else "${compactInr(inv.current)} · ${signedCompact(inv.gain)}",
                    Hue.invest,
                ) { onOpen("investments") }
            }
            item {
                val t = s.tickets.firstOrNull()
                GradChip("🎫", "Tickets", if (t == null) "None upcoming" else "${dayLabel(t.date, t.daysLeft)} · ${t.title}", Hue.tickets) { onOpen("tickets") }
            }
            item {
                val d = s.dates.firstOrNull()
                GradChip("🎂", "Dates", if (d == null) "None saved" else "${dayLabel(d.date, d.daysLeft)} · ${d.title}", Hue.dates) { onOpen("dates") }
            }
            item {
                GradChip("✅", "To-do", if (s.todos.isEmpty()) "All done" else "${s.todos.size} open", Hue.todo) { onOpen("todo") }
            }
            item { GradChip("🔑", "Passwords", "Tap to unlock", Hue.passwords) { onOpen("passwords") } }
        }
        item {
            CompactChip(
                onClick = onRefresh,
                label = { Text(if (loading) "Updating…" else "Refresh") },
                icon = { Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(16.dp)) },
                colors = ChipDefaults.secondaryChipColors(),
            )
        }
        item {
            CompactChip(
                onClick = { if (confirmUnpair) onUnpair() else confirmUnpair = true },
                label = { Text(if (confirmUnpair) "Tap again to unpair" else "Unpair") },
                colors = ChipDefaults.chipColors(backgroundColor = CardBg, contentColor = if (confirmUnpair) Red else Muted),
            )
        }
        item { Line("Version ${BuildConfig.VERSION_NAME}", Muted.copy(alpha = 0.6f), 9) }
    }
}

// ---------------- signals ----------------

private fun stateColor(state: String?) = when (state) {
    "BUY CANDIDATE" -> Green
    "SELL CANDIDATE" -> Red
    "WAIT" -> Amber
    else -> Muted
}

private fun stateLabel(sig: Signal) = when (sig.state) {
    "BUY CANDIDATE" -> "LONG ENTRY"
    "SELL CANDIDATE" -> "SHORT ENTRY"
    null -> "No scan yet today"
    else -> sig.state
}

fun ScalingLazyListScope.signalsList(s: Summary?) {
    item { ListHeader { Text("📈 Signals", color = Color(0xFF5FE0A8), fontWeight = FontWeight.Bold) } }
    if (s == null || s.signals.isEmpty()) {
        item { Line(if (s == null) "No data yet" else "Your watchlist is empty", Muted, 12, lines = 2) }
        return
    }
    item {
        Line(
            (if (s.marketOpen) "Market open" else "Market closed") + if (s.openTrades > 0) " · ${s.openTrades} paper trade${if (s.openTrades == 1) "" else "s"} open" else "",
            Muted,
            11,
        )
    }
    items(s.signals) { sig ->
        TintCard(stateColor(sig.state)) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(shortSymbol(sig.symbol), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.weight(1f))
                    if (sig.score != null) {
                        Text("${sig.score}${sig.threshold?.let { "/$it" } ?: ""}", color = Muted, fontSize = 12.sp)
                    }
                }
                Text(
                    stateLabel(sig) + (sig.side?.takeIf { sig.state == "WAIT" }?.let { " · $it" } ?: ""),
                    color = stateColor(sig.state),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                if (sig.entry != null) {
                    Text("Entry ${price(sig.entry)}", color = Color.White, fontSize = 11.sp)
                    Text("SL ${price(sig.stop)} · T ${price(sig.target)}", color = Color.White, fontSize = 11.sp)
                } else if (!sig.nextAction.isNullOrBlank()) {
                    Text(sig.nextAction, color = Muted, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
    item { Line("Paper trading only. Not an order.", Muted, 10) }
}

// ---------------- next 5 days ----------------

private val KIND_LOOK = mapOf(
    "autopay" to ("🔁" to Color(0xFFFF9500)),
    "sip" to ("📈" to Color(0xFFAF52DE)),
    "emi" to ("🏦" to Color(0xFFE5383B)),
    "bill" to ("🧾" to Color(0xFFFF375F)),
    "ticket" to ("🎫" to Color(0xFF5C6BC0)),
    "date" to ("🎂" to Color(0xFFF5A623)),
    "voucher" to ("🎁" to Color(0xFFFF6A88)),
)

fun ScalingLazyListScope.upcomingList(s: Summary?) {
    item { ListHeader { Text("📅 Next 5 days", color = Color(0xFFFFB347), fontWeight = FontWeight.Bold) } }
    if (s == null || s.upcoming.isEmpty()) {
        item { Line(if (s == null) "No data yet" else "Nothing due. Enjoy!", Muted, 12) }
        return
    }
    if (s.goingOut > 0) item { Line("${inr(s.goingOut)} going out", Muted, 11) }
    var lastDate = ""
    s.upcoming.forEach { u ->
        if (u.date != lastDate) {
            lastDate = u.date
            item { Line(dayLabel(u.date, u.daysLeft).uppercase(), Pink, 11, FontWeight.Bold) }
        }
        item {
            val (emoji, tint) = KIND_LOOK[u.kind] ?: ("📌" to Violet)
            TintCard(tint) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Badge(emoji, 24)
                    Spacer(Modifier.width(6.dp))
                    Column(Modifier.weight(1f)) {
                        Text(u.title, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        if (u.sub.isNotBlank()) Text(u.sub, color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (u.amount != null && u.amount > 0) {
                        Spacer(Modifier.width(4.dp))
                        Text(compactInr(u.amount), color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

// ---------------- to-do ----------------

@Composable
fun TodoScreen(s: Summary?, api: Api, onDone: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    Screen {
        item { ListHeader { Text("✅ To-do", color = Pink, fontWeight = FontWeight.Bold) } }
        val todos = s?.todos.orEmpty()
        if (todos.isEmpty()) item { Line(if (s == null) "No data yet" else "All done", Muted, 12) }
        if (error != null) item { Line(error!!, Amber, 11, lines = 2) }
        items(todos) { t ->
            Chip(
                onClick = {
                    if (busy != null) return@Chip
                    busy = t.id
                    error = null
                    scope.launch {
                        try {
                            api.todoDone(t.id)
                            onDone(t.id)
                        } catch (e: Exception) {
                            error = e.message ?: "Couldn't update. Try again."
                        } finally {
                            busy = null
                        }
                    }
                },
                label = { Text(t.title, maxLines = 2, overflow = TextOverflow.Ellipsis) },
                secondaryLabel = { Text(if (busy == t.id) "Saving…" else "Tap when done") },
                icon = { Icon(Icons.Filled.Check, contentDescription = "Mark done", tint = if (busy == t.id) Green else Muted) },
                colors = ChipDefaults.gradientBackgroundChipColors(
                    startBackgroundColor = Hue.todo.first.copy(alpha = 0.6f),
                    endBackgroundColor = CardBg,
                    contentColor = Color.White,
                    secondaryContentColor = Color.White.copy(alpha = 0.8f),
                ),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

// ---------------- pairing ----------------

@Composable
fun PairScreen(api: Api, onServer: () -> Unit, onPaired: () -> Unit) {
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun submit() {
        if (code.length != 6 || busy) return
        busy = true
        error = null
        scope.launch {
            try {
                api.redeem(code)
                onPaired()
            } catch (e: ApiError) {
                error = e.message
                code = ""
            } catch (e: Exception) {
                error = "Can't reach the server. It may be waking up; try again in a minute."
                code = ""
            } finally {
                busy = false
            }
        }
    }

    // Fixed layout (no scrolling while typing): sized from the screen width.
    Scaffold {
        BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            val w = maxWidth
            val keyW = w * 0.155f
            val keyH = w * 0.18f
            val gap = w * 0.012f
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(gap)) {
                Text(
                    "Code from phone ⚙",
                    color = Pink,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable(onClick = onServer),
                )
                Box(Modifier.height(w * 0.15f), contentAlignment = Alignment.Center) {
                    when {
                        busy -> CircularProgressIndicator(modifier = Modifier.size(w * 0.11f), indicatorColor = Pink)
                        error != null -> Text(
                            error!!,
                            color = Amber,
                            fontSize = 10.sp,
                            textAlign = TextAlign.Center,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.width(w * 0.8f),
                        )
                        else -> Text(
                            code.padEnd(6, '_').let { "${it.take(3)} ${it.drop(3)}" },
                            color = Color.White,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 3.sp,
                        )
                    }
                }
                @Composable
                fun Key(label: String, width: androidx.compose.ui.unit.Dp, primary: Boolean = false, enabled: Boolean, onClick: () -> Unit) {
                    Button(
                        onClick = onClick,
                        enabled = enabled,
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.size(width, keyH),
                        colors = if (primary) ButtonDefaults.primaryButtonColors() else ButtonDefaults.secondaryButtonColors(),
                    ) { Text(label, fontSize = 16.sp, fontWeight = FontWeight.Bold) }
                }
                val digitsOn = code.length < 6 && !busy
                fun type(d: String) {
                    error = null
                    code += d
                    if (code.length == 6) submit()
                }
                listOf("12345", "67890").forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                        row.forEach { d -> Key(d.toString(), keyW, enabled = digitsOn) { type(d.toString()) } }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(gap * 2)) {
                    Key("⌫", keyW * 1.4f, enabled = code.isNotEmpty() && !busy) { code = code.dropLast(1) }
                    Key("OK", keyW * 1.4f, primary = true, enabled = code.length == 6 && !busy) { submit() }
                }
            }
        }
    }
}

/** Change the server address (only needed if it isn't the default). */
@Composable
fun ServerScreen(store: Store, onDone: () -> Unit) {
    var value by remember { mutableStateOf(store.server) }
    Screen {
        item { Spacer(Modifier.height(16.dp)) }
        item { Line("Server address", Pink, 12, FontWeight.Bold) }
        item { Line("Same as the phone shows under Wear OS watch", Muted, 10, lines = 2) }
        item {
            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp)
            ) {
                BasicTextField(
                    value = value,
                    onValueChange = { value = it.trim() },
                    singleLine = true,
                    textStyle = TextStyle(color = Color.White, fontSize = 13.sp),
                    cursorBrush = SolidColor(Pink),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp),
                )
            }
        }
        item {
            Button(onClick = {
                if (value.startsWith("http")) store.server = value
                onDone()
            }) { Icon(Icons.Filled.Check, contentDescription = "Save") }
        }
        item {
            CompactChip(
                onClick = { value = BuildConfig.DEFAULT_SERVER },
                label = { Text("Use default") },
                colors = ChipDefaults.secondaryChipColors(),
            )
        }
    }
}
