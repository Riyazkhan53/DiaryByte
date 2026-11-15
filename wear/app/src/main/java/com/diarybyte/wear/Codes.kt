package com.diarybyte.wear

import android.app.KeyguardManager
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.Text
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.nio.ByteBuffer
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import kotlin.math.abs

// Authenticator codes on the watch. The phone keeps each account sealed with
// the vault code (PBKDF2-SHA256 → AES-256-GCM, the account id as associated
// data); the server only passes the sealed accounts on. The watch asks for
// the vault code once, keeps the derived key wrapped by the Android
// Keystore, and makes the codes itself (TOTP / HOTP), offline too.

data class AuthAccount(
    val id: String,
    val issuer: String,
    val name: String,
    val secret: String,
    val algorithm: String,
    val digits: Int,
    val period: Int,
    val type: String,
    val counter: Long,
)

object CodeCrypto {
    private const val VERIFIER_TEXT = "diarybyte-vault"

    /** The vault key from the code (same as the phone: PBKDF2-SHA256, 32 bytes). */
    fun deriveKey(code: String, saltB64: String, iterations: Int): ByteArray {
        val spec = PBEKeySpec(code.toCharArray(), Base64.decode(saltB64, Base64.DEFAULT), iterations, 256)
        return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
    }

    /** Opens "v1.<nonce>.<sealed>" (AES-GCM, tag at the end); null if the key is wrong. */
    fun open(key: ByteArray, payload: String, aad: String): String? = try {
        val parts = payload.split('.')
        if (parts.size != 3 || parts[0] != "v1") {
            null
        } else {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, Base64.decode(parts[1], Base64.DEFAULT)))
            cipher.updateAAD(aad.toByteArray(Charsets.UTF_8))
            String(cipher.doFinal(Base64.decode(parts[2], Base64.DEFAULT)), Charsets.UTF_8)
        }
    } catch (e: Exception) {
        null
    }

    fun checks(key: ByteArray, verifier: String) = open(key, verifier, "verifier") == VERIFIER_TEXT

    fun account(key: ByteArray, id: String, enc: String): AuthAccount? {
        val text = open(key, enc, id) ?: return null
        return try {
            val o = JSONObject(text)
            AuthAccount(
                id = id,
                issuer = o.optString("issuer"),
                name = o.optString("name"),
                secret = o.optString("secret"),
                algorithm = o.optString("algorithm", "SHA1"),
                digits = o.optInt("digits", 6),
                period = o.optInt("period", 30).takeIf { it > 0 } ?: 30,
                type = o.optString("type", "totp"),
                counter = o.optLong("counter", 0L),
            )
        } catch (e: Exception) {
            null
        }
    }

    // ---- the derived key, wrapped by a Keystore key that never leaves the watch ----

    private const val ALIAS = "diarybyte_codes"

    private fun wrapper(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return gen.generateKey()
    }

    fun wrap(bytes: ByteArray): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, wrapper())
        val out = cipher.doFinal(bytes)
        return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + "." + Base64.encodeToString(out, Base64.NO_WRAP)
    }

    fun unwrap(text: String): ByteArray? = try {
        val (iv, data) = text.split('.')
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, wrapper(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
        cipher.doFinal(Base64.decode(data, Base64.NO_WRAP))
    } catch (e: Exception) {
        null
    }
}

object Totp {
    private const val B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

    fun base32(text: String): ByteArray? {
        val clean = text.uppercase().filter { it != ' ' && it != '=' && it != '-' }
        if (clean.isEmpty() || clean.any { B32.indexOf(it) < 0 }) return null
        val out = ArrayList<Byte>()
        var bits = 0
        var value = 0
        for (ch in clean) {
            value = (value shl 5) or B32.indexOf(ch)
            bits += 5
            if (bits >= 8) {
                out.add(((value ushr (bits - 8)) and 0xFF).toByte())
                bits -= 8
            }
        }
        return out.toByteArray()
    }

    fun hotp(secret: ByteArray, counter: Long, digits: Int, algorithm: String): String {
        val alg = when (algorithm) {
            "SHA256" -> "HmacSHA256"
            "SHA512" -> "HmacSHA512"
            else -> "HmacSHA1"
        }
        val mac = Mac.getInstance(alg)
        mac.init(SecretKeySpec(secret, alg))
        val h = mac.doFinal(ByteBuffer.allocate(8).putLong(counter).array())
        val o = h[h.size - 1].toInt() and 0x0F
        val bin = ((h[o].toInt() and 0x7F) shl 24) or ((h[o + 1].toInt() and 0xFF) shl 16) or
            ((h[o + 2].toInt() and 0xFF) shl 8) or (h[o + 3].toInt() and 0xFF)
        var mod = 1
        repeat(digits) { mod *= 10 }
        return (bin % mod).toString().padStart(digits, '0')
    }

