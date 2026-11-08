import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { askAi, fetchAiStatus } from '../../services/api';
import { confirmDelete } from '../../utils/confirm';
import Markdown from './Markdown';

const KEEP = 40; // messages remembered on this device
const SEND_HISTORY = 12; // earlier messages sent with a question

// What each tool means, for the "checked …" line under an answer.
const TOOL_LABEL = {
  evaluate_intraday: 'signal engine',
  daily_trend: 'daily chart',
  find_stock: 'stock search',
  my_trading: 'your trades',
  todays_signals: "today's signals",
  get_portfolio: 'your portfolio',
  fund_performance: 'fund returns',
  stock_trend: 'stock trend',
  stock_quotes: 'live prices',
  my_finances: 'income & debts',
};

const makeId = () => `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * A chat with one of the AI assistants. `kind`: 'stock' | 'invest'. The
 * conversation is kept on this device only; each question goes to the
 * server, which runs the agent with its tools and returns the answer.
 */
export default function AiChat({ kind, title, tagline, icon, gradient, suggestions, header, thinkingText }) {
  const { theme } = useTheme();
  const storageKey = `@diarybyte_ai_${kind}`;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { configured } | { offline: true }
  const scrollRef = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (raw) setMessages(JSON.parse(raw));
      })
      .catch(() => {});
    fetchAiStatus()
      .then(setStatus)
      .catch((e) => setStatus(e?.status === 404 ? { outdated: true } : { offline: true }));
  }, [storageKey]);

  const save = (list) => {
    const kept = list.slice(-KEEP);
    setMessages(kept);
    AsyncStorage.setItem(storageKey, JSON.stringify(kept)).catch(() => {});
  };

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    const history = messages
      .filter((m) => !m.error)
      .slice(-SEND_HISTORY)
      .map((m) => ({ role: m.role, content: m.content }));
    const withQuestion = [...messages, { id: makeId(), role: 'user', content: question, at: new Date().toISOString() }];
    save(withQuestion);
    setInput('');
    setBusy(true);
    try {
      const res = await askAi(kind, question, history);
      save([...withQuestion, { id: makeId(), role: 'assistant', content: res.reply, tools: res.tools, at: new Date().toISOString() }]);
    } catch (error) {
      const text =
        error?.status === 404
          ? 'Your server needs a redeploy to use the AI.'
          : error?.serverMessage || "Couldn't reach the AI. Check your connection and try again.";
      save([...withQuestion, { id: makeId(), role: 'assistant', content: text, error: true, at: new Date().toISOString() }]);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => confirmDelete('Clear chat', `Clear your ${title} conversation on this device?`, () => save([]));

  const ready = status?.configured;
  const notice = !status
    ? null
    : status.outdated
      ? 'Your server needs a redeploy to use the AI.'
      : status.offline
        ? "Server not reachable right now — it may be waking up. Questions will work once it's back."
        : !status.configured
          ? 'One-time setup: create an API key at console.anthropic.com (API Keys) and add it in Render → your server → Environment as ANTHROPIC_API_KEY, then redeploy.'
          : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {header}
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name={icon} size={24} color="#FFF" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.heroTitle}>{title}</Text>
            <Text style={styles.heroSub}>{tagline}</Text>
          </View>
          {messages.length ? (
            <TouchableOpacity onPress={clear} style={styles.heroBtn} accessibilityLabel="Clear chat">
              <Ionicons name="trash-outline" size={18} color="#FFF" />
            </TouchableOpacity>
          ) : null}
        </LinearGradient>

        {notice ? (
          <View style={[styles.notice, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="information-circle-outline" size={18} color="#F59E0B" />
            <Text style={[styles.noticeText, { color: theme.text }]}>{notice}</Text>
          </View>
        ) : null}

        {!messages.length ? (
          <View style={styles.suggestions}>
            <Text style={[styles.suggestTitle, { color: theme.textSecondary }]}>Try asking</Text>
            {suggestions.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.suggestion, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => send(s)}
                disabled={busy || ready === false}
              >
                <Ionicons name="sparkles-outline" size={15} color={gradient[1]} />
                <Text style={[styles.suggestionText, { color: theme.text }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {messages.map((m) =>
          m.role === 'user' ? (
            <View key={m.id} style={[styles.bubble, styles.userBubble, { backgroundColor: gradient[1] }]}>
              <Text style={styles.userText}>{m.content}</Text>
            </View>
          ) : (
            <View
              key={m.id}
              style={[
                styles.bubble,
                styles.aiBubble,
                { backgroundColor: theme.surface, borderColor: m.error ? '#E5383B66' : theme.border },
              ]}
            >
              {m.error ? (
                <Text style={[styles.errorText, { color: '#E5383B' }]}>{m.content}</Text>
              ) : (
                <Markdown text={m.content} color={theme.text} accent={gradient[1]} />
              )}
              {m.tools?.length ? (
                <Text style={[styles.tools, { color: theme.textMuted }]}>
                  Checked: {[...new Set(m.tools.map((t) => TOOL_LABEL[t] || t))].join(', ')}
                </Text>
              ) : null}
            </View>
          )
        )}
        {busy ? (
          <View style={[styles.bubble, styles.aiBubble, styles.thinking, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ActivityIndicator size="small" color={gradient[1]} />
            <Text style={[styles.tools, { color: theme.textSecondary }]}>{thinkingText}</Text>
          </View>
        ) : null}
        <Text style={[styles.disclaimer, { color: theme.textMuted }]}>
          AI suggestions can be wrong. They use your data and live prices, but aren&apos;t financial advice — decide for yourself.
        </Text>
      </ScrollView>

      <View style={[styles.inputBar, { backgroundColor: theme.sheet, borderTopColor: theme.border }]}>
        <TextInput
          style={[styles.input, { backgroundColor: theme.surfaceAlt, color: theme.text, borderColor: theme.borderNeutral }]}
          placeholder={`Ask ${title}…`}
          placeholderTextColor={theme.textMuted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={2000}
          onSubmitEditing={() => send()}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.send, { backgroundColor: gradient[1] }, (!input.trim() || busy) && styles.disabled]}
          onPress={() => send()}
          disabled={!input.trim() || busy}
          accessibilityLabel="Send"
        >
          <Ionicons name="arrow-up" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 24 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 16, marginBottom: 12 },
  heroIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF33', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#FFF', fontSize: 19, fontWeight: '800' },
  heroSub: { color: '#FFFFFFD9', fontSize: 12, marginTop: 2, lineHeight: 17 },
  heroBtn: { padding: 8 },
  notice: { flexDirection: 'row', gap: 8, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
  suggestions: { gap: 8, marginBottom: 8 },
  suggestTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, padding: 12 },
  suggestionText: { flex: 1, fontSize: 14 },
  bubble: { borderRadius: 18, padding: 12, marginBottom: 10, maxWidth: '92%' },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  userText: { color: '#FFF', fontSize: 15, lineHeight: 21 },
  aiBubble: { alignSelf: 'flex-start', borderWidth: 1, borderBottomLeftRadius: 6 },
  errorText: { fontSize: 14, lineHeight: 20 },
  tools: { fontSize: 11, marginTop: 6 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disclaimer: { fontSize: 11, textAlign: 'center', marginTop: 6, lineHeight: 16 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1 },
  input: { flex: 1, maxHeight: 120, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
});
