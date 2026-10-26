import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Switch,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Header from '../components/Header';
import { useTheme } from '../hooks/useTheme';
import { pullAllFromServer, SYNCED_COLLECTIONS } from '../services/sync';
import { AppUpdatesSection } from '../components/AppUpdates';

export default function SettingsScreen() {
  const { theme, isDark, toggleTheme, themeMode, updateThemeMode, userName, updateUserName } =
    useTheme();
  const [nameDraft, setNameDraft] = useState(userName);
  const [syncing, setSyncing] = useState(false);

  const saveName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed) updateUserName(trimmed);
  };

  const syncFromServer = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const results = await pullAllFromServer();
      const okCount = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      const totalItems = results
        .filter((r) => r.ok)
        .reduce((sum, r) => sum + r.count, 0);

      if (failed.length === 0) {
        Alert.alert(
          'Sync Complete',
          `Pulled the latest data from the server (${totalItems} items across ${okCount} sections). Reopen a section to see the updates.`
        );
      } else if (okCount === 0) {
        Alert.alert(
          'Sync Failed',
          'Could not reach the server. Check your internet connection and try again — your local data is safe.'
        );
      } else {
        Alert.alert(
          'Partial Sync',
          `${okCount} of ${results.length} sections synced. Failed: ${failed
            .map((f) => f.collection)
            .join(', ')}.`
        );
      }
    } catch (error) {
      console.error('Sync from server failed', error);
      Alert.alert('Sync Failed', 'Something went wrong while syncing. Your local data is safe.');
    } finally {
      setSyncing(false);
    }
  };

  const clearAllData = () => {
    Alert.alert(
      'Reset All Data',
      'This will permanently delete all diary entries, movies, passwords, banking details, cards, to-dos, expenses, income, investments, debts, autopays and vault items. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove(
                SYNCED_COLLECTIONS.flatMap(({ storageKey }) => [
                  storageKey,
                  `${storageKey}_pending`,
                  `${storageKey}_deleted`,
                ])
              );
              Alert.alert('Done', 'All data has been cleared.');
            } catch (error) {
              console.error('Failed to clear data', error);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="Settings" subtitle="Make DiaryByte yours" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.section,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.shadow,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Profile</Text>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Your name</Text>
          <View style={styles.nameRow}>
            <TextInput
              style={[
                styles.nameInput,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.borderNeutral,
                  color: theme.text,
                },
              ]}
              value={nameDraft}
              onChangeText={setNameDraft}
              onSubmitEditing={saveName}
              returnKeyType="done"
              maxLength={30}
            />
            <TouchableOpacity
              style={[styles.saveNameBtn, { backgroundColor: theme.primary }]}
              onPress={saveName}
            >
              <Ionicons name="checkmark" size={20} color={theme.onPrimary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Used in your dashboard greeting.
          </Text>
        </View>

        <View
          style={[
            styles.section,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.shadow,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Appearance</Text>
          <View style={styles.settingRow}>
            <Ionicons name="time-outline" size={22} color={theme.secondary} />
            <Text style={[styles.settingLabel, { color: theme.text }]}>
              Auto Dark Mode (6 PM – 6 AM)
            </Text>
            <Switch
              value={themeMode === 'auto'}
              onValueChange={(on) => updateThemeMode(on ? 'auto' : isDark ? 'dark' : 'light')}
              trackColor={{ false: theme.surfaceAlt, true: '#34C759' }}
              ios_backgroundColor={theme.surfaceAlt}
              activeThumbColor="#FFFFFF"
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={styles.settingRow}>
            <Ionicons name="moon-outline" size={22} color={theme.secondary} />
            <Text style={[styles.settingLabel, { color: theme.text }]}>Dark Mode</Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: theme.surfaceAlt, true: '#34C759' }}
              ios_backgroundColor={theme.surfaceAlt}
              activeThumbColor="#FFFFFF"
              thumbColor="#FFFFFF"
            />
          </View>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            {themeMode === 'auto'
              ? 'Switches automatically by time of day. Changing Dark Mode turns Auto off.'
              : 'Using your chosen theme. Turn Auto on to follow the time of day.'}
          </Text>
        </View>

        <AppUpdatesSection
          sectionStyle={[
            styles.section,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.shadow,
            },
          ]}
          titleStyle={[styles.sectionTitle, { color: theme.text }]}
          hintStyle={styles.hint}
        />

        <View
          style={[
            styles.section,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.shadow,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Data</Text>
          <View style={styles.settingRow}>
            <Ionicons name="server-outline" size={22} color={theme.accent} />
            <Text style={[styles.settingLabel, { color: theme.text }]}>
              Data lives on this device and pushes to your server in real time
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.syncBtn, { backgroundColor: theme.primary }]}
            onPress={syncFromServer}
            disabled={syncing}
            activeOpacity={0.8}
          >
            {syncing ? (
              <ActivityIndicator size="small" color={theme.text} />
            ) : (
              <Ionicons name="cloud-download-outline" size={20} color={theme.onPrimary} />
            )}
            <Text style={[styles.syncBtnText, { color: theme.onPrimary }]}>
              {syncing ? 'Syncing...' : 'Sync from Server'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Pulls the latest data for every section. Changes not yet synced are kept and merged.
          </Text>
          <TouchableOpacity style={styles.dangerRow} onPress={clearAllData} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={22} color={theme.danger} />
            <Text style={[styles.dangerText, { color: theme.danger }]}>Reset All Data</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.version, { color: theme.textMuted }]}>DiaryByte v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  section: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
  },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  nameRow: { flexDirection: 'row', gap: 10 },
  nameInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 13,
    fontSize: 16,
  },
  saveNameBtn: {
    width: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: { fontSize: 12, marginTop: 8 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  settingLabel: { flex: 1, fontSize: 15 },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  syncBtnText: { fontSize: 15, fontWeight: '600' },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  dangerText: { fontSize: 15, fontWeight: '600' },
  version: { textAlign: 'center', marginTop: 10, fontSize: 12 },
});
