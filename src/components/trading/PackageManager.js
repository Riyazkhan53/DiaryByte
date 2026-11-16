import { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { searchStocks } from '../../services/stocks';
import { confirmDelete } from '../../utils/confirm';
import { marketConfig, shortSymbol, withMarketChanges } from '../../utils/engineMarket';
import {
  MAX_WATCHLIST,
  activePackageOf,
  deletePackageChanges,
  packagesFor,
  pickPackageChanges,
  resetPresetChanges,
  upsertPackageChanges,
} from '../../utils/watchlistPackages';

/**
 * Watchlist packages for one market (India or US): pick the default (the
 * package the server scans), edit a package's stocks (search and add, ×
 * remove), make your own, reset an edited preset. `suggest` is a stock to
 * offer for adding (the one open in the Setup tab).
 */
export default function PackageManager({ visible, market = 'NSE', configDocs, persistConfig, onClose, suggest }) {
  const { theme } = useTheme();
  const { doc, watchlist } = marketConfig(configDocs, market);
  const pkgs = packagesFor(market, doc);
  const active = activePackageOf(market, doc, watchlist);
  const us = market === 'US';
  // null = list; { id?, name, symbols, preset?, edited?, own? } = editing
  const [edit, setEdit] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState(null);

  const save = (changes) => changes && persistConfig(withMarketChanges(configDocs, market, changes));
  const close = () => {
    setEdit(null);
    setResults([]);
    setQuery('');
    setNote(null);
    onClose();
  };
  const openEdit = (p) => {
    setEdit({ ...p, symbols: [...p.symbols] });
    setResults([]);
    setQuery('');
    setNote(null);
  };
  const add = (sym) => {
    if (edit.symbols.includes(sym)) return;
    if (edit.symbols.length >= MAX_WATCHLIST) {
      setNote(`A package holds up to ${MAX_WATCHLIST} stocks (the scanner's limit). Remove one first.`);
      return;
    }
    setNote(null);
    setEdit((e) => ({ ...e, symbols: [...e.symbols, sym] }));
  };
  const remove = (sym) => setEdit((e) => ({ ...e, symbols: e.symbols.filter((s) => s !== sym) }));
  const runSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const found = await searchStocks(query, us ? 'US' : 'IN');
      setResults(found);
      setNote(found.length ? null : 'No match. Try the company name or ticker.');
    } catch {
      setNote("Search needs your server, which isn't reachable right now.");
    } finally {
      setSearching(false);
    }
  };
  const saveEdit = (makeDefault) => {
    if (!edit.name.trim()) return setNote('Give the package a name.');
    if (!edit.symbols.length) return setNote('Add at least one stock.');
    const changes = upsertPackageChanges(doc, edit);
    const id = changes.packages[changes.packages.length - 1].id;
    save(makeDefault ? { ...changes, watchlist: edit.symbols.slice(0, MAX_WATCHLIST), activePackage: id } : changes);
    setEdit(null);
    return undefined;
  };

  const sheet = theme.background === '#000000' ? '#1C1C1E' : theme.sheet || '#FFFFFF';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: sheet }]}>
          <View style={styles.head}>
            {edit ? (
              <TouchableOpacity onPress={() => setEdit(null)} accessibilityLabel="Back to packages" style={styles.headBtn}>
                <Ionicons name="chevron-back" size={22} color={theme.text} />
              </TouchableOpacity>
            ) : null}
            <Text style={[styles.title, { color: theme.text }]}>
              {edit ? (edit.id ? `${edit.emoji || '⭐'} ${edit.name}` : 'New package') : `${us ? '🇺🇸 US' : '🇮🇳 India'} packages`}
            </Text>
            <TouchableOpacity onPress={close} accessibilityLabel="Close" style={styles.headBtn}>
              <Ionicons name="close" size={24} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {!edit ? (
              <>
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  The default package is what the server scans every 5 minutes ({us ? 'US market hours, about 8 pm–2:30 am IST' : 'NSE market hours'}). Tap a package to change its
                  stocks.
                </Text>
                {pkgs.map((p) => {
                  const isDefault = active?.id === p.id;
                  return (
                    <View key={p.id} style={[styles.row, { borderColor: isDefault ? theme.primary : theme.borderNeutral, backgroundColor: theme.surface }]}>
                      <TouchableOpacity style={styles.rowMain} onPress={() => openEdit(p)} accessibilityLabel={`Edit package ${p.name}`}>
                        <Text style={styles.emoji}>{p.emoji}</Text>
                        <View style={styles.flex}>
                          <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                            {p.name}
                            {p.edited ? <Text style={{ color: theme.textMuted }}> · edited</Text> : null}
                          </Text>
                          <Text style={[styles.rowSub, { color: theme.textMuted }]} numberOfLines={1}>
                            {p.symbols.map(shortSymbol).join(', ')}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => !isDefault && save(pickPackageChanges(p))}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isDefault }}
                        accessibilityLabel={isDefault ? `${p.name} is the default` : `Make ${p.name} the default`}
                        style={[styles.defaultBtn, isDefault && { backgroundColor: theme.primary, borderColor: theme.primary }, !isDefault && { borderColor: theme.borderNeutral }]}
                      >
                        <Text style={[styles.defaultText, { color: isDefault ? theme.onPrimary : theme.textSecondary }]}>{isDefault ? '✓ Default' : 'Set default'}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
                {!active && watchlist.length ? (
                  <Text style={[styles.hint, { color: theme.textMuted }]}>Now scanning your own list: {watchlist.map(shortSymbol).join(', ')}.</Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.newBtn, { borderColor: theme.primary }]}
                  onPress={() => openEdit({ name: '', symbols: suggest && !watchlist.includes(suggest) ? [suggest] : [] })}
                  accessibilityLabel="New package"
                >
                  <Ionicons name="add" size={18} color={theme.primary} />
                  <Text style={[styles.newText, { color: theme.primary }]}>New package</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {edit.preset ? null : (
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                    placeholder="Package name (e.g. My breakout picks)"
                    placeholderTextColor={theme.textMuted}
                    value={edit.name}
                    onChangeText={(name) => setEdit((e) => ({ ...e, name }))}
                  />
                )}
                <Text style={[styles.label, { color: theme.textSecondary }]}>
                  Stocks · {edit.symbols.length}/{MAX_WATCHLIST}
                </Text>
                <View style={styles.chips}>
                  {edit.symbols.map((s) => (
                    <View key={s} style={[styles.chip, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral }]}>
                      <Text style={[styles.chipText, { color: theme.text }]}>{shortSymbol(s)}</Text>
                      <TouchableOpacity onPress={() => remove(s)} accessibilityLabel={`Remove ${shortSymbol(s)}`} hitSlop={8}>
                        <Ionicons name="close-circle" size={16} color={theme.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {!edit.symbols.length ? <Text style={[styles.hint, { color: theme.textMuted }]}>No stocks yet: search below.</Text> : null}
                </View>
                {suggest && !edit.symbols.includes(suggest) && (us ? !/\.(NS|BO)$/.test(suggest) : /\.(NS|BO)$/.test(suggest)) ? (
                  <TouchableOpacity style={[styles.suggest, { borderColor: theme.primary }]} onPress={() => add(suggest)}>
                    <Ionicons name="add-circle-outline" size={16} color={theme.primary} />
                    <Text style={[styles.newText, { color: theme.primary }]}>Add {shortSymbol(suggest)} (open in Setup)</Text>
                  </TouchableOpacity>
                ) : null}
                <View style={styles.searchRow}>
                  <TextInput
                    style={[styles.input, styles.flex, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                    placeholder={us ? 'Search a US stock (e.g. AAPL, nvidia)' : 'Search an Indian stock (e.g. DLF, infosys)'}
                    placeholderTextColor={theme.textMuted}
                    value={query}
                    onChangeText={setQuery}
                    onSubmitEditing={runSearch}
                    returnKeyType="search"
                  />
                  <TouchableOpacity
                    style={[styles.searchBtn, { backgroundColor: theme.primary }, query.trim().length < 2 && styles.dim]}
                    onPress={runSearch}
                    disabled={query.trim().length < 2 || searching}
                    accessibilityLabel="Search stocks"
                  >
                    {searching ? <ActivityIndicator size="small" color={theme.onPrimary} /> : <Ionicons name="search" size={20} color={theme.onPrimary} />}
                  </TouchableOpacity>
                </View>
                {results.map((r) => {
                  const inIt = edit.symbols.includes(r.symbol);
                  return (
                    <TouchableOpacity key={r.symbol} style={[styles.result, { borderColor: theme.borderNeutral }]} onPress={() => (inIt ? remove(r.symbol) : add(r.symbol))}>
                      <Ionicons name={inIt ? 'checkmark-circle' : 'add-circle-outline'} size={18} color={inIt ? '#2DA44E' : theme.primary} />
                      <Text style={[styles.flex, styles.resultText, { color: theme.text }]} numberOfLines={1}>
                        {r.name}
                        <Text style={{ color: theme.textMuted }}> · {shortSymbol(r.symbol)}</Text>
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {note ? <Text style={[styles.note, { color: theme.danger || '#E5383B' }]}>{note}</Text> : null}
                <View style={styles.actions}>
                  {edit.own ? (
                    <TouchableOpacity
                      onPress={() =>
                        confirmDelete('Delete package', `Delete "${edit.name}"?`, () => {
                          save(deletePackageChanges(doc, edit.id));
                          setEdit(null);
                        })
                      }
                      style={styles.iconAction}
                      accessibilityLabel="Delete package"
                    >
                      <Ionicons name="trash-outline" size={20} color={theme.danger || '#E5383B'} />
                    </TouchableOpacity>
                  ) : null}
                  {edit.edited ? (
                    <TouchableOpacity
                      onPress={() => {
                        save(resetPresetChanges(doc, edit.id));
                        setEdit(null);
                      }}
                      style={[styles.btn, { borderColor: theme.borderNeutral }]}
                    >
                      <Text style={[styles.btnText, { color: theme.textSecondary }]}>Reset</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity onPress={() => saveEdit(false)} style={[styles.btn, { borderColor: theme.primary }]} accessibilityLabel="Save package">
                    <Text style={[styles.btnText, { color: theme.primary }]}>Save</Text>
                  </TouchableOpacity>
                  {active?.id !== edit.id || !edit.id ? (
                    <TouchableOpacity onPress={() => saveEdit(true)} style={[styles.btn, { backgroundColor: theme.primary, borderColor: theme.primary }]} accessibilityLabel="Save and make default">
                      <Text style={[styles.btnText, { color: theme.onPrimary }]}>Save as default</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginBottom: 6 },
  headBtn: { padding: 4 },
  title: { flex: 1, fontSize: 19, fontWeight: '800' },
  body: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  hint: { fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingRight: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  emoji: { fontSize: 22 },
  flex: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 2 },
  defaultBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  defaultText: { fontSize: 12, fontWeight: '800' },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 11, marginTop: 4 },
  newText: { fontSize: 14, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingLeft: 10, paddingRight: 6, paddingVertical: 5 },
  chipText: { fontSize: 13, fontWeight: '700' },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, alignSelf: 'flex-start' },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  searchBtn: { width: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.4 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  resultText: { fontSize: 14 },
  note: { fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  iconAction: { padding: 8, marginRight: 'auto' },
  btn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  btnText: { fontSize: 14, fontWeight: '700' },
});
