import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchAuthStatus, loginAccount, registerAccount } from '../services/api';
import { getSession, sessionReady, signInGuest, signInUser } from '../services/session';
import { BRAND_ICON } from './brand';

/**
 * Shows the sign-in page until someone is signed in (as the owner or as a
 * guest), then the app. Signing in or out restarts the app, so the session
 * here is fixed for as long as this is mounted.
 */
export default function AuthGate({ children }) {
  const [state, setState] = useState({ loaded: false, session: null });
  useEffect(() => {
    sessionReady.then(() => setState({ loaded: true, session: getSession() }));
  }, []);
  if (!state.loaded) return <View style={styles.blank} />;
  if (state.session) return children;
  return <AuthScreen />;
}

function AuthScreen() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [registered, setRegistered] = useState(null); // null = not known yet
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(null); // 'user' | 'guest'
  const [error, setError] = useState(null);

  // Is there an account yet? (The server may take a while to wake up.)
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      fetchAuthStatus()
        .then((s) => !cancelled && setRegistered(!!s.registered))
        .catch(() => !cancelled && setTimeout(check, 4000));
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const switchMode = (next) => {
    setMode(next);
    setError(null);
    setPassword('');
    setAgain('');
  };

  const submit = async () => {
    if (busy) return;
    const name = username.trim();
    if (!name || !password) return setError('Enter your username and password.');
    if (mode === 'register') {
      if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(name)) return setError('Username: 3–30 letters, numbers, dot, dash or underscore.');
      if (password.length < 8) return setError('Password must be at least 8 characters.');
      if (password !== again) return setError("The two passwords don't match.");
    }
    setBusy('user');
    setError(null);
    try {
      const res = mode === 'register' ? await registerAccount(name, password) : await loginAccount(name, password);
      await signInUser(res.username, res.token); // restarts the app
    } catch (e) {
      setError(
        e?.serverMessage ||
          (e?.status === 404
            ? 'The server needs an update before sign-in works (redeploy it).'
            : "Couldn't reach the server. It may be waking up — try again in a moment.")
      );
      setBusy(null);
    }
  };

  const guest = async () => {
    if (busy) return;
    setBusy('guest');
    await signInGuest(); // restarts the app
  };

  const closed = mode === 'register' && registered === true;

  return (
    <LinearGradient colors={['#0B1220', '#0E192D', '#1B1440']} style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Image source={BRAND_ICON} style={styles.logo} />
          <Text style={styles.brand}>DiaryByte</Text>
          <Text style={styles.tagline}>Your personal space</Text>

          <View style={styles.card}>
            <Text style={styles.title}>{mode === 'register' ? 'Create account' : 'Sign in'}</Text>

            {closed ? (
              <View style={styles.notice}>
                <Ionicons name="lock-closed-outline" size={18} color="#F59E0B" />
                <Text style={styles.noticeText}>
                  Registration is currently unavailable. You can still look around as a guest.
                </Text>
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Username"
                  placeholderTextColor="#8B93A7"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={username}
                  onChangeText={setUsername}
                  accessibilityLabel="Username"
                />
                <View style={styles.passRow}>
                  <TextInput
                    style={[styles.input, styles.flex, styles.noMargin]}
                    placeholder="Password"
                    placeholderTextColor="#8B93A7"
                    secureTextEntry={!show}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={mode === 'login' ? submit : undefined}
                    accessibilityLabel="Password"
                  />
                  <TouchableOpacity onPress={() => setShow((v) => !v)} style={styles.eye} accessibilityLabel={show ? 'Hide password' : 'Show password'}>
                    <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color="#B7BED0" />
                  </TouchableOpacity>
                </View>
                {mode === 'register' ? (
                  <TextInput
                    style={styles.input}
                    placeholder="Password again"
                    placeholderTextColor="#8B93A7"
                    secureTextEntry={!show}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={again}
                    onChangeText={setAgain}
                    onSubmitEditing={submit}
                    accessibilityLabel="Password again"
                  />
                ) : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <TouchableOpacity style={[styles.primary, busy && styles.dim]} onPress={submit} disabled={!!busy} accessibilityLabel={mode === 'register' ? 'Create account' : 'Sign in'}>
                  {busy === 'user' ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>{mode === 'register' ? 'Create account' : 'Sign in'}</Text>}
                </TouchableOpacity>
                {mode === 'register' ? (
                  <Text style={styles.hint}>
                    There&apos;s no password reset, so keep it somewhere safe. You stay signed in on this device until you sign out.
                  </Text>
                ) : null}
              </>
            )}

            <TouchableOpacity onPress={() => switchMode(mode === 'register' ? 'login' : 'register')} style={styles.switch} accessibilityLabel={mode === 'register' ? 'Go to sign in' : 'Go to create account'}>
              <Text style={styles.switchText}>
                {mode === 'register' ? 'Already have an account? ' : 'New here? '}
                <Text style={styles.switchLink}>{mode === 'register' ? 'Sign in' : 'Create account'}</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.orRow}>
            <View style={styles.line} />
            <Text style={styles.or}>or</Text>
            <View style={styles.line} />
          </View>

          <TouchableOpacity style={[styles.guest, busy && styles.dim]} onPress={guest} disabled={!!busy} accessibilityLabel="Continue as guest">
            {busy === 'guest' ? <ActivityIndicator color="#FFF" /> : <Ionicons name="eye-outline" size={18} color="#FFF" />}
            <Text style={styles.guestText}>Continue as guest</Text>
          </TouchableOpacity>
          <Text style={styles.guestHint}>
            Explore every section with your own sample entries. Guest data stays in this browser or phone only — nothing is
            loaded from or saved to the server.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: '#0E192D' },
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, maxWidth: 460, width: '100%', alignSelf: 'center' },
  logo: { width: 84, height: 84, borderRadius: 22, alignSelf: 'center' },
  brand: { color: '#FFF', fontSize: 30, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  tagline: { color: '#B7BED0', fontSize: 14, textAlign: 'center', marginBottom: 22 },
  card: { backgroundColor: '#FFFFFF12', borderColor: '#FFFFFF24', borderWidth: 1, borderRadius: 22, padding: 18 },
  title: { color: '#FFF', fontSize: 20, fontWeight: '700', marginBottom: 14 },
  input: { backgroundColor: '#FFFFFF14', borderColor: '#FFFFFF2E', borderWidth: 1, borderRadius: 12, color: '#FFF', fontSize: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 },
  noMargin: { marginBottom: 0 },
  passRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  eye: { padding: 10 },
  error: { color: '#FF8A8A', fontSize: 13, marginBottom: 8 },
  primary: { backgroundColor: '#5E5CE6', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  dim: { opacity: 0.6 },
  hint: { color: '#B7BED0', fontSize: 12, lineHeight: 17, marginTop: 10 },
  notice: { flexDirection: 'row', gap: 8, backgroundColor: '#F59E0B1F', borderRadius: 12, padding: 12 },
  noticeText: { flex: 1, color: '#FFE2B0', fontSize: 14, lineHeight: 20 },
  switch: { marginTop: 14, alignItems: 'center' },
  switchText: { color: '#B7BED0', fontSize: 14 },
  switchLink: { color: '#9EA0FF', fontWeight: '700' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18 },
  line: { flex: 1, height: 1, backgroundColor: '#FFFFFF26' },
  or: { color: '#8B93A7', fontSize: 13 },
  guest: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderColor: '#FFFFFF40', borderWidth: 1, borderRadius: 12, paddingVertical: 13 },
  guestText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  guestHint: { color: '#8B93A7', fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 10 },
});
