import { useState } from 'react';
import {
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import Header from '../../components/Header';
import SyncRow from '../../components/SyncRow';
import DatePicker from '../../components/DatePicker';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';
import { confirmDelete } from '../../utils/confirm';
import { formatDate, todayKey } from '../../utils/autopay';
import {
  BRANDS,
  BRAND_CATEGORIES,
  VOUCHERS_STORAGE_KEY,
  VOUCHER_KINDS,
  brandInitials,
  brandMeta,
  daysToExpiry,
  sortVouchers,
  usableTotal,
  voucherKind,
  voucherStatus,
} from '../../utils/vouchers';

const makeId = () => `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const toNum = (text) => parseFloat(String(text ?? '').replace(/[^\d.]/g, ''));

const FILTERS = [
  { key: 'usable', label: 'Usable' },
  { key: 'expiring', label: 'Expiring soon' },
  { key: 'used', label: 'Used' },
  { key: 'expired', label: 'Expired' },
  { key: 'all', label: 'All' },
];

const STATUS_COLOR = { active: '#2DA44E', expiring: '#F59E0B', expired: '#E5383B', used: '#8E8E93' };

function expiryLabel(v, today) {
  if (v.used) return v.usedAt ? `Used ${formatDate(v.usedAt.slice(0, 10))}` : 'Used';
  const days = daysToExpiry(v, today);
  if (days == null) return 'No expiry';
  if (days < 0) return `Expired ${formatDate(v.expiry)}`;
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  if (days <= 30) return `Expires in ${days} days`;
  return `Valid till ${formatDate(v.expiry)}`;
}

function BrandBadge({ name, size = 44 }) {
  const meta = brandMeta(name);
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 3.2, backgroundColor: meta.color }]}>
      <Text style={[styles.badgeText, { fontSize: size * 0.36 }]}>{brandInitials(meta.name)}</Text>
    </View>
  );
}

export default function VouchersScreen() {
  const { theme } = useTheme();
  const { items, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection('vouchers', VOUCHERS_STORAGE_KEY);
  const [filter, setFilter] = useState('usable');
  const [search, setSearch] = useState('');
  const [revealed, setRevealed] = useState({});
  const [copied, setCopied] = useState(null);

  // form
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [brand, setBrand] = useState('');
  const [brandQuery, setBrandQuery] = useState('');
  const [brandCat, setBrandCat] = useState('all');
  const [kind, setKind] = useState('giftcard');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [amount, setAmount] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [hasExpiry, setHasExpiry] = useState(true);
  const [expiry, setExpiry] = useState(null);
  const [note, setNote] = useState('');

  const today = todayKey();
  const sorted = sortVouchers(items, today);
  const q = search.trim().toLowerCase();
  const visible = sorted.filter((v) => {
    const status = voucherStatus(v, today);
    const okStatus =
      filter === 'all' ||
      (filter === 'usable' ? status === 'active' || status === 'expiring' : status === filter);
    const okSearch = !q || [v.brand, v.code, v.note].some((f) => String(f || '').toLowerCase().includes(q));
    return okStatus && okSearch;
  });
  const usableCount = items.filter((v) => ['active', 'expiring'].includes(voucherStatus(v, today))).length;
  const expiringCount = items.filter((v) => voucherStatus(v, today) === 'expiring').length;
  const total = usableTotal(items, today);

  const openAdd = () => {
    setEditingId(null);
    setBrand('');
    setBrandQuery('');
    setBrandCat('all');
    setKind('giftcard');
    setCode('');
    setPin('');
    setAmount('');
    setMinOrder('');
    setHasExpiry(true);
    setExpiry(null);
    setNote('');
    setModalVisible(true);
  };

  const openEdit = (v) => {
    setEditingId(v.id);
    setBrand(v.brand || '');
    setBrandQuery('');
    setBrandCat('all');
    setKind(v.kind || 'giftcard');
    setCode(v.code || '');
    setPin(v.pin || '');
    setAmount(v.amount ? String(v.amount) : '');
    setMinOrder(v.minOrder ? String(v.minOrder) : '');
    setHasExpiry(!!v.expiry);
    setExpiry(v.expiry || null);
    setNote(v.note || '');
    setModalVisible(true);
  };

  const formValid = brand.trim() && (code.trim() || pin.trim() || toNum(amount) > 0) && (!hasExpiry || !!expiry);

  const save = () => {
    if (!formValid) return;
    const existing = editingId ? items.find((v) => v.id === editingId) : null;
    const now = new Date().toISOString();
    const entry = {
      ...existing,
      id: editingId || makeId(),
      brand: brand.trim(),
      kind,
      code: code.trim(),
      pin: pin.trim(),
      amount: toNum(amount) > 0 ? toNum(amount) : undefined,
      minOrder: toNum(minOrder) > 0 ? toNum(minOrder) : undefined,
      expiry: hasExpiry ? expiry : undefined,
      note: note.trim(),
      used: existing?.used || false,
      usedAt: existing?.usedAt,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    persist(editingId ? items.map((v) => (v.id === editingId ? entry : v)) : [entry, ...items]);
    setModalVisible(false);
  };

  const toggleUsed = (v) => {
    const now = new Date().toISOString();
    persist(items.map((i) => (i.id === v.id ? { ...i, used: !i.used, usedAt: i.used ? undefined : now, updatedAt: now } : i)));
  };

  const remove = (v) =>
    confirmDelete('Delete voucher', `Remove the ${v.brand} ${voucherKind(v.kind).label.toLowerCase()}?`, () =>
      persist(items.filter((i) => i.id !== v.id))
    );

  const copy = async (v, field, value) => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopied(`${v.id}:${field}`);
    setTimeout(() => setCopied(null), 1500);
  };

  const brandMatches = BRANDS.filter(
    (b) =>
      (brandCat === 'all' || b.category === brandCat) &&
      (!brandQuery.trim() || b.name.toLowerCase().includes(brandQuery.trim().toLowerCase()))
  );

  const renderItem = ({ item: v }) => {
    const status = voucherStatus(v, today);
    const k = voucherKind(v.kind);
    const faded = status === 'used' || status === 'expired';
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
          faded && styles.faded,
        ]}
      >
        <View style={styles.cardTop}>
          <BrandBadge name={v.brand} />
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
              {v.brand}
            </Text>
            <Text style={[styles.cardSub, { color: theme.textSecondary }]} numberOfLines={1}>
              {k.label}
              {v.minOrder ? ` · min order ${money(v.minOrder)}` : ''}
            </Text>
          </View>
          {v.amount ? <Text style={[styles.amount, { color: theme.text }]}>{money(v.amount)}</Text> : null}
        </View>

        {v.code ? (
          <View style={[styles.field, { backgroundColor: theme.surfaceAlt }]}>
            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{v.kind === 'giftcard' ? 'CARD NO.' : 'CODE'}</Text>
            <Text style={[styles.fieldValue, { color: theme.text }]} numberOfLines={1} selectable>
              {v.code}
            </Text>
            <TouchableOpacity onPress={() => copy(v, 'code', v.code)} style={styles.fieldBtn} accessibilityLabel={`Copy ${v.brand} code`}>
              <Ionicons name={copied === `${v.id}:code` ? 'checkmark' : 'copy-outline'} size={18} color={theme.primary} />
            </TouchableOpacity>
          </View>
        ) : null}
        {v.pin ? (
          <View style={[styles.field, { backgroundColor: theme.surfaceAlt }]}>
            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>PIN</Text>
            <Text style={[styles.fieldValue, { color: theme.text }]} numberOfLines={1}>
              {revealed[v.id] ? v.pin : '•'.repeat(Math.min(v.pin.length, 8))}
            </Text>
            <TouchableOpacity
              onPress={() => setRevealed((r) => ({ ...r, [v.id]: !r[v.id] }))}
              style={styles.fieldBtn}
              accessibilityLabel={revealed[v.id] ? 'Hide PIN' : 'Show PIN'}
            >
              <Ionicons name={revealed[v.id] ? 'eye-off-outline' : 'eye-outline'} size={18} color={theme.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => copy(v, 'pin', v.pin)} style={styles.fieldBtn} accessibilityLabel={`Copy ${v.brand} PIN`}>
              <Ionicons name={copied === `${v.id}:pin` ? 'checkmark' : 'copy-outline'} size={18} color={theme.primary} />
            </TouchableOpacity>
          </View>
        ) : null}
        {v.note ? <Text style={[styles.note, { color: theme.textSecondary }]}>{v.note}</Text> : null}

        <View style={[styles.cardFoot, { borderTopColor: theme.borderNeutral }]}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[status] }]} />
          <Text style={[styles.expiry, { color: status === 'expiring' || status === 'expired' ? STATUS_COLOR[status] : theme.textMuted }]}>
            {expiryLabel(v, today)}
          </Text>
          <TouchableOpacity onPress={() => toggleUsed(v)} style={styles.footBtn} accessibilityLabel={v.used ? 'Mark as not used' : 'Mark as used'}>
            <Ionicons name={v.used ? 'arrow-undo-outline' : 'checkmark-done-outline'} size={18} color={theme.primary} />
            <Text style={[styles.footText, { color: theme.primary }]}>{v.used ? 'Unused' : 'Used'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openEdit(v)} style={styles.iconBtn} accessibilityLabel={`Edit ${v.brand}`}>
            <Ionicons name="create-outline" size={19} color={theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => remove(v)} style={styles.iconBtn} accessibilityLabel={`Delete ${v.brand}`}>
            <Ionicons name="trash-outline" size={19} color={theme.danger} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const input = [styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="Vouchers & Gift Cards" subtitle="Codes, PINs and balances in one place" />
      <View style={styles.content}>
        <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />

        <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
          <View style={styles.flex}>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Usable value</Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>{money(total)}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Usable</Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>{usableCount}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Expiring in 7 days</Text>
            <Text style={[styles.summaryValue, { color: expiringCount ? '#F59E0B' : theme.text }]}>{expiringCount}</Text>
          </View>
        </View>

        <TextInput
          style={[...input, styles.search]}
          placeholder="Search store, code or note"
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.chip,
                {
                  backgroundColor: filter === f.key ? theme.primary : theme.surface,
                  borderColor: filter === f.key ? theme.primary : theme.borderNeutral,
                },
              ]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.chipText, { color: filter === f.key ? theme.onPrimary : theme.text }]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <FlatList
          data={visible}
          keyExtractor={(v) => v.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="gift-outline" size={56} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                {items.length
                  ? 'Nothing here for this filter.'
                  : 'No vouchers yet. Tap + to save a gift card, voucher or coupon from Amazon, Flipkart, Swiggy, Zomato, redBus and more.'}
              </Text>
            </View>
          }
        />
      </View>

      <TouchableOpacity style={[styles.fab, { backgroundColor: theme.primary }]} onPress={openAdd} accessibilityLabel="Add voucher">
        <Ionicons name="add" size={30} color={theme.onPrimary} />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>{editingId ? 'Edit voucher' : 'Add voucher'}</Text>

              <Text style={[styles.label, { color: theme.textSecondary }]}>Store</Text>
              {brand ? (
                <View style={[styles.pickedBrand, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral }]}>
                  <BrandBadge name={brand} size={36} />
                  <Text style={[styles.pickedName, { color: theme.text }]}>{brand}</Text>
                  <TouchableOpacity onPress={() => setBrand('')} accessibilityLabel="Change store">
                    <Text style={[styles.link, { color: theme.primary }]}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <TextInput
                    style={input}
                    placeholder="Search stores (e.g. Swiggy, redBus)"
                    placeholderTextColor={theme.textMuted}
                    value={brandQuery}
                    onChangeText={setBrandQuery}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.catRow}>
                    {[{ key: 'all', label: 'All' }, ...BRAND_CATEGORIES.filter((c) => c.key !== 'other')].map((c) => (
                      <TouchableOpacity
                        key={c.key}
                        style={[
                          styles.smallChip,
                          {
                            backgroundColor: brandCat === c.key ? theme.primary : theme.surfaceAlt,
                            borderColor: brandCat === c.key ? theme.primary : theme.borderNeutral,
                          },
                        ]}
                        onPress={() => setBrandCat(c.key)}
                      >
                        <Text style={[styles.smallChipText, { color: brandCat === c.key ? theme.onPrimary : theme.text }]}>{c.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <View style={styles.brandGrid}>
                    {brandMatches.slice(0, 40).map((b) => (
                      <TouchableOpacity key={b.name} style={styles.brandCell} onPress={() => setBrand(b.name)} accessibilityLabel={`Store ${b.name}`}>
                        <BrandBadge name={b.name} size={40} />
                        <Text style={[styles.brandName, { color: theme.text }]} numberOfLines={2}>
                          {b.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {brandQuery.trim() && !BRANDS.some((b) => b.name.toLowerCase() === brandQuery.trim().toLowerCase()) ? (
                    <TouchableOpacity
                      style={[styles.otherBtn, { borderColor: theme.borderNeutral }]}
                      onPress={() => setBrand(brandQuery.trim())}
                      accessibilityLabel="Use typed store name"
                    >
                      <Ionicons name="add-circle-outline" size={18} color={theme.primary} />
                      <Text style={[styles.link, { color: theme.primary }]}>Use “{brandQuery.trim()}”</Text>
                    </TouchableOpacity>
                  ) : null}
                  {brandMatches.length > 40 ? (
                    <Text style={[styles.hint, { color: theme.textMuted }]}>
                      {brandMatches.length - 40} more — search or pick a category to narrow it down.
                    </Text>
                  ) : null}
                </>
              )}

              <Text style={[styles.label, { color: theme.textSecondary }]}>Type</Text>
              <View style={[styles.segment, { backgroundColor: theme.surfaceAlt }]}>
                {VOUCHER_KINDS.map((k) => (
                  <TouchableOpacity
                    key={k.key}
                    style={[styles.segmentItem, kind === k.key && { backgroundColor: theme.sheet }]}
                    onPress={() => setKind(k.key)}
                  >
                    <Text style={[styles.segmentText, { color: theme.text }]}>{k.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={input}
                placeholder={kind === 'giftcard' ? 'Card number / code' : 'Voucher or coupon code'}
                placeholderTextColor={theme.textMuted}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              {kind !== 'coupon' ? (
                <TextInput
                  style={input}
                  placeholder="PIN (if any)"
                  placeholderTextColor={theme.textMuted}
                  value={pin}
                  onChangeText={setPin}
                  secureTextEntry
                  autoCorrect={false}
                />
              ) : null}
              <View style={styles.row2}>
                <TextInput
                  style={[...input, styles.flex]}
                  placeholder={kind === 'coupon' ? 'Discount (₹)' : 'Value / balance (₹)'}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={setAmount}
                />
                <TextInput
                  style={[...input, styles.flex]}
                  placeholder="Min order (₹)"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  value={minOrder}
                  onChangeText={setMinOrder}
                />
              </View>

              <TouchableOpacity style={styles.toggle} onPress={() => setHasExpiry((v) => !v)} accessibilityLabel="Has an expiry date">
                <Ionicons name={hasExpiry ? 'checkbox' : 'square-outline'} size={20} color={theme.primary} />
                <Text style={[styles.toggleText, { color: theme.text }]}>
                  Expiry date{hasExpiry && expiry ? ` · ${formatDate(expiry)}` : hasExpiry ? ' (pick below)' : ' — never expires'}
                </Text>
              </TouchableOpacity>
              {hasExpiry ? <DatePicker value={expiry} onChange={setExpiry} /> : null}

              <TextInput
                style={[...input, styles.noteInput]}
                placeholder="Note (e.g. from Diwali bonus, use on app only)"
                placeholderTextColor={theme.textMuted}
                value={note}
                onChangeText={setNote}
                multiline
              />
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Codes and PINs sync to your server like your saved passwords. PINs stay hidden until you tap the eye.
              </Text>

              <View style={styles.actions}>
                <TouchableOpacity style={[styles.cancel, { backgroundColor: theme.surfaceAlt }]} onPress={() => setModalVisible(false)}>
                  <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: theme.primary }, !formValid && styles.disabled]}
                  onPress={save}
                  disabled={!formValid}
                >
                  <Text style={[styles.saveText, { color: theme.onPrimary }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  flex: { flex: 1 },
  summary: {
    flexDirection: 'row',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryLabel: { fontSize: 11, fontWeight: '600' },
  summaryValue: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, marginBottom: 10 },
  search: { marginBottom: 8 },
  chipRow: { flexGrow: 0, marginBottom: 10 },
  chips: { gap: 8, paddingRight: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: '600' },
  list: { paddingBottom: 100 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  faded: { opacity: 0.6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  badge: { alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFF', fontWeight: '800' },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  amount: { fontSize: 18, fontWeight: '800' },
  field: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingLeft: 10, marginBottom: 6 },
  fieldLabel: { fontSize: 10, fontWeight: '700', width: 62, letterSpacing: 0.5 },
  fieldValue: { flex: 1, fontSize: 15, fontWeight: '600', letterSpacing: 1, paddingVertical: 9 },
  fieldBtn: { padding: 9 },
  note: { fontSize: 13, marginTop: 2, marginBottom: 4 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, marginTop: 6, paddingTop: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  expiry: { flex: 1, fontSize: 12, fontWeight: '600' },
  footBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 4 },
  footText: { fontSize: 13, fontWeight: '600' },
  iconBtn: { padding: 5 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  overlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '700', marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 8, letterSpacing: 0.5 },
  catRow: { flexGrow: 0, marginBottom: 10 },
  smallChip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  smallChipText: { fontSize: 12, fontWeight: '600' },
  brandGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  brandCell: { width: '25%', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 2, gap: 4 },
  brandName: { fontSize: 11, textAlign: 'center' },
  otherBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 10 },
  pickedBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 12 },
  pickedName: { flex: 1, fontSize: 15, fontWeight: '700' },
  link: { fontSize: 14, fontWeight: '600' },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 12 },
  segmentItem: { flex: 1, alignItems: 'center', borderRadius: 10, paddingVertical: 8 },
  segmentText: { fontSize: 13, fontWeight: '600' },
  row2: { flexDirection: 'row', gap: 10 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, marginBottom: 6 },
  toggleText: { fontSize: 14, fontWeight: '600' },
  noteInput: { minHeight: 60, textAlignVertical: 'top', marginTop: 8 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6, marginBottom: 10 },
  cancel: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
