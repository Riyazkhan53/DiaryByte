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
