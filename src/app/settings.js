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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Header from '../components/Header';
import { useTheme } from '../hooks/useTheme';

export default function SettingsScreen() {
  const { theme, isDark, toggleTheme, userName, updateUserName } = useTheme();
  const [nameDraft, setNameDraft] = useState(userName);

  const saveName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed) updateUserName(trimmed);
  };

  const clearAllData = () => {
    Alert.alert(
      'Reset All Data',
      'This will permanently delete all diary entries, movies, passwords, banking details and vault items. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove([
                '@diarybyte_entries',
                '@diarybyte_movies',
                '@diarybyte_passwords',
                '@diarybyte_banking',
                '@diarybyte_vault',
              ]);
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
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
              <Ionicons name="checkmark" size={20} color={theme.text} />
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
            <Ionicons name="moon-outline" size={22} color={theme.secondary} />
            <Text style={[styles.settingLabel, { color: theme.text }]}>Dark Mode</Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#D1C4E9', true: theme.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
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
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Data</Text>
          <View style={styles.settingRow}>
            <Ionicons name="server-outline" size={22} color={theme.accent} />
            <Text style={[styles.settingLabel, { color: theme.text }]}>
              All data is stored locally on this device
            </Text>
          </View>
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
