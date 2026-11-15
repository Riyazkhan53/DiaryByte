import { useState } from 'react';
import { FlatList, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Header from '../../components/Header';
import SyncRow from '../../components/SyncRow';
import DatePicker from '../../components/DatePicker';
import HScroll from '../../components/HScroll';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';
import { confirmDelete } from '../../utils/confirm';
import { formatDate, todayKey } from '../../utils/autopay';
import {
  ASSET_CATEGORIES,
  DEFAULT_LEVELS,
  LIFE_CATEGORIES,
  LIFE_STATUS,
  SECTIONS,
  WEALTH_CATEGORIES,
  WISHLIST_STORAGE_KEY,
  assetCategory,
  assetPct,
  levelsText,
  lifeCategory,
  lifeGroup,
  parseAmount,
  parseLevels,
  sectionSummary,
  shortInr,
  sortItems,
  wealthCategory,
  wealthProgress,
} from '../../utils/wishlist';

const makeId = () => `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const GREEN = '#2DA44E';

const FILTERS = {
  assets: [
    { key: 'open', label: 'To buy' },
    { key: 'bought', label: 'Bought' },
    { key: 'all', label: 'All' },
  ],
  wealth: [],
  life: [
    { key: 'open', label: 'Bucket list' },
    { key: 'experience', label: 'Experiences' },
    { key: 'growth', label: 'Self growth' },
    { key: 'done', label: 'Done' },
  ],
};

function Chip({ label, on, onPress, theme, color }) {
  const c = color || theme.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, { borderColor: on ? c : theme.borderNeutral, backgroundColor: on ? c + '22' : theme.surface }]}
    >
      <Text style={[styles.chipText, { color: on ? c : theme.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Bar({ pct, color, theme }) {
  return (
    <View style={[styles.track, { backgroundColor: theme.surfaceAlt }]}>
      <View style={[styles.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

function Field({ label, theme, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.textMuted}
        style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
        {...props}
      />
    </View>
  );
}

function AssetCard({ item, theme, onEdit, onBought }) {
  const cat = assetCategory(item.category);
  const bought = item.status === 'bought';
  const pct = assetPct(item);
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={() => onEdit(item)} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        <Text style={styles.emoji}>{cat.emoji}</Text>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: theme.text }, bought && styles.doneTitle]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.meta, { color: theme.textMuted }]}>
            {cat.key}
            {item.targetDate && !bought ? ` · by ${formatDate(item.targetDate)}` : ''}
          </Text>
        </View>
        {item.price ? <Text style={[styles.amount, { color: theme.text }]}>{shortInr(item.price)}</Text> : null}
      </View>
      {bought ? (
        <Text style={[styles.status, { color: GREEN }]}>✓ Bought{item.doneAt ? ` on ${formatDate(item.doneAt.slice(0, 10))}` : ''} 🎉</Text>
      ) : (
        <>
          {item.price ? (
            <>
              <Bar pct={pct} color="#FF9F43" theme={theme} />
              <Text style={[styles.meta, { color: theme.textSecondary }]}>
                {inr(item.saved || 0)} saved of {inr(item.price)} · {Math.round(pct * 100)}%
                {item.price - (item.saved || 0) > 0 ? ` · ${shortInr(item.price - (item.saved || 0))} to go` : ''}
              </Text>
            </>
          ) : null}
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => onBought(item)} style={[styles.action, { borderColor: GREEN }]} accessibilityLabel={`Mark ${item.title} as bought`}>
              <Ionicons name="bag-check-outline" size={15} color={GREEN} />
              <Text style={[styles.actionText, { color: GREEN }]}>Bought it</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
      {item.note ? (
        <Text style={[styles.note, { color: theme.textSecondary }]} numberOfLines={2}>
          {item.note}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

function WealthCard({ item, theme, onEdit, investments }) {
  const cat = wealthCategory(item.category);
  const p = wealthProgress(item, investments);
  const all = p.total > 0 && p.done === p.total;
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={() => onEdit(item)} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        <Text style={styles.emoji}>{cat.emoji}</Text>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.meta, { color: theme.textMuted }]}>
            {cat.key} · {item.source === 'auto' && cat.track ? 'live from My Investments' : 'updated by you'}
          </Text>
        </View>
        <Text style={[styles.amount, { color: theme.text }]}>{shortInr(p.value)}</Text>
      </View>
      <View style={styles.levels}>
        {p.levels.map((l, i) => {
          const reached = i < p.done;
          const current = i === p.done;
          return (
            <View
              key={l}
              style={[
                styles.level,
                { borderColor: reached ? GREEN : current ? '#0FB9B1' : theme.borderNeutral, backgroundColor: reached ? GREEN : 'transparent' },
              ]}
            >
              <Text style={[styles.levelText, { color: reached ? '#fff' : current ? '#0FB9B1' : theme.textMuted }]}>
                {reached ? '✓ ' : `L${i + 1} `}
                {shortInr(l)}
              </Text>
            </View>
          );
        })}
      </View>
      {all ? (
        <Text style={[styles.status, { color: GREEN }]}>🏆 All {p.total} levels complete</Text>
      ) : p.total ? (
        <>
          <Bar pct={p.pct} color="#0FB9B1" theme={theme} />
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            Level {p.done + 1} of {p.total}: {shortInr(p.next - p.value)} more to reach {shortInr(p.next)} · {Math.round(p.pct * 100)}%
          </Text>
        </>
      ) : (
        <Text style={[styles.meta, { color: theme.textMuted }]}>Add levels to start climbing</Text>
      )}
    </TouchableOpacity>
  );
}

function LifeCard({ item, theme, onEdit, onStatus }) {
  const cat = lifeCategory(item.category);
  const labels = LIFE_STATUS[cat.group];
  const done = item.status === 'done';
  const color = done ? GREEN : item.status === 'doing' ? '#4B7BEC' : theme.textMuted;
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={() => onEdit(item)} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        <Text style={styles.emoji}>{cat.emoji}</Text>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: theme.text }, done && styles.doneTitle]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.meta, { color: theme.textMuted }]}>
            {cat.key}
            {item.targetDate && !done ? ` · ${formatDate(item.targetDate)}` : ''}
            {done && item.doneAt ? ` · ${formatDate(item.doneAt.slice(0, 10))}` : ''}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: color + '22' }]}>
          <Text style={[styles.badgeText, { color }]}>{labels[item.status || 'todo']}</Text>
        </View>
      </View>
      {item.note ? (
        <Text style={[styles.note, { color: theme.textSecondary }]} numberOfLines={3}>
          {item.note}
        </Text>
      ) : null}
      {!done ? (
        <View style={styles.actions}>
          {item.status !== 'doing' ? (
            <TouchableOpacity onPress={() => onStatus(item, 'doing')} style={[styles.action, { borderColor: '#4B7BEC' }]} accessibilityLabel={`${labels.doing}: ${item.title}`}>
              <Ionicons name={cat.group === 'growth' ? 'school-outline' : 'calendar-outline'} size={15} color="#4B7BEC" />
              <Text style={[styles.actionText, { color: '#4B7BEC' }]}>{labels.doing}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => onStatus(item, 'done')} style={[styles.action, { borderColor: GREEN }]} accessibilityLabel={`${labels.done}: ${item.title}`}>
            <Ionicons name="checkmark-circle-outline" size={15} color={GREEN} />
            <Text style={[styles.actionText, { color: GREEN }]}>{labels.done}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const EMPTY_FORM = { title: '', category: '', price: '', saved: '', current: '', levels: '', source: 'auto', status: '', note: '', hasDate: false, targetDate: todayKey() };

export default function WishlistScreen() {
  const { theme } = useTheme();
  const { items, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection('wishlist', WISHLIST_STORAGE_KEY);
  const { items: investments } = useSyncedCollection('investments', '@diarybyte_investments');
  const [section, setSection] = useState('assets');
  const [filters, setFilters] = useState({ assets: 'open', life: 'open' });
  const [editing, setEditing] = useState(null); // null | 'new' | item
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  const sec = SECTIONS.find((s) => s.key === section);
  const filter = filters[section];
  const inSection = items.filter((i) => i.section === section);
  const visible = sortItems(
    inSection.filter((i) => {
      if (section === 'assets') return filter === 'all' || (filter === 'bought' ? i.status === 'bought' : i.status !== 'bought');
      if (section === 'life') {
        if (filter === 'done') return i.status === 'done';
        if (filter === 'open') return i.status !== 'done';
        return lifeGroup(i) === filter;
      }
      return true;
    })
  );
  const summary = sectionSummary(items, section, investments);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const now = () => new Date().toISOString();

  const openNew = () => {
    const cats = section === 'assets' ? ASSET_CATEGORIES : section === 'wealth' ? WEALTH_CATEGORIES : LIFE_CATEGORIES;
    setForm({ ...EMPTY_FORM, category: cats[0].key, levels: section === 'wealth' ? levelsText(DEFAULT_LEVELS) : '', status: section === 'life' ? 'todo' : 'wish' });
    setError('');
    setEditing('new');
  };
  const openEdit = (item) => {
    setForm({
      ...EMPTY_FORM,
      title: item.title || '',
      category: item.category || '',
      price: item.price ? String(item.price) : '',
      saved: item.saved ? String(item.saved) : '',
      current: item.current ? String(item.current) : '',
      levels: levelsText(item.levels),
      source: item.source || 'manual',
      status: item.status || (section === 'life' ? 'todo' : 'wish'),
      note: item.note || '',
      hasDate: !!item.targetDate,
      targetDate: item.targetDate || todayKey(),
    });
    setError('');
    setEditing(item);
  };
  const close = () => setEditing(null);

  const save = () => {
    const title = form.title.trim();
    if (!title) return setError('Give it a name.');
    const base = { title, category: form.category, note: form.note.trim(), updatedAt: now() };
    let fields;
    if (section === 'assets') {
      const price = form.price.trim() ? parseAmount(form.price) : null;
      const saved = form.saved.trim() ? parseAmount(form.saved) : 0;
      if (form.price.trim() && price == null) return setError('Price: use a number like 85000, 8.5L or 1.2Cr.');
      if (form.saved.trim() && saved == null) return setError('Saved: use a number like 20000 or 2L.');
      const status = form.status === 'bought' ? 'bought' : saved > 0 ? 'saving' : 'wish';
      fields = { ...base, price, saved: saved || 0, targetDate: form.hasDate ? form.targetDate : null, status };
      if (status === 'bought' && editing?.status !== 'bought') fields.doneAt = now();
      if (status !== 'bought') fields.doneAt = null;
    } else if (section === 'wealth') {
      const levels = parseLevels(form.levels);
      if (!levels) return setError('Levels: amounts separated by commas, like 1L, 5L, 10L.');
      const auto = form.source === 'auto' && !!wealthCategory(form.category).track;
      const current = form.current.trim() ? parseAmount(form.current) : 0;
      if (!auto && form.current.trim() && current == null) return setError('Current value: use a number like 250000 or 2.5L.');
      fields = { ...base, levels, source: auto ? 'auto' : 'manual', current: auto ? null : current || 0 };
    } else {
      fields = { ...base, targetDate: form.hasDate ? form.targetDate : null, status: form.status || 'todo' };
      if (fields.status === 'done' && editing?.status !== 'done') fields.doneAt = now();
      if (fields.status !== 'done') fields.doneAt = null;
    }
    if (editing === 'new') persist([{ id: makeId(), section, createdAt: now(), ...fields }, ...items]);
    else persist(items.map((i) => (i.id === editing.id ? { ...i, ...fields } : i)));
    close();
    return undefined;
  };

  const remove = () => {
    const item = editing;
    confirmDelete('Remove from wishlist', `Remove "${item.title}"?`, () => {
      persist(items.filter((i) => i.id !== item.id));
      close();
    });
  };
  const markBought = (item) => persist(items.map((i) => (i.id === item.id ? { ...i, status: 'bought', doneAt: now(), updatedAt: now() } : i)));
  const setStatus = (item, status) =>
    persist(items.map((i) => (i.id === item.id ? { ...i, status, doneAt: status === 'done' ? now() : null, updatedAt: now() } : i)));

  const summaryLine =
    section === 'assets'
      ? summary.count
        ? `${summary.open} to buy · ${shortInr(summary.saved)} saved of ${shortInr(summary.target)} · ${summary.bought} bought`
        : 'Add the home, car or gadget you are saving for'
      : section === 'wealth'
        ? summary.count
          ? `${summary.levelsDone} of ${summary.levelsTotal} levels complete across ${summary.count} goal${summary.count === 1 ? '' : 's'}`
          : 'Set money goals in levels, e.g. Mutual funds: 1L → 5L → 10L'
        : summary.count
          ? `${summary.done} done · ${summary.open} on the bucket list`
          : 'Trips, food to try, places to explore, skills to learn';

  const cats = section === 'assets' ? ASSET_CATEGORIES : section === 'wealth' ? WEALTH_CATEGORIES : LIFE_CATEGORIES;
  const formCat = section === 'life' ? lifeCategory(form.category) : null;
  const levelPreview = section === 'wealth' ? parseLevels(form.levels) : null;
  const tracks = section === 'wealth' && !!wealthCategory(form.category).track;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Header title="My Wishlist" subtitle="Dreams to own, wealth to grow, life to live" />
      <FlatList
        data={visible}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />
            <View style={styles.tabs}>
              {SECTIONS.map((s) => {
                const on = s.key === section;
                const count = items.filter((i) => i.section === s.key).length;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={styles.tabWrap}
                    onPress={() => setSection(s.key)}
                    activeOpacity={0.85}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={s.title}
                  >
                    {on ? (
                      <LinearGradient colors={s.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tab}>
                        <Ionicons name={s.icon} size={20} color="#fff" />
                        <Text style={[styles.tabText, { color: '#fff' }]} numberOfLines={2}>
                          {s.title}
                        </Text>
                        <Text style={[styles.tabCount, { color: '#ffffffcc' }]}>{count}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[styles.tab, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
                        <Ionicons name={s.icon + '-outline'} size={20} color={s.gradient[1]} />
                        <Text style={[styles.tabText, { color: theme.text }]} numberOfLines={2}>
                          {s.title}
                        </Text>
                        <Text style={[styles.tabCount, { color: theme.textMuted }]}>{count}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.secSub, { color: theme.textSecondary }]}>{sec.sub}</Text>
            <Text style={[styles.summary, { color: theme.text }]}>{summaryLine}</Text>
            {FILTERS[section].length ? (
              <HScroll contentContainerStyle={styles.filters}>
                {FILTERS[section].map((f) => (
                  <Chip key={f.key} label={f.label} on={filter === f.key} theme={theme} color={sec.gradient[1]} onPress={() => setFilters((x) => ({ ...x, [section]: f.key }))} />
                ))}
              </HScroll>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={sec.icon + '-outline'} size={52} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              {inSection.length ? 'Nothing here with this filter.' : 'Nothing yet. Tap + to add your first one.'}
            </Text>
          </View>
        }
        renderItem={({ item }) =>
          section === 'assets' ? (
            <AssetCard item={item} theme={theme} onEdit={openEdit} onBought={markBought} />
          ) : section === 'wealth' ? (
            <WealthCard item={item} theme={theme} onEdit={openEdit} investments={investments} />
          ) : (
            <LifeCard item={item} theme={theme} onEdit={openEdit} onStatus={setStatus} />
          )
        }
      />

      <TouchableOpacity onPress={openNew} activeOpacity={0.85} style={styles.fabWrap} accessibilityLabel={`Add to ${sec.title}`}>
        <LinearGradient colors={sec.gradient} style={styles.fab}>
          <Ionicons name="add" size={32} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.sheet }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>
                {editing === 'new' ? 'Add to' : 'Edit'} {sec.title}
              </Text>
              <Field
                theme={theme}
                label="Name"
                value={form.title}
                onChangeText={set('title')}
                placeholder={section === 'assets' ? 'e.g. 2BHK flat, Royal Enfield, MacBook' : section === 'wealth' ? 'e.g. Mutual fund corpus' : 'e.g. Ladakh road trip, Learn swimming'}
              />
              <Text style={[styles.label, { color: theme.textSecondary }]}>Category</Text>
              <View style={styles.wrapChips}>
                {cats.map((c) => (
                  <Chip key={c.key} label={`${c.emoji} ${c.key}`} on={form.category === c.key} theme={theme} color={sec.gradient[1]} onPress={() => set('category')(c.key)} />
                ))}
              </View>

              {section === 'assets' ? (
                <>
                  <View style={styles.row2}>
                    <View style={styles.flex}>
                      <Field theme={theme} label="Price (₹)" value={form.price} onChangeText={set('price')} placeholder="e.g. 8.5L" keyboardType="default" />
                    </View>
                    <View style={styles.flex}>
                      <Field theme={theme} label="Saved so far (₹)" value={form.saved} onChangeText={set('saved')} placeholder="e.g. 50000" />
                    </View>
                  </View>
                  <View style={styles.wrapChips}>
                    <Chip label="🎯 Still to buy" on={form.status !== 'bought'} theme={theme} color={GREEN} onPress={() => set('status')('wish')} />
                    <Chip label="✓ Bought" on={form.status === 'bought'} theme={theme} color={GREEN} onPress={() => set('status')('bought')} />
                  </View>
                </>
              ) : null}

              {section === 'wealth' ? (
                <>
                  {tracks ? (
                    <View style={styles.wrapChips}>
                      <Chip label="🔗 Live from My Investments" on={form.source === 'auto'} theme={theme} color={sec.gradient[1]} onPress={() => set('source')('auto')} />
                      <Chip label="✍️ I'll update it" on={form.source !== 'auto'} theme={theme} color={sec.gradient[1]} onPress={() => set('source')('manual')} />
                    </View>
                  ) : null}
                  {tracks && form.source === 'auto' ? (
                    <Text style={[styles.hint, { color: theme.textMuted }]}>
                      Now: {inr(wealthProgress({ category: form.category, source: 'auto' }, investments).value)} in {wealthCategory(form.category).track === '*' ? 'all investments' : form.category}
                    </Text>
                  ) : (
                    <Field theme={theme} label="Current value (₹)" value={form.current} onChangeText={set('current')} placeholder="e.g. 1.2L" />
                  )}
                  <Field theme={theme} label="Levels (₹, comma separated)" value={form.levels} onChangeText={set('levels')} placeholder="1L, 5L, 10L, 25L" />
                  {levelPreview ? (
                    <Text style={[styles.hint, { color: theme.textMuted }]}>
                      {levelPreview.length} levels: {levelPreview.map((l, i) => `L${i + 1} ${shortInr(l)}`).join(' → ')}
                    </Text>
                  ) : null}
                </>
              ) : null}

              {section === 'life' ? (
                <View style={styles.wrapChips}>
                  {['todo', 'doing', 'done'].map((st) => (
                    <Chip key={st} label={LIFE_STATUS[formCat.group][st]} on={form.status === st} theme={theme} color={sec.gradient[1]} onPress={() => set('status')(st)} />
                  ))}
                </View>
              ) : null}

              {section !== 'wealth' ? (
                <>
                  <TouchableOpacity
                    style={[styles.dateToggle, { backgroundColor: theme.surfaceAlt, borderColor: form.hasDate ? sec.gradient[1] : theme.borderNeutral }]}
                    onPress={() => set('hasDate')(!form.hasDate)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: form.hasDate }}
                    accessibilityLabel="Target date"
                  >
                    <Ionicons name="flag-outline" size={18} color={form.hasDate ? sec.gradient[1] : theme.textMuted} />
                    <Text style={[styles.flex, styles.dateText, { color: theme.text }]}>
                      {form.hasDate ? `Target: ${formatDate(form.targetDate)}` : 'Target date (optional)'}
                    </Text>
                    <Ionicons name={form.hasDate ? 'checkbox' : 'square-outline'} size={20} color={form.hasDate ? sec.gradient[1] : theme.textMuted} />
                  </TouchableOpacity>
                  {form.hasDate ? <DatePicker value={form.targetDate} onChange={set('targetDate')} /> : null}
                </>
              ) : null}

              <Field theme={theme} label="Note" value={form.note} onChangeText={set('note')} placeholder="Why it matters, plan, memories…" multiline style={[styles.input, styles.noteInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]} />
              {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
              <View style={styles.sheetActions}>
                {editing && editing !== 'new' ? (
                  <TouchableOpacity onPress={remove} style={styles.deleteBtn} accessibilityLabel="Remove">
                    <Ionicons name="trash-outline" size={20} color={theme.danger} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={close} style={[styles.btn, { backgroundColor: theme.surfaceAlt }]}>
                  <Text style={[styles.btnText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={save} style={[styles.btn, { backgroundColor: sec.gradient[1] }]}>
                  <Text style={[styles.btnText, { color: '#fff' }]}>{editing === 'new' ? 'Add' : 'Save'}</Text>
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
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 110, width: '100%', maxWidth: 900, alignSelf: 'center' },
  flex: { flex: 1 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 4 },
  tabWrap: { flex: 1 },
  tab: { borderRadius: 16, padding: 10, minHeight: 92, gap: 4 },
  tabText: { fontSize: 13, fontWeight: '800' },
  tabCount: { fontSize: 11, fontWeight: '700' },
  secSub: { fontSize: 12, marginTop: 12 },
  summary: { fontSize: 15, fontWeight: '700', marginTop: 2, marginBottom: 8 },
  filters: { gap: 8, paddingBottom: 10 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: '700' },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 10, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji: { fontSize: 26 },
  title: { fontSize: 16, fontWeight: '800' },
  doneTitle: { opacity: 0.6 },
  meta: { fontSize: 12 },
  amount: { fontSize: 16, fontWeight: '800' },
  note: { fontSize: 12, fontStyle: 'italic' },
  status: { fontSize: 13, fontWeight: '800' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 2 },
  fill: { height: 8, borderRadius: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  actionText: { fontSize: 12, fontWeight: '800' },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  level: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  levelText: { fontSize: 11, fontWeight: '800' },
  empty: { alignItems: 'center', marginTop: 50, gap: 10 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 30 },
  fabWrap: { position: 'absolute', right: 20, bottom: 28, zIndex: 100 },
  fab: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  sheet: { borderRadius: 20, padding: 18, maxHeight: '92%', width: '100%', maxWidth: 560, alignSelf: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  field: { marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  input: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 15 },
  noteInput: { minHeight: 70, textAlignVertical: 'top' },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  row2: { flexDirection: 'row', gap: 10 },
  hint: { fontSize: 12, marginTop: -4, marginBottom: 10 },
  dateToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  dateText: { fontSize: 14, fontWeight: '600' },
  error: { fontSize: 13, marginBottom: 8 },
  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  deleteBtn: { padding: 10 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
});
