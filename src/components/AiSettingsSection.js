import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { getAiPrefs, setAiPref } from '../utils/aiPrefs';
import { lastShare } from '../utils/shareLog';

/** Settings → AI: whether ticket screenshots are read with AI automatically. */
export function AiSettingsSection({ sectionStyle, titleStyle, hintStyle }) {
  const { theme } = useTheme();
  const [auto, setAuto] = useState(false);
  const [share, setShare] = useState(null);

  useEffect(() => {
    getAiPrefs().then((p) => setAuto(!!p.autoScreenshots));
    lastShare().then(setShare);
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
      {share ? (
        <View style={[styles.share, { borderColor: theme.borderNeutral }]}>
          <Text style={[styles.shareTitle, { color: theme.textSecondary }]}>
            Last share received · {new Date(share.at).toLocaleString()}
          </Text>
          {share.error ? (
            <Text style={[hintStyle, { color: '#E5383B' }]} selectable>
              Couldn’t read it: {share.error}
            </Text>
          ) : (
            <Text style={[hintStyle, { color: theme.textMuted }]} selectable numberOfLines={4}>
              {share.app ? `${share.app} → ` : ''}
              {share.target === '/movies' ? 'Movies (Add to Watchlist)' : share.target === '/tickets' ? 'Tickets' : share.target || '?'}
              {share.files ? ` · files: ${share.files}` : ''}
              {share.text ? `\n“${share.text}”` : ''}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  label: { flex: 1, fontSize: 15 },
  share: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 8, gap: 2 },
  shareTitle: { fontSize: 12, fontWeight: '700' },
});
