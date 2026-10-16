import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useTheme } from '../hooks/useTheme';

// Over-the-air updates (EAS Update). Only installed builds can update. In
// Expo Go and `expo start` dev mode Updates.isEnabled is false; the web
// stub reports true, so check the platform too.
const updatesEnabled = Platform.OS !== 'web' && Updates.isEnabled;

async function checkAndDownload() {
  const result = await Updates.checkForUpdateAsync();
  if (result.isAvailable) await Updates.fetchUpdateAsync();
  return result.isAvailable;
}

/**
 * Dashboard banner. Also looks for updates whenever the app comes back to
 * the foreground (the built-in check only runs on a cold start), and offers
 * a restart once one has downloaded.
 */
export function UpdateReadyBanner() {
  if (!updatesEnabled) return null;
  return <UpdateReadyBannerInner />;
}

function UpdateReadyBannerInner() {
  const { theme } = useTheme();
  const { isUpdatePending } = Updates.useUpdates();

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkAndDownload().catch(() => {});
    });
    return () => subscription.remove();
  }, []);

  if (!isUpdatePending) return null;
  return (
    <View style={[styles.banner, { backgroundColor: theme.surface, borderColor: theme.primaryDark }]}>
      <Ionicons name="sparkles-outline" size={20} color={theme.primaryDark} />
      <Text style={[styles.bannerText, { color: theme.text }]}>A new version is ready</Text>
      <TouchableOpacity
        style={[styles.bannerBtn, { backgroundColor: theme.primary }]}
        onPress={() => Updates.reloadAsync()}
      >
        <Text style={[styles.bannerBtnText, { color: theme.text }]}>Restart</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Settings section: shows the running version and lets the user check for,
 * download and apply an update by hand.
 */
export function AppUpdatesSection({ sectionStyle, titleStyle, hintStyle }) {
  const { theme } = useTheme();
  if (!updatesEnabled) {
    return (
      <View style={sectionStyle}>
        <Text style={titleStyle}>App Updates</Text>
        <Text style={[hintStyle, { color: theme.textMuted }]}>
          Over-the-air updates work in installed builds, not on web or in development.
        </Text>
      </View>
    );
  }
  return <AppUpdatesSectionInner sectionStyle={sectionStyle} titleStyle={titleStyle} hintStyle={hintStyle} />;
}

function AppUpdatesSectionInner({ sectionStyle, titleStyle, hintStyle }) {
  const { theme } = useTheme();
  const { currentlyRunning, isChecking, isDownloading, isUpdatePending, downloadProgress } =
    Updates.useUpdates();
  const [message, setMessage] = useState(null);

  const check = async () => {
    setMessage(null);
    try {
      const found = await checkAndDownload();
      if (!found) setMessage("You're on the latest version.");
    } catch (error) {
      setMessage(`Couldn't check for updates: ${error.message}`);
    }
  };

  const busy = isChecking || isDownloading;
  const version = currentlyRunning.isEmbeddedLaunch
    ? 'Built-in version'
    : `Updated ${currentlyRunning.createdAt?.toLocaleString() || ''}`;

  let label = 'Check for Updates';
  if (isChecking) label = 'Checking...';
  else if (isDownloading) label = `Downloading${downloadProgress ? ` ${Math.round(downloadProgress * 100)}%` : '...'}`;
  else if (isUpdatePending) label = 'Restart to Update';

  return (
    <View style={sectionStyle}>
      <Text style={titleStyle}>App Updates</Text>
      <Text style={[styles.version, { color: theme.textSecondary }]}>
        {version}
        {Updates.channel ? ` · ${Updates.channel} channel` : ''}
      </Text>
      <TouchableOpacity
        style={[styles.updateBtn, { backgroundColor: theme.primary }]}
        onPress={isUpdatePending ? () => Updates.reloadAsync() : check}
        disabled={busy}
        activeOpacity={0.8}
      >
        {busy ? (
          <ActivityIndicator size="small" color={theme.text} />
        ) : (
          <Ionicons
            name={isUpdatePending ? 'refresh-outline' : 'cloud-download-outline'}
            size={20}
            color={theme.text}
          />
        )}
        <Text style={[styles.updateBtnText, { color: theme.text }]}>{label}</Text>
      </TouchableOpacity>
      <Text style={[hintStyle, { color: theme.textMuted }]}>
        {message || 'New versions also download automatically when the app opens.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bannerText: { flex: 1, fontSize: 15, fontWeight: '700' },
  bannerBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  bannerBtnText: { fontSize: 14, fontWeight: '700' },
  version: { fontSize: 14 },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  updateBtnText: { fontSize: 15, fontWeight: '600' },
});