    /** (code, seconds left; null for HOTP). */
    fun code(a: AuthAccount, nowMs: Long): Pair<String, Int?> {
        val secret = base32(a.secret) ?: return "------" to null
        if (a.type == "hotp") return hotp(secret, a.counter, a.digits, a.algorithm) to null
        val t = nowMs / 1000
        return hotp(secret, t / a.period, a.digits, a.algorithm) to (a.period - (t % a.period)).toInt()
    }

    fun spaced(code: String) = if (code.length == 8) code.take(4) + " " + code.drop(4) else code.take(3) + " " + code.drop(3)
}

/** What the watch keeps: sealed accounts, the vault lock's public part, and the wrapped key. */
class CodeVault(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("diarybyte_codes", Context.MODE_PRIVATE)

    data class Lock(val salt: String, val iterations: Int, val verifier: String)

    fun lock(): Lock? {
        val salt = prefs.getString("salt", null) ?: return null
        return Lock(salt, prefs.getInt("iterations", 50000), prefs.getString("verifier", "") ?: "")
    }

    /** Sealed accounts as (id, enc). */
    fun items(): List<Pair<String, String>> = parseItems(prefs.getString("items", "[]") ?: "[]")

    fun save(json: JSONObject) {
        val l = json.optJSONObject("lock")
        val edit = prefs.edit().putString("items", (json.optJSONArray("items") ?: JSONArray()).toString())
        if (l != null) {
            // A new vault code on the phone: the saved key no longer fits.
            if (l.optString("salt") != prefs.getString("salt", null)) edit.remove("key")
            edit.putString("salt", l.optString("salt")).putInt("iterations", l.optInt("iterations", 50000)).putString("verifier", l.optString("verifier"))
        }
        edit.apply()
    }

    fun key(): ByteArray? = prefs.getString("key", null)?.let { CodeCrypto.unwrap(it) }

    fun saveKey(key: ByteArray) = prefs.edit().putString("key", CodeCrypto.wrap(key)).apply()

    fun forget() = prefs.edit().remove("key").apply()

    companion object {
        fun parseItems(text: String): List<Pair<String, String>> = try {
            val a = JSONArray(text)
            (0 until a.length()).mapNotNull { i ->
                val o = a.getJSONObject(i)
                val id = o.optString("id")
                val enc = o.optString("enc")
                if (id.isEmpty() || enc.isEmpty()) null else id to enc
            }
        } catch (e: Exception) {
            emptyList()
        }
    }
}

