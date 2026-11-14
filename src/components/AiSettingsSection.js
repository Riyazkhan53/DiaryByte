import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { getAiPrefs, setAiPref } from '../utils/aiPrefs';

/** Settings → AI: whether ticket screenshots are read with AI automatically. */
export function AiSettingsSection({ sectionStyle, titleStyle, hintStyle }) {
  const { theme } = useTheme();
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    getAiPrefs().then((p) => setAuto(!!p.autoScreenshots));
  }, []);

  const toggle = (on) => {
    setAuto(on);
    setAiPref('autoScreenshots', on).catch(() => setAuto(!on));
  };

  return (
    <View style={sectionStyle}>
      <Text style={titleStyle}>AI</Text>
      <View style={styles.row}>
        <Ionicons name="image-outline" size={22} color="#7C3AED" />
        <Text style={[styles.label, { color: theme.text }]}>Read screenshots with AI automatically</Text>
        <Switch
          value={auto}
          onValueChange={toggle}
          trackColor={{ false: theme.surfaceAlt, true: '#34C759' }}
          ios_backgroundColor={theme.surfaceAlt}
          activeThumbColor="#FFFFFF"
          thumbColor="#FFFFFF"
          accessibilityLabel="Read screenshots with AI automatically"
        />
      </View>
      <Text style={[hintStyle, { color: theme.textMuted }]}>
        {auto
          ? 'On: a ticket screenshot you share or pick is read with AI straight away.'
          : 'Off: a ticket screenshot you share or pick is just attached. Tap “Fill details with AI” on the ticket when you want it read.'}{' '}
        Shared booking messages (text) are read by Smart fill first, and by AI only for layouts it hasn’t learned yet.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  label: { flex: 1, fontSize: 15 },
});
