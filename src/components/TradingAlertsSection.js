import { useEffect } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useSyncedCollection } from '../hooks/useSyncedCollection';
import { marketConfig, withMarketChanges } from '../utils/engineMarket';

/**
 * Settings → Trading alerts: turn the BUY / SELL phone alerts (sent by the
 * server through ntfy) on or off. The same switches live in My Trading →
 * Signals → Phone alerts.
 */
export function TradingAlertsSection({ sectionStyle, titleStyle, hintStyle }) {
  const { theme } = useTheme();
  const { items: configDocs, persist, loaded, pullNow } = useSyncedCollection('tradingconfig', '@diarybyte_tradingconfig');
  // First time on this device: fetch the settings saved from another one.
  useEffect(() => {
    if (loaded && !configDocs.length) pullNow();
  }, [loaded, configDocs.length, pullNow]);
  const { doc } = marketConfig(configDocs, 'NSE');
  const topic = doc?.alertTopic || null;
  const on = !!topic && doc?.alertsOn !== false;
  const save = (changes) => persist(withMarketChanges(configDocs, 'NSE', changes));
  const openSetup = () => router.push('/trading');

  return (
    <View style={sectionStyle}>
      <Text style={titleStyle}>Trading alerts</Text>
      {topic ? (
        <>
          <View style={styles.row}>
            <Ionicons name={on ? 'notifications' : 'notifications-off-outline'} size={20} color={on ? '#2DA44E' : theme.textMuted} />
            <View style={styles.flex}>
              <Text style={[styles.label, { color: theme.text }]}>BUY / SELL notifications</Text>
              <Text style={[styles.sub, { color: theme.textMuted }]}>{on ? 'On: entry signals only, never WAIT' : 'Off: no trading notifications'}</Text>
            </View>
            <Switch value={on} onValueChange={(v) => save({ alertsOn: v, ...(v ? { alertEntries: true } : {}) })} accessibilityLabel="Trading notifications" />
          </View>
          <Text style={[hintStyle, { color: theme.textMuted }]}>
            Sent by your server through the ntfy app, so they arrive even when DiaryByte is closed. More options in My Trading → Signals → Phone alerts.
          </Text>
        </>
      ) : (
        <>
          <Text style={[hintStyle, { color: theme.textMuted }]}>
            Get a phone notification when a stock on your watchlist shows a BUY or SELL entry. Set it up once in My Trading.
          </Text>
          <TouchableOpacity style={[styles.btn, { borderColor: theme.primary }]} onPress={openSetup} accessibilityLabel="Set up trading alerts">
            <Ionicons name="pulse-outline" size={16} color={theme.primary} />
            <Text style={[styles.btnText, { color: theme.primary }]}>Set up in My Trading</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  flex: { flex: 1 },
  label: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12, marginTop: 2 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 10, marginTop: 8 },
  btnText: { fontSize: 14, fontWeight: '700' },
});