private fun watchSecure(context: Context): Boolean =
    (context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isDeviceSecure

private val CODE_COLORS = listOf(0xFF4285F4, 0xFFEA4335, 0xFFFBBC05, 0xFF34A853, 0xFF7C3AED, 0xFF0EA5E9, 0xFFF97316, 0xFFEC4899).map { Color(it) }

/** Codes: enter the vault code once; then live codes, refreshed from the server when online. */
@Composable
fun CodesScreen(api: Api) {
    val context = LocalContext.current
    val secure = remember { watchSecure(context) }
    val vault = remember { CodeVault(context) }
    val scope = rememberCoroutineScope()
    var sealed by remember { mutableStateOf(vault.items()) }
    var lock by remember { mutableStateOf(vault.lock()) }
    var key by remember { mutableStateOf(if (secure) vault.key() else null) }
    var note by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var now by remember { mutableStateOf(System.currentTimeMillis()) }

    LaunchedEffect(secure) {
        if (!secure) return@LaunchedEffect
        try {
            vault.save(api.authenticator())
            sealed = vault.items()
            lock = vault.lock()
            key = vault.key()
            note = null
        } catch (e: Exception) {
            note = if (sealed.isEmpty()) (e.message ?: "Couldn't load codes") else "Offline · saved codes"
        } finally {
            loading = false
        }
    }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            delay(1000 - now % 1000)
        }
    }

    val accounts = remember(sealed, key) {
        val k = key ?: return@remember emptyList<AuthAccount>()
        sealed.mapNotNull { (id, enc) -> CodeCrypto.account(k, id, enc) }
            .sortedBy { (it.issuer.ifEmpty { it.name }).lowercase() }
    }

    when {
        !secure -> Screen {
            item { ListHeader { Text("🛡️ Codes", color = Color(0xFF7CE0A0), fontWeight = FontWeight.Bold) } }
            item { Line("Set a screen lock on the watch (Settings → Security) to see codes here.", Amber, 11, lines = 4) }
        }
        key == null && lock == null -> Screen {
            item { ListHeader { Text("🛡️ Codes", color = Color(0xFF7CE0A0), fontWeight = FontWeight.Bold) } }
            item {
                if (loading) CircularProgressIndicator(modifier = Modifier.size(28.dp), indicatorColor = Hue.codes.first)
                else Line(note ?: "Set a vault code and add accounts in DiaryByte on the phone (Authenticator).", Muted, 11, lines = 4)
            }
        }
        key == null -> PinPad(
            title = "Vault code",
            onDone = { code ->
                val l = lock ?: return@PinPad "No vault code yet"
                val derived = withContext(Dispatchers.Default) { CodeCrypto.deriveKey(code, l.salt, l.iterations) }
                if (!CodeCrypto.checks(derived, l.verifier)) {
                    "Wrong code"
                } else {
                    vault.saveKey(derived)
                    key = derived
                    null
                }
            },
        )
        else -> Screen {
            item { ListHeader { Text("🛡️ Codes", color = Color(0xFF7CE0A0), fontWeight = FontWeight.Bold) } }
            if (note != null) item { Line(note!!, Muted, 10) }
            if (accounts.isEmpty()) {
                item { Line(if (sealed.isEmpty()) "No accounts yet. Add them in DiaryByte → Authenticator." else "These can't be opened with the saved code.", Muted, 11, lines = 3) }
            }
            items(accounts, key = { it.id }) { a ->
                val (code, left) = Totp.code(a, now)
                val low = left != null && left <= 5
                val color = CODE_COLORS[abs(a.issuer.ifEmpty { a.name }.lowercase().hashCode()) % CODE_COLORS.size]
                TintCard(color) {
                    Column(Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(a.issuer.ifEmpty { a.name }, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                if (a.issuer.isNotEmpty()) Text(a.name, color = Color.White.copy(alpha = 0.75f), fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            if (left != null) {
                                Box(contentAlignment = Alignment.Center) {
                                    CircularProgressIndicator(
                                        progress = left / a.period.toFloat(),
                                        modifier = Modifier.size(24.dp),
                                        indicatorColor = if (low) Color(0xFFFF8A80) else Color.White,
                                        trackColor = Color.White.copy(alpha = 0.2f),
                                        strokeWidth = 2.5.dp,
                                    )
                                    Text("$left", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                        Text(
                            Totp.spaced(code),
                            color = if (low) Color(0xFFFFCDD2) else Color.White,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = 2.sp,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                }
            }
            item {
                CompactChip(
                    onClick = {
                        scope.launch {
                            vault.forget()
                            key = null
                        }
                    },
                    label = { Text("Forget code on watch") },
                    colors = ChipDefaults.chipColors(backgroundColor = Color(0xFF263238), contentColor = Color.White),
                )
            }
        }
    }
}

/** A 6-digit code pad. onDone returns an error to show, or null when accepted. */
@Composable
private fun PinPad(title: String, onDone: suspend (String) -> String?) {
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun press(d: String) {
        if (busy) return
        error = null
        if (d == "⌫") {
            code = code.dropLast(1)
            return
        }
        if (code.length >= 6) return
        code += d
        if (code.length == 6) {
            busy = true
            scope.launch {
                val result = try {
                    onDone(code)
                } catch (e: Exception) {
                    "Couldn't check it"
                }
                busy = false
                if (result != null) {
                    error = result
                    code = ""
                }
            }
        }
    }

    Screen {
        item { ListHeader { Text("🛡️ $title", color = Color(0xFF7CE0A0), fontWeight = FontWeight.Bold) } }
        item {
            Text(
                if (busy) "Checking…" else "●".repeat(code.length) + "○".repeat(6 - code.length),
                color = if (error != null) Color(0xFFFF8A80) else Color.White,
                fontSize = 16.sp,
                letterSpacing = 3.sp,
            )
        }
        item { Line(error ?: "Same code as the phone's vault", if (error != null) Amber else Muted, 10) }
        listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf("", "0", "⌫")).forEach { row ->
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { d ->
                        if (d.isEmpty()) {
                            Spacer(Modifier.width(40.dp))
                        } else {
                            Box(
                                Modifier
                                    .size(40.dp)
                                    .background(Color(0xFF263238), CircleShape)
                                    .clickable { press(d) },
                                contentAlignment = Alignment.Center,
                            ) { Text(d, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold) }
                        }
                    }
                }
            }
        }
    }
}
