import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { isGuest } from '../services/session';

/**
 * Sync status row with a per-section "pull from server" button.
 * Pulls only this section's collection; unsynced local changes are merged, not lost.
 */
export default function SyncRow({ synced, pulling, pullInfo, onPull, error }) {
  const { theme } = useTheme();

  const handlePull = async () => {
    const result = await onPull();
    if (result && !result.ok) {
      Alert.alert('Sync failed', result.error || 'Could not reach the server.');
    }
  };

  // Guests have nothing to sync: say where the data is and offer no pull.
  if (isGuest()) {
    return (
      <View style={styles.row}>
        <Ionicons name="phone-portrait-outline" size={13} color={theme.textMuted} />
        <Text style={[styles.text, { color: theme.textMuted }]}>Guest mode · saved on this device only</Text>
      </View>
    );
  }

  // The local copy couldn't be opened (nothing has been changed).
  if (error && !pullInfo) {
    return (
      <View style={styles.row}>
        <Ionicons name="alert-circle-outline" size={13} color="#E5383B" />
        <Text style={[styles.text, styles.flexText, { color: '#E5383B' }]}>{error}</Text>
      </View>
    );
  }

  const text = pullInfo
    ? `Pulled ${pullInfo.count} item${pullInfo.count === 1 ? '' : 's'} from server`
    : synced
      ? 'Saved locally · synced to server'
      : 'Saved on this device';
  const color = pullInfo || synced ? theme.primaryDark : theme.textMuted;

  return (
    <View style={styles.row}>
      <Ionicons
        name={pullInfo || synced ? 'cloud-done-outline' : 'phone-portrait-outline'}
        size={13}
        color={color}
      />
      <Text style={[styles.text, { color }]}>{text}</Text>
      <TouchableOpacity onPress={handlePull} disabled={pulling} style={styles.pullBtn}>
        {pulling ? (
          <ActivityIndicator size="small" color={theme.primaryDark} />
        ) : (
          <Ionicons name="cloud-download-outline" size={17} color={theme.primaryDark} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  flexText: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  text: { flex: 1, fontSize: 11, marginLeft: 5, fontWeight: '600' },
  pullBtn: { padding: 4 },
});
