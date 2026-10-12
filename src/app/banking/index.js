import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Modal,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import Header from '../../components/Header';
import SyncRow from '../../components/SyncRow';
import CardScanner from '../../components/CardScanner';
import CardGridEditor from '../../components/CardGridEditor';
import { useTheme } from '../../hooks/useTheme';
import { useSyncedCollection } from '../../hooks/useSyncedCollection';

const STORAGE_KEY = '@diarybyte_banking';
const CARDS_STORAGE_KEY = '@diarybyte_cards';

const CARD_TYPES = ['Debit', 'Credit'];

// Brand detection from the card number prefix.
const detectBrand = (num) => {
  const n = (num || '').replace(/\D/g, '');
  if (!n) return null;
  if (/^4/.test(n)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard';
  if (/^3[47]/.test(n)) return 'Amex';
  if (/^3(0[0-5]|[68])/.test(n)) return 'Diners';
  if (/^(6011|64[4-9]|65)/.test(n)) return 'Discover';
  if (/^(60|65|81|82|508)/.test(n)) return 'RuPay';
  return null;
};

const BRAND_GRADIENTS = {
  Visa: ['#283593', '#42A5F5'],
  Mastercard: ['#BF360C', '#FB8C00'],
  Amex: ['#004D40', '#26A69A'],
  RuPay: ['#1B5E20', '#66BB6A'],
  Discover: ['#4A148C', '#7E57C2'],
  Diners: ['#263238', '#546E7A'],
};

const brandGradient = (brand) => BRAND_GRADIENTS[brand] || ['#37474F', '#78909C'];

const formatCardNumber = (num) =>
  (num || '')
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim();

const formatExpiry = (text) => {
  const digits = text.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

const maskCardNumber = (num) => {
  const digits = (num || '').replace(/\D/g, '');
  const last4 = digits.slice(-4);
  const groups = Math.max(Math.ceil(digits.length / 4), 4) - 1;
  return `${'•••• '.repeat(groups).trim()} ${last4}`.trim();
};

const makeId = () =>
  `${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`;

export default function BankingScreen() {
  const { theme } = useTheme();
  const { items, synced, persist, pulling, pullInfo, pullNow } = useSyncedCollection(
    'banking',
    STORAGE_KEY
  );
  const {
    items: cards,
    synced: cardsSynced,
    persist: persistCards,
    pulling: cardsPulling,
    pullInfo: cardsPullInfo,
    pullNow: cardsPullNow,
  } = useSyncedCollection('cards', CARDS_STORAGE_KEY);

  const [tab, setTab] = useState('accounts');

  // Account state
  const [modalVisible, setModalVisible] = useState(false);
  const [bankName, setBankName] = useState('');
  const [accountType, setAccountType] = useState('Savings');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upiId, setUpiId] = useState('');
  const [balance, setBalance] = useState('');
  const [revealed, setRevealed] = useState({});

  // Card state
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [scanMode, setScanMode] = useState(true);
  const [scanInput, setScanInput] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardType, setCardType] = useState('Debit');
  const [cardBank, setCardBank] = useState('');
  const [cardRevealed, setCardRevealed] = useState({});
  const [copied, setCopied] = useState(null);
  const [gridEditorCard, setGridEditorCard] = useState(null);

  // ------- account actions -------

  const addItem = () => {
    if (!bankName.trim() || !accountNumber.trim()) return;
    const parsedBalance = parseFloat(balance.replace(/[^\d.]/g, ''));
    const entry = {
      id: makeId(),
      bankName: bankName.trim(),
      accountType,
      accountNumber: accountNumber.trim(),
      ifsc: ifsc.trim().toUpperCase(),
      upiId: upiId.trim(),
      balance: balance.trim() !== '' && !Number.isNaN(parsedBalance) ? parsedBalance : null,
      createdAt: new Date().toISOString(),
    };
    persist([entry, ...items]);
    setBankName('');
    setAccountType('Savings');
    setAccountNumber('');
    setIfsc('');
    setUpiId('');
    setBalance('');
    setModalVisible(false);
  };

  const deleteItem = (id) => {
    Alert.alert('Delete Account', 'Remove this banking detail?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => persist(items.filter((i) => i.id !== id)),
      },
    ]);
  };

  const maskAccount = (num) => {
    if (num.length <= 4) return num;
    return '•'.repeat(num.length - 4) + num.slice(-4);
  };

  const field = (icon, label, value) => (
    <View style={styles.fieldRow}>
      <Ionicons name={icon} size={15} color={theme.textMuted} />
      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: theme.textSecondary }]} numberOfLines={1}>
        {value || '—'}
      </Text>
    </View>
  );

  // ------- card actions -------

  const openAddCard = () => {
    setScanMode(true);
    setScanInput('');
    setCardName('');
    setCardNumber('');
    setExpiry('');
    setCvv('');
    setCardType('Debit');
    setCardBank('');
    setCardModalVisible(true);
  };

  // "Scan": paste or type the printed number — auto-formats and detects the brand.
  const applyScan = () => {
    const digits = scanInput.replace(/\D/g, '');
    if (digits.length < 12) return;
    setCardNumber(formatCardNumber(digits));
    setScanMode(false);
  };

  // Camera scan result: jump straight to the form with number + expiry prefilled.
  const handleCardDetected = ({ number, expiry: detectedExpiry }) => {
    setScannerVisible(false);
    setCardModalVisible(true);
    setCardNumber(formatCardNumber(number));
    if (detectedExpiry) setExpiry(detectedExpiry);
    setScanMode(false);
  };

  const addCard = () => {
    const digits = cardNumber.replace(/\D/g, '');
    if (!cardName.trim() || digits.length < 12 || !expiry.trim() || !cvv.trim()) return;
    persistCards([
      {
        id: makeId(),
        name: cardName.trim(),
        number: digits,
        expiry: expiry.trim(),
        cvv: cvv.trim(),
        cardType,
        bankName: cardBank.trim(),
        brand: detectBrand(digits) || 'Card',
        createdAt: new Date().toISOString(),
      },
      ...cards,
    ]);
    setCardModalVisible(false);
  };

  const deleteCard = (id) => {
    Alert.alert('Delete Card', 'Remove this card?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => persistCards(cards.filter((c) => c.id !== id)),
      },
    ]);
  };

  const copyCardField = async (card, key, value) => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopied({ id: card.id, key });
    setTimeout(() => setCopied(null), 1500);
  };

  // Save the A-P verification grid onto a debit card.
  const saveGrid = (grid) => {
    if (!gridEditorCard) return;
    persistCards(
      cards.map((c) => (c.id === gridEditorCard.id ? { ...c, grid } : c))
    );
    setGridEditorCard(null);
  };

  const copyBtn = (card, key, label, value, masked) => (
    <TouchableOpacity
      style={[
        styles.copyBtn,
        { backgroundColor: copied && copied.id === card.id && copied.key === key ? theme.primary : theme.surfaceAlt },
      ]}
      onPress={() => copyCardField(card, key, value)}
      disabled={!value}
    >
      <Ionicons
        name={copied && copied.id === card.id && copied.key === key ? 'checkmark' : 'copy-outline'}
        size={13}
        color={theme.textSecondary}
      />
      <Text style={[styles.copyBtnText, { color: theme.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderCardTile = ({ item }) => {
    const isRevealed = cardRevealed[item.id];
    const gradient = brandGradient(item.brand);
    const displayNumber = isRevealed ? formatCardNumber(item.number) : maskCardNumber(item.number);
    return (
      <View style={styles.cardWrap}>
        <LinearGradient colors={gradient} style={styles.cardTile} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={styles.cardTopRow}>
            <View style={styles.chipIcon}>
              <View style={styles.chipLine} />
              <View style={styles.chipLine} />
              <View style={styles.chipLine} />
            </View>
            <View style={styles.cardTopMeta}>
              {item.bankName ? (
                <Text style={styles.cardBankName} numberOfLines={1}>
                  {item.bankName}
                </Text>
              ) : null}
              <Text style={styles.cardTypeText}>
                {item.cardType || 'Debit'} Card
              </Text>
            </View>
            <Text style={styles.cardBrand}>{item.brand || 'CARD'}</Text>
          </View>

          <Text style={styles.cardNumber}>{displayNumber}</Text>

          <View style={styles.cardBottomRow}>
            <View style={styles.cardHolderMeta}>
              <Text style={styles.cardMiniLabel}>CARD HOLDER</Text>
              <Text style={styles.cardName} numberOfLines={1}>
                {item.name}
              </Text>
            </View>
            <View style={styles.cardHolderMeta}>
              <Text style={styles.cardMiniLabel}>EXPIRES</Text>
              <Text style={styles.cardName}>{item.expiry}</Text>
            </View>
            <View style={styles.cardHolderMeta}>
              <Text style={styles.cardMiniLabel}>CVV</Text>
              <Text style={styles.cardName}>
                {isRevealed ? item.cvv : '•••'}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() =>
              setCardRevealed((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
            }
          >
            <Ionicons
              name={isRevealed ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={theme.textSecondary}
            />
          </TouchableOpacity>
          <View style={styles.copyRow}>
            {copyBtn(item, 'name', 'Name', item.name)}
            {copyBtn(item, 'number', 'Number', item.number)}
            {copyBtn(item, 'expiry', 'Expiry', item.expiry)}
            {copyBtn(item, 'cvv', 'CVV', item.cvv)}
            {(item.cardType || 'Debit') === 'Debit' ? (
              <TouchableOpacity
                style={[
                  styles.copyBtn,
                  {
                    backgroundColor:
                      item.grid && Object.keys(item.grid).length ? theme.secondary : theme.surfaceAlt,
                  },
                ]}
                onPress={() => setGridEditorCard(item)}
              >
                <Ionicons name="grid-outline" size={13} color={theme.textSecondary} />
                <Text style={[styles.copyBtnText, { color: theme.textSecondary }]}>
                  {item.grid && Object.keys(item.grid).length ? 'Grid ✓' : 'Grid'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteCard(item.id)}>
            <Ionicons name="trash-outline" size={19} color={theme.danger} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const scanBrand = detectBrand(scanInput);
  const cardDigits = cardNumber.replace(/\D/g, '');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Header title="Banking Details" subtitle="Accounts and cards, synced to your cloud" />

      <View style={styles.content}>
        <View
          style={[
            styles.tabBar,
            { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral },
          ]}
        >
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'accounts' && { backgroundColor: theme.accent }]}
            onPress={() => setTab('accounts')}
          >
            <Ionicons name="business-outline" size={15} color={theme.text} style={{ marginRight: 6 }} />
            <Text style={[styles.tabBtnText, { color: theme.text }]}>Bank Accounts</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'cards' && { backgroundColor: theme.secondary }]}
            onPress={() => setTab('cards')}
          >
            <Ionicons name="card-outline" size={15} color={theme.text} style={{ marginRight: 6 }} />
            <Text style={[styles.tabBtnText, { color: theme.text }]}>Cards</Text>
          </TouchableOpacity>
        </View>

        {tab === 'accounts' ? (
          <>
            <SyncRow synced={synced} pulling={pulling} pullInfo={pullInfo} onPull={pullNow} />

            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="business-outline" size={56} color={theme.textMuted} />
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                    No accounts saved yet. Tap + to add one.
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      shadowColor: theme.shadow,
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.bankIcon, { backgroundColor: theme.accent + '33' }]}>
                      <Ionicons name="business-outline" size={20} color={theme.accent} />
                    </View>
                    <View style={styles.bankMeta}>
                      <Text style={[styles.bankName, { color: theme.text }]} numberOfLines={1}>
                        {item.bankName}
                      </Text>
                      <Text style={[styles.bankType, { color: theme.textMuted }]}>
                        {item.accountType}
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteItem(item.id)}>
                      <Ionicons name="trash-outline" size={20} color={theme.danger} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.fieldRow}>
                    <Ionicons name="card-outline" size={15} color={theme.textMuted} />
                    <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>A/C</Text>
                    <Text style={[styles.fieldValue, { color: theme.textSecondary }]}>
                      {revealed[item.id] ? item.accountNumber : maskAccount(item.accountNumber)}
                    </Text>
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() =>
                        setRevealed((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                      }
                    >
                      <Ionicons
                        name={revealed[item.id] ? 'eye-off-outline' : 'eye-outline'}
                        size={17}
                        color={theme.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                  {field('hash-outline', 'IFSC', item.ifsc)}
                  {field('phone-portrait-outline', 'UPI', item.upiId)}
                  {item.balance != null
                    ? field(
                        'cash-outline',
                        'Bal',
                        `₹${Number(item.balance).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                      )
                    : null}
                </View>
              )}
            />
          </>
        ) : (
          <>
            <SyncRow
              synced={cardsSynced}
              pulling={cardsPulling}
              pullInfo={cardsPullInfo}
              onPull={cardsPullNow}
            />

            <FlatList
              data={cards}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="card-outline" size={56} color={theme.textMuted} />
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                    No cards saved yet. Tap + to scan or add one.
                  </Text>
                </View>
              }
              renderItem={renderCardTile}
            />
          </>
        )}
      </View>

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.secondary, shadowColor: theme.secondary }]}
        onPress={() => (tab === 'cards' ? openAddCard() : setModalVisible(true))}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.surface }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: theme.text }]}>Add Account</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder="Bank name"
                placeholderTextColor={theme.textMuted}
                value={bankName}
                onChangeText={setBankName}
              />
              <View style={styles.typeRow}>
                {['Savings', 'Current', 'Salary'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: accountType === type ? theme.accent : theme.surfaceAlt,
                        borderColor: accountType === type ? theme.accent : theme.borderNeutral,
                      },
                    ]}
                    onPress={() => setAccountType(type)}
                  >
                    <Text style={[styles.chipText, { color: theme.text }]}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder="Account number"
                placeholderTextColor={theme.textMuted}
                keyboardType="numeric"
                value={accountNumber}
                onChangeText={setAccountNumber}
              />
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder="IFSC code"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="characters"
                value={ifsc}
                onChangeText={setIfsc}
              />
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder="UPI ID (optional)"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                value={upiId}
                onChangeText={setUpiId}
              />
              <TextInput
                style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                placeholder="Current balance (₹, optional)"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                value={balance}
                onChangeText={setBalance}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: theme.primary }, (!bankName.trim() || !accountNumber.trim()) && styles.btnDisabled]}
                  onPress={addItem}
                  disabled={!bankName.trim() || !accountNumber.trim()}
                >
                  <Text style={[styles.saveText, { color: theme.text }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={cardModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCardModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: theme.surface }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: theme.text }]}>Add Card</Text>

              {scanMode ? (
                <View>
                  {Platform.OS !== 'web' ? (
                    <TouchableOpacity
                      style={[styles.cameraScanBtn, { backgroundColor: theme.secondary }]}
                      onPress={() => setScannerVisible(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="camera-outline" size={22} color="#FFF" />
                      <Text style={styles.cameraScanText}>Scan with camera</Text>
                    </TouchableOpacity>
                  ) : null}
                  <View style={styles.scanHeader}>
                    <Ionicons name="scan-outline" size={40} color={theme.secondary} />
                    <Text style={[styles.scanTitle, { color: theme.text }]}>Scan Card</Text>
                    <Text style={[styles.scanHint, { color: theme.textSecondary }]}>
                      Type or paste the long number printed on your card. We&apos;ll auto-format it
                      and detect the card brand.
                    </Text>
                  </View>
                  <TextInput
                    style={[
                      styles.input,
                      styles.scanInput,
                      { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text },
                    ]}
                    placeholder="e.g. 4111 1111 1111 1111"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="numeric"
                    value={formatCardNumber(scanInput)}
                    onChangeText={(text) => setScanInput(text.replace(/\D/g, '').slice(0, 19))}
                    autoFocus
                  />
                  {scanBrand ? (
                    <View style={[styles.brandBadge, { backgroundColor: theme.secondary + '33' }]}>
                      <Ionicons name="card-outline" size={14} color={theme.secondary} />
                      <Text style={[styles.brandBadgeText, { color: theme.text }]}>
                        {scanBrand} detected
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.scanCount, { color: theme.textMuted }]}>
                      {scanInput.length === 0
                        ? 'Enter at least 12 digits to continue'
                        : `${scanInput.length} digits · ${Math.max(12 - scanInput.length, 0)} more needed`}
                    </Text>
                  )}
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                      onPress={() => setScanMode(false)}
                    >
                      <Text style={[styles.cancelText, { color: theme.textSecondary }]}>
                        Enter manually
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.saveBtn,
                        { backgroundColor: theme.primary },
                        scanInput.length < 12 && styles.btnDisabled,
                      ]}
                      onPress={applyScan}
                      disabled={scanInput.length < 12}
                    >
                      <Text style={[styles.saveText, { color: theme.text }]}>Continue</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View>
                  <View style={styles.numberHeader}>
                    <TextInput
                      style={[
                        styles.input,
                        styles.numberInput,
                        { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text },
                      ]}
                      placeholder="Card number"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="numeric"
                      value={cardNumber}
                      onChangeText={(text) => setCardNumber(formatCardNumber(text))}
                    />
                    {detectBrand(cardDigits) ? (
                      <View style={[styles.brandBadge, { backgroundColor: theme.secondary + '33' }]}>
                        <Text style={[styles.brandBadgeText, { color: theme.text }]}>
                          {detectBrand(cardDigits)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                    placeholder="Name on card"
                    placeholderTextColor={theme.textMuted}
                    autoCapitalize="words"
                    value={cardName}
                    onChangeText={setCardName}
                  />
                  <View style={styles.expiryRow}>
                    <TextInput
                      style={[
                        styles.input,
                        styles.smallInput,
                        { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text },
                      ]}
                      placeholder="MM/YY"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="numeric"
                      value={expiry}
                      onChangeText={(text) => setExpiry(formatExpiry(text))}
                      maxLength={5}
                    />
                    <TextInput
                      style={[
                        styles.input,
                        styles.smallInput,
                        { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text },
                      ]}
                      placeholder="CVV"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="numeric"
                      value={cvv}
                      onChangeText={(text) => setCvv(text.replace(/\D/g, '').slice(0, 4))}
                      maxLength={4}
                      secureTextEntry
                    />
                  </View>
                  <Text style={[styles.fieldLabelText, { color: theme.textSecondary }]}>Card Type</Text>
                  <View style={styles.typeRow}>
                    {CARD_TYPES.map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: cardType === t ? theme.secondary : theme.surfaceAlt,
                            borderColor: cardType === t ? theme.secondary : theme.borderNeutral,
                          },
                        ]}
                        onPress={() => setCardType(t)}
                      >
                        <Text style={[styles.chipText, { color: theme.text }]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderNeutral, color: theme.text }]}
                    placeholder="Bank name (optional)"
                    placeholderTextColor={theme.textMuted}
                    value={cardBank}
                    onChangeText={setCardBank}
                  />
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt }]}
                      onPress={() => setCardModalVisible(false)}
                    >
                      <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.saveBtn,
                        { backgroundColor: theme.primary },
                        (!cardName.trim() || cardDigits.length < 12 || !expiry.trim() || !cvv.trim()) && styles.btnDisabled,
                      ]}
                      onPress={addCard}
                      disabled={!cardName.trim() || cardDigits.length < 12 || !expiry.trim() || !cvv.trim()}
                    >
                      <Text style={[styles.saveText, { color: theme.text }]}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <CardScanner
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onDetected={handleCardDetected}
      />

      <CardGridEditor
        visible={!!gridEditorCard}
        card={gridEditorCard}
        onClose={() => setGridEditorCard(null)}
        onSave={saveGrid}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  tabBtnText: { fontSize: 14, fontWeight: '600' },
  list: { paddingBottom: 90 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { marginTop: 12, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  card: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  bankIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  bankMeta: { flex: 1 },
  bankName: { fontSize: 16, fontWeight: '700' },
  bankType: { fontSize: 12, marginTop: 1 },
  deleteBtn: { padding: 6 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5, gap: 7 },
  fieldLabel: { fontSize: 13, width: 44 },
  fieldValue: { flex: 1, fontSize: 14 },
  eyeBtn: { padding: 4 },

  // ------- card tiles -------
  cardWrap: { marginBottom: 16 },
  cardTile: {
    borderRadius: 18,
    padding: 18,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  chipIcon: {
    width: 40,
    height: 30,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.85)',
    padding: 5,
    justifyContent: 'space-between',
  },
  chipLine: { height: 2, backgroundColor: '#B0BEC5', borderRadius: 1 },
  cardTopMeta: { marginLeft: 10, flex: 1 },
  cardBankName: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600' },
  cardTypeText: { color: '#FFF', fontSize: 12, opacity: 0.8, marginTop: 1 },
  cardBrand: { color: '#FFF', fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  cardNumber: {
    color: '#FFF',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 16,
  },
  cardBottomRow: { flexDirection: 'row', gap: 18 },
  cardHolderMeta: { flex: 1 },
  cardMiniLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 9, letterSpacing: 1 },
  cardName: { color: '#FFF', fontSize: 13, fontWeight: '600', marginTop: 2 },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
  },
  copyRow: { flex: 1, flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  copyBtnText: { fontSize: 11, fontWeight: '600' },

  // ------- modals -------
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 100,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modal: { borderRadius: 20, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600' },

  // ------- scan / card form -------
  cameraScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 18,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  cameraScanText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  scanHeader: { alignItems: 'center', marginBottom: 16 },
  scanCount: { fontSize: 12, textAlign: 'center', marginBottom: 12, marginTop: -4 },
  btnDisabled: { opacity: 0.4 },
  scanTitle: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  scanHint: { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  scanInput: { fontSize: 18, letterSpacing: 1, textAlign: 'center' },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'center',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  brandBadgeText: { fontSize: 12, fontWeight: '700' },
  numberHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  numberInput: { flex: 1, letterSpacing: 1 },
  expiryRow: { flexDirection: 'row', gap: 12 },
  smallInput: { flex: 1 },
  fieldLabelText: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 2,
    letterSpacing: 0.5,
  },
});
