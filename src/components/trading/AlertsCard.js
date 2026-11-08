import { useState } from 'react';
import { Linking, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { sendTestAlert } from '../../services/api';

const NTFY_APP = 'https://play.google.com/store/apps/details?id=io.heckel.ntfy';

/**
 * Phone alerts from the scanner through the free ntfy app: entry signals,
 * closed paper trades and a morning watchlist summary. Works with the app
 * closed, since the server sends them.
 */
export default function AlertsCard({ configDoc, saveConfig }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [test, setTest] = useState(null); // { busy } | { ok, text }
  const [copied, setCopied] = useState(false);
  const topic = configDoc?.alertTopic || null;
  const on = !!topic && configDoc?.alertsOn !== false;

  const setUp = () => {
    // Long and random: anyone who knows a topic can read it.
    const id = Crypto.randomUUID().replace(/-/g, '');
    saveConfig({ alertTopic: `diarybyte-${id}`, alertsOn: true });
    setOpen(true);
  };

  const subscribe = async () => {
    // The ntfy app opens ntfy:// links straight to "subscribe"; without the
    // app installed, fall back to the topic's web page.
    try {
      await Linking.openURL(`ntfy://ntfy.sh/${topic}`);
    } catch (_error) {
      Linking.openURL(`https://ntfy.sh/${topic}`);
    }
  };

  const copy = async () => {
    await Clipboard.setStringAsync(topic);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sendTest = async () => {
    setTest({ busy: true });
    try {
      await sendTestAlert(topic);
      setTest({ ok: true, text: 'Test sent — it should pop up on your phone in a few seconds.' });
    } catch (error) {
      setTest({ ok: false, text: error?.status === 404 ? 'Your server needs a redeploy for alerts.' : error?.serverMessage || "Couldn't send the test." });
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
      <TouchableOpacity style={styles.head} onPress={() => setOpen((v) => !v)} accessibilityLabel={`Phone alerts: ${open ? 'hide' : 'show'} details`}>
        <Ionicons name={on ? 'notifications' : 'notifications-outline'} size={18} color={on ? '#2DA44E' : theme.textMuted} />
        <View style={styles.flex}>
          <Text style={[styles.title, { color: theme.text }]}>Phone alerts</Text>
          <Text style={[styles.summary, { color: theme.textMuted }]} numberOfLines={1}>
            {on ? 'Entries, closed trades and a morning summary' : topic ? 'Paused' : 'Get signals even with the app closed'}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: (on ? '#2DA44E' : '#8E8E93') + '22' }]}>
          <Text style={[styles.pillText, { color: on ? '#2DA44E' : '#8E8E93' }]}>{on ? 'On' : topic ? 'Off' : 'Set up'}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textMuted} />
      </TouchableOpacity>

      {open ? (
        <View style={styles.body}>
          {!topic ? (
            <>
              <Text style={[styles.text, { color: theme.text }]}>
                Your server scans the watchlist every 5 minutes. Alerts come through the free{' '}
                <Text style={styles.bold}>ntfy</Text> app (no account), so they reach you even when DiaryByte is closed.
              </Text>
              <Text style={[styles.step, { color: theme.textSecondary }]}>1. Install ntfy from the Play Store.</Text>
              <TouchableOpacity style={[styles.btn, { borderColor: theme.primary }]} onPress={() => Linking.openURL(NTFY_APP)}>
                <Ionicons name="logo-google-playstore" size={16} color={theme.primary} />
                <Text style={[styles.btnText, { color: theme.primary }]}>Get ntfy</Text>
              </TouchableOpacity>
              <Text style={[styles.step, { color: theme.textSecondary }]}>2. Create your private alert channel.</Text>
              <TouchableOpacity style={[styles.btn, styles.primary, { backgroundColor: theme.primary }]} onPress={setUp} accessibilityLabel="Set up phone alerts">
                <Ionicons name="add-circle-outline" size={16} color={theme.onPrimary} />
                <Text style={[styles.btnText, { color: theme.onPrimary }]}>Set up alerts</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {[
                { key: 'alertsOn', label: 'Alerts on', value: on },
                { key: 'alertEntries', label: 'Entry signals (LONG / SHORT)', value: configDoc?.alertEntries !== false },
                { key: 'alertExits', label: 'Paper & demo trades closing', value: configDoc?.alertExits !== false },
                { key: 'alertSummary', label: 'Morning watchlist summary (09:20)', value: configDoc?.alertSummary !== false },
              ].map((s) => (
                <View key={s.key} style={styles.switchRow}>
                  <Text style={[styles.flex, styles.text, { color: s.key !== 'alertsOn' && !on ? theme.textMuted : theme.text }]}>{s.label}</Text>
                  <Switch value={s.value} disabled={s.key !== 'alertsOn' && !on} onValueChange={(v) => saveConfig({ [s.key]: v })} />
                </View>
              ))}
              <Text style={[styles.step, { color: theme.textSecondary }]}>Your channel (subscribe to it in ntfy):</Text>
              <TouchableOpacity style={[styles.topic, { backgroundColor: theme.surfaceAlt }]} onPress={copy} accessibilityLabel="Copy alert channel">
                <Text style={[styles.topicText, { color: theme.text }]} numberOfLines={1} selectable>
                  {topic}
                </Text>
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={theme.primary} />
              </TouchableOpacity>
              <View style={styles.row}>
                <TouchableOpacity style={[styles.btn, styles.half, { borderColor: theme.primary }]} onPress={subscribe} accessibilityLabel="Subscribe in ntfy">
                  <Ionicons name="open-outline" size={16} color={theme.primary} />
                  <Text style={[styles.btnText, { color: theme.primary }]}>Subscribe in ntfy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.half, { borderColor: theme.primary }]}
                  onPress={sendTest}
                  disabled={test?.busy}
                  accessibilityLabel="Send test alert"
                >
                  <Ionicons name="paper-plane-outline" size={16} color={theme.primary} />
                  <Text style={[styles.btnText, { color: theme.primary }]}>{test?.busy ? 'Sending…' : 'Send test'}</Text>
                </TouchableOpacity>
              </View>
              {test?.text ? <Text style={[styles.text, { color: test.ok ? '#2DA44E' : '#E5383B' }]}>{test.text}</Text> : null}
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                In ntfy tap + and add this channel (or use the button). Keep it private: anyone with the name could read your
                alerts. Alerts only go out while your server is awake.
              </Text>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  summary: { fontSize: 12, marginTop: 1 },
  pill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: '800' },
  body: { marginTop: 10, gap: 8 },
  text: { fontSize: 13, lineHeight: 19 },
  bold: { fontWeight: '700' },
  step: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 9 },
  primary: { borderWidth: 0 },
  btnText: { fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topic: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 10 },
  topicText: { flex: 1, fontSize: 12, fontWeight: '600' },
  hint: { fontSize: 11, lineHeight: 16 },
});
