# DiaryByte for Wear OS

A small watch app that shows, from your DiaryByte server:

- **Home:** net worth, today's demat P/L, this month's P/L
- **Signals:** each watchlist stock's latest engine decision (long/short entry with entry, stop and target, or why it's waiting)
- **Next 5 days:** EMIs, bills, SIPs, autopays, tickets, birthdays and expiring vouchers
- **To-do:** open tasks; tap one to mark it done
- **Tile** (swipe from the watch face): net worth, today's P/L, the next two items due
- **Complications** for any watch face: *DiaryByte net worth* and *DiaryByte today's P/L*

Alerts (trip alarm, ntfy signals, reminders) already reach the watch as phone notifications; this app is for looking things up.

## 1. Get the APK

The **Build Wear OS app** GitHub Action builds it whenever `wear/` changes on `main` and publishes it as the release **"Wear OS app (latest)"**. On your phone, open the repository on GitHub → Releases → *Wear OS app (latest)* → download **DiaryByte-Wear.apk**.

To build it again by hand: GitHub → Actions → *Build Wear OS app* → *Run workflow*. If your server isn't `https://diarybyte-api.onrender.com`, type its address there, or set a repository variable `DIARYBYTE_SERVER`. You can also change the address later on the watch itself.

## 2. Install it on the watch (once)

Apps from outside the Play Store are installed over Wi-Fi from your phone:

1. **Watch:** Settings → System → About → Versions (Galaxy Watch: Settings → About watch → Software information). Tap **Software version** 7 times to unlock *Developer options*.
2. **Watch:** Settings → Developer options → turn on **ADB debugging** and **Wireless debugging**. The phone and watch must be on the same Wi-Fi.
3. **Watch:** Wireless debugging → **Pair new device**. It shows an IP address, a port and a 6-digit code.
4. **Phone:** install **Bugjaeger Mobile ADB** or **Wear Installer 2** from the Play Store, then pair using that IP, port and code.
5. **Phone:** in that app, install **DiaryByte-Wear.apk** onto the watch.
6. Turn *ADB debugging* off again when you're done if you like.

Later builds install over this one the same way (they're signed with the same key, so no uninstall is needed).

## 3. Pair it with your account

1. **Phone:** DiaryByte → Settings → **Wear OS watch** → **Pair a watch**. A 6-digit code appears (it works once, for 10 minutes).
2. **Watch:** open DiaryByte and type the code.

That's it. The watch keeps its own sign-in. **Unpair** is at the bottom of the watch's home screen.

If pairing says it can't reach the server, the server may be waking up (free Render servers sleep). Wait a minute and try again. If your server has a different address, tap **Code from phone ⚙** on the watch to change it; the phone's Wear OS watch section shows the right address.

## 4. Tile and complications

- **Tile:** swipe left from the watch face to the end → **+** → *DiaryByte summary*.
- **Complication:** touch and hold the watch face → Customize → pick a slot → *DiaryByte net worth* or *DiaryByte today's P/L*.

Both refresh about every 15–30 minutes, and right away whenever you open the app.

## For developers

Kotlin, Jetpack Compose for Wear OS, Tiles (ProtoLayout) and complication data sources. The server side lives in `server/watch.js` (`/api/watch/pair`, `/api/watch/redeem`, `/api/watch/summary`, `/api/watch/todo/:id/done`).

```bash
cd wear
echo "sdk.dir=$ANDROID_HOME" > local.properties
gradle assembleRelease            # → app/build/outputs/apk/release/app-release.apk
gradle assembleRelease -PdiarybyteServer=https://your-server.example.com
```

`app/sideload.keystore` is a fixed signing key so updates install over each other. It is not a Play Store key; the app isn't published there.
