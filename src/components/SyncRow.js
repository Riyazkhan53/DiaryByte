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

/**
 * Sync status row with a per-section "pull from server" button.
 * Pulls only this section's collection; unsynced local changes are merged, not lost.
 */
export default function SyncRow({ synced, pulling, pullInfo, onPull }) {
  const { theme } = useTheme();

  const handlePull = async () => {
    const result = await onPull();
    if (result && !result.ok) {
      Alert.alert('Sync failed', result.error || 'Could not reach the server.');
    }
  };

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
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  text: { flex: 1, fontSize: 11, marginLeft: 5, fontWeight: '600' },
  pullBtn: { padding: 4 },
});
