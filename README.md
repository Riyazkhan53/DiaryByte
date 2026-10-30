# DiaryByte

Your personal space — a cross-platform app for web, iOS, and Android built with [Expo](https://expo.dev) and React Native.

DiaryByte greets you by name on a personal dashboard and keeps your daily journal, movie watch list, saved passwords, banking details, and private notes all in one place — stored locally on your device.

## Features

### Dashboard
- Personalized greeting based on the time of day (Good Morning / Afternoon / Evening / Night)
- Quick-access cards to every section

### Personal Diary
- Write entries with a title, mood (emoji picker), and category tags
- Attach photos to entries
- Search entries by title or content
- Calendar view with entry indicators and date filtering
- Full entry detail view with edit-free reading and delete support

### Movies Watch List
- Track movies with Watchlist / Watching / Watched statuses
- Tap a movie's status icon to cycle between statuses
- Filter the list by status

### Saved Passwords
- Store site/app credentials with username and password
- Reveal/hide passwords with a tap

### Banking Details
- Save bank accounts with type (Savings, Current, Salary, Credit Card)
- Account numbers are masked by default, with reveal/hide toggle
- IFSC and UPI ID support

### Personal Vault
- Private notes for things like WiFi passwords and locker codes
- Contents hidden until you tap Reveal

### My Tickets
- Wallet-style passes for flights, trains, buses, movies, events and more
- Save the ticket's QR / barcode as a screenshot or a camera photo
- Route (From → To) for travel, venue for shows, plus date, time, seat and PNR
- Upcoming / Past tabs with a countdown ("Today", "Tomorrow", "In 5 days")
- Tap a pass to open it full screen for scanning at the gate
- Tickets due today or tomorrow appear on the dashboard
- Android: share a booking from BookMyShow, an airline, IRCTC, redBus etc. (or a ticket screenshot) to DiaryByte and it opens as a pre-filled ticket
- "Paste booking message" fills the form from a copied SMS, email or WhatsApp message
- Save the booking link and open the ticket in its app ("Open in BookMyShow")

### My Debts
- Three sections: **My EMIs**, **Credit Cards** and **Other Bills**
- Add a loan with amount, interest rate, tenure and first EMI month — every EMI until the loan closes is planned automatically, with the principal/interest split and balance for each month
- Outstanding principal is calculated from the EMIs you mark paid, so it never has to be typed in
- Credit card and other bills are added by hand, with due dates and a one-tap "copy to next month"
- Marking an EMI or bill paid adds it to My Expenditure for the month it's due (un-marking removes it)

### My Expenditure
- Income and spending month by month, with this month's EMIs and bills to tick off
- Month-end report: income vs EMIs, credit card bills, other bills and other spending
- If a month ends in the red, tally it as borrowed (optionally added to My Debts), from savings or extra income

### My Trading
- **Setup**: score a stock on 7 indicators (BUY / SELL / WAIT), fill them from daily prices, keep a log.
- **Signals**: intraday engine on completed 5-minute candles (15-minute trend filter). Score and
  eligibility are separate: mandatory gates (fresh data, market open, enough history, VWAP side,
  volume, a stop that fits your risk budget and cash, daily loss limit, position limit, no repeats)
  turn anything unsafe into NO TRADE. Risk plan sizes trades from a rupee budget with estimated
  charges. The server scans a watchlist every 5 minutes in NSE hours and paper-trades candidates
  (next-candle entry, conservative fills, 15:20 square-off, charges deducted). Engine code lives in
  `src/engine` and runs in both the app and the server. Data: Yahoo (prototype, may be delayed) or
  Kite Connect (`MARKET_DATA_PROVIDER=kite`, `KITE_API_KEY`, `KITE_API_SECRET`, daily login from the
  Signals tab). Paper trading only — no order placement.
- **Open / Done**: your own paper trades with live P/L and R, a daily loss stop, sizing from your
  risk budget, and a review page (win rate, net after charges, average R, by signal).

### Settings
- Change your name (used in the dashboard greeting)
- Dark mode toggle (persisted)
- Reset all data with confirmation

## Tech Stack

- [Expo SDK 57](https://expo.dev) + React Native
- [Expo Router](https://docs.expo.dev/router/introduction/) for navigation
- AsyncStorage for local data persistence
- expo-linear-gradient, expo-image-picker, @expo/vector-icons

## Getting Started

```bash
# Install dependencies
npm install

# Start the dev server
npx expo start

# Or run directly on a platform
npx expo start --web      # web
npx expo start --ios      # iOS simulator
npx expo start --android  # Android emulator
```

To view on your physical device, install the [Expo Go](https://expo.dev/go) app and scan the QR code from the dev server.

### Production Web Build

```bash
npm run build   # exports static bundle to dist/
```

### Lint & Health Check

```bash
npx expo lint
npx expo-doctor
```

## Project Structure

```
src/
├── app/                # Screens (Expo Router file-based routes)
│   ├── index.js        # Dashboard
│   ├── diary/          # Personal diary screens
│   ├── movies/         # Movies watch list
│   ├── passwords/      # Saved passwords
│   ├── banking/        # Banking details
│   ├── vault/          # Personal vault
│   ├── tickets/        # My Tickets wallet
│   └── settings.js     # Settings
├── components/         # Reusable UI components
├── constants/          # Theme, moods, categories
├── hooks/              # Theme context hook
└── utils/              # Storage helpers
```

## Privacy

All data is stored locally on your device using AsyncStorage. Nothing is sent to any server.

## License

MIT
