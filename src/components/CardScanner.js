import { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { recognizeText } from 'expo-mlkit-ocr';
import { parseCardText } from '../utils/cardScan';
import { useTheme } from '../hooks/useTheme';

/**
 * Full-screen camera card scanner.
 * Continuously captures frames and runs on-device OCR until a valid
 * card number (Luhn-checked) is found, then calls onDetected.
 */
export default function CardScanner({ visible, onClose, onDetected }) {
  const { theme } = useTheme();
  const cameraRef = useRef(null);
  const busyRef = useRef(false);
  const [torch, setTorch] = useState(false);
  const [status, setStatus] = useState('Scanning…');

  const [permission, requestPermission] = useCameraPermissions();

  const resetAndClose = () => {
    setTorch(false);
    setStatus('Scanning…');
    onClose();
  };

  const resetAndDetected = (parsed) => {
    setTorch(false);
    setStatus('Scanning…');
    onDetected(parsed);
  };

  useEffect(() => {
    if (!visible || !permission?.granted) return;

    let cancelled = false;

    const scanLoop = async () => {
      // Give the camera a moment to warm up before the first capture.
      await new Promise((r) => setTimeout(r, 1500));
      while (!cancelled) {
        if (!busyRef.current && cameraRef.current) {
          busyRef.current = true;
          try {
            const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
            const result = await recognizeText(photo.uri);
            if (cancelled) return;
            const parsed = parseCardText(result?.text);
            if (parsed) {
              setStatus('Card detected!');
              await new Promise((r) => setTimeout(r, 600));
              if (!cancelled) resetAndDetected(parsed);
              return;
            }
          } catch {
            // Frame failed (glare, blur, camera busy) — just try again.
          } finally {
            busyRef.current = false;
          }
        }
        await new Promise((r) => setTimeout(r, 1100));
      }
    };

    scanLoop();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, permission?.granted]);

  if (!visible) return null;

  const renderCamera = () => (
    <View style={styles.cameraWrap}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        enableTorch={torch}
        onMountError={() => setStatus('Camera unavailable')}
      />

      {/* Card guide overlay */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.dimTop} />
        <View style={styles.holeRow}>
          <View style={styles.dimSide} />
          <View style={styles.hole}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <View style={styles.dimSide} />
        </View>
        <View style={styles.dimBottom}>
          <ActivityIndicator size="small" color="#FFF" />
          <Text style={styles.statusText}>{status}</Text>
          <Text style={styles.hintText}>Hold the card steady inside the frame</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={resetAndClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={26} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.torchBtn, torch && styles.torchActive]}
          onPress={() => setTorch((t) => !t)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name={torch ? 'flash' : 'flash-off-outline'} size={22} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPermission = () => (
    <View style={styles.permissionWrap}>
      <Ionicons name="camera-outline" size={56} color={theme.textMuted} />
      <Text style={[styles.permissionTitle, { color: theme.text }]}>Camera Access Needed</Text>
      <Text style={[styles.permissionText, { color: theme.textSecondary }]}>
        Allow camera access to scan your card. The number is read on your device only.
      </Text>
      <TouchableOpacity
        style={[styles.allowBtn, { backgroundColor: theme.primary }]}
        onPress={requestPermission}
      >
        <Text style={[styles.allowText, { color: theme.text }]}>Allow Camera</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.manualFallback} onPress={resetAndClose}>
        <Text style={[styles.manualText, { color: theme.textSecondary }]}>
          Type it in instead
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={resetAndClose}>
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        {permission?.granted ? renderCamera() : renderPermission()}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cameraWrap: { flex: 1 },
  camera: { flex: 1 },

  // Overlay + card-shaped guide hole
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  dimTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  dimBottom: {
    flex: 1.6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  holeRow: { flexDirection: 'row', height: 210 },
  dimSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  hole: {
    flex: 5,
    marginVertical: -0.5,
    borderRadius: 16,
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: '#FFF',
    borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 16 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 16 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 16 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 16 },

  statusText: { color: '#FFF', fontSize: 16, fontWeight: '700', marginTop: 12 },
  hintText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4, textAlign: 'center' },

  controls: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    paddingTop: 54,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchActive: { backgroundColor: 'rgba(255,255,255,0.35)' },

  permissionWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  permissionTitle: { fontSize: 20, fontWeight: '700', marginTop: 16 },
  permissionText: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  allowBtn: { paddingVertical: 13, paddingHorizontal: 32, borderRadius: 14, marginTop: 24 },
  allowText: { fontSize: 15, fontWeight: '700' },
  manualFallback: { marginTop: 16, padding: 8 },
  manualText: { fontSize: 14, fontWeight: '600' },
});
